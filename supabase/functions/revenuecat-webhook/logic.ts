// RevenueCat webhook → the `subscriptions` row. Pure and dependency-free, so
// the Edge Function (Deno) and the app's Jest tests run exactly this code.
//
// Rules:
// - Each event updates one user's row: status, expiry, renewal, lifetime.
// - Duplicates (same event id) change nothing.
// - Events older than the last one applied change nothing, so retries and
//   out-of-order delivery can't roll a subscription back.
// - TRANSFER events don't carry enough to rebuild the row, so the function
//   re-reads those users from RevenueCat's API instead.

export const ENTITLEMENT_ID = 'sync_access';

export type SubscriptionStatus = 'active' | 'canceled' | 'grace' | 'on_hold' | 'paused' | 'expired' | 'refunded';

export interface SubscriptionRow {
  user_id: string;
  entitlement: string;
  product_id: string | null;
  store: string | null;
  status: SubscriptionStatus;
  is_lifetime: boolean;
  will_renew: boolean;
  expires_at: string | null;
  last_event_id: string | null;
  last_event_at: string | null;
}

// The fields of a RevenueCat webhook event that Ona reads.
export interface RcEvent {
  id: string;
  type: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  product_id?: string;
  entitlement_ids?: string[] | null;
  store?: string;
  event_timestamp_ms: number;
  expiration_at_ms?: number | null;
  grace_period_expiration_at_ms?: number | null;
  cancel_reason?: string | null;
  transferred_from?: string[];
  transferred_to?: string[];
  environment?: string;
}

export type WebhookAction =
  | { action: 'upsert'; row: SubscriptionRow }
  | { action: 'skip'; reason: 'duplicate' | 'outOfOrder' | 'notOurs' | 'unknownUser' | 'ignoredType' }
  | { action: 'refetch'; userIds: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The app logs in to RevenueCat with the Supabase user id, so that's the id
// we look for. Anonymous RevenueCat ids ($RCAnonymousID:…) can't be matched.
export function resolveUserId(e: RcEvent): string | null {
  for (const id of [e.app_user_id, e.original_app_user_id, ...(e.aliases ?? [])]) {
    if (id && UUID.test(id)) return id.toLowerCase();
  }
  return null;
}

function iso(ms: number | null | undefined): string | null {
  return typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function applyEvent(current: SubscriptionRow | null, e: RcEvent): WebhookAction {
  if (e.type === 'TEST') return { action: 'skip', reason: 'ignoredType' };

  if (e.type === 'TRANSFER') {
    const ids = [...(e.transferred_from ?? []), ...(e.transferred_to ?? [])].filter((id) => UUID.test(id)).map((id) => id.toLowerCase());
    return ids.length ? { action: 'refetch', userIds: ids } : { action: 'skip', reason: 'unknownUser' };
  }

  // Events for other entitlements (if any are ever added) aren't ours.
  if (e.entitlement_ids && e.entitlement_ids.length > 0 && !e.entitlement_ids.includes(ENTITLEMENT_ID)) {
    return { action: 'skip', reason: 'notOurs' };
  }

  const userId = resolveUserId(e);
  if (!userId) return { action: 'skip', reason: 'unknownUser' };

  if (current?.last_event_id === e.id) return { action: 'skip', reason: 'duplicate' };
  if (current?.last_event_at && Date.parse(current.last_event_at) > e.event_timestamp_ms) {
    return { action: 'skip', reason: 'outOfOrder' };
  }

  const base: SubscriptionRow = current ?? {
    user_id: userId,
    entitlement: ENTITLEMENT_ID,
    product_id: null,
    store: null,
    status: 'expired',
    is_lifetime: false,
    will_renew: false,
    expires_at: null,
    last_event_id: null,
    last_event_at: null,
  };
  const row: SubscriptionRow = {
    ...base,
    user_id: userId,
    product_id: e.product_id ?? base.product_id,
    store: e.store ?? base.store,
    last_event_id: e.id,
    last_event_at: new Date(e.event_timestamp_ms).toISOString(),
  };

  switch (e.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'PRODUCT_CHANGE':
    case 'SUBSCRIPTION_EXTENDED':
    case 'TEMPORARY_ENTITLEMENT_GRANT':
    case 'REFUND_REVERSED':
      return { action: 'upsert', row: { ...row, status: 'active', will_renew: true, expires_at: iso(e.expiration_at_ms) ?? row.expires_at } };

    case 'NON_RENEWING_PURCHASE': {
      // A one-time purchase with no end date is the lifetime plan.
      const lifetime = !e.expiration_at_ms;
      return { action: 'upsert', row: { ...row, status: 'active', is_lifetime: lifetime || row.is_lifetime, will_renew: false, expires_at: lifetime ? null : iso(e.expiration_at_ms) } };
    }

    case 'CANCELLATION':
      // A refund through support arrives as a cancellation with this reason.
      if (e.cancel_reason === 'CUSTOMER_SUPPORT') {
        return { action: 'upsert', row: { ...row, status: 'refunded', will_renew: false, is_lifetime: false } };
      }
      // Otherwise: no more renewals, but access continues to the end of the period.
      return { action: 'upsert', row: { ...row, status: row.status === 'grace' ? 'grace' : 'active', will_renew: false, expires_at: iso(e.expiration_at_ms) ?? row.expires_at } };

    case 'BILLING_ISSUE': {
      const graceEnds = iso(e.grace_period_expiration_at_ms);
      return graceEnds
        ? { action: 'upsert', row: { ...row, status: 'grace', expires_at: graceEnds } }
        : { action: 'upsert', row: { ...row, status: 'on_hold' } };
    }

    case 'SUBSCRIPTION_PAUSED':
      return { action: 'upsert', row: { ...row, status: 'paused', will_renew: true } };

    case 'EXPIRATION':
      if (row.is_lifetime) return { action: 'skip', reason: 'ignoredType' };
      return { action: 'upsert', row: { ...row, status: 'expired', will_renew: false, expires_at: iso(e.expiration_at_ms) ?? row.expires_at } };

    default:
      return { action: 'skip', reason: 'ignoredType' };
  }
}

// From RevenueCat's REST API (GET /v1/subscribers/{id}), used for TRANSFER.
export interface RcSubscriberEntitlement {
  expires_date: string | null;
  product_identifier: string;
  grace_period_expires_date?: string | null;
}
export interface RcSubscriber {
  entitlements: Record<string, RcSubscriberEntitlement | undefined>;
  subscriptions: Record<string, { unsubscribe_detected_at?: string | null; billing_issues_detected_at?: string | null; store?: string } | undefined>;
  non_subscriptions?: Record<string, unknown[]>;
}

export function rowFromSubscriber(userId: string, sub: RcSubscriber, nowMs: number, eventId: string, eventAtMs: number): SubscriptionRow {
  const ent = sub.entitlements[ENTITLEMENT_ID];
  const base = { user_id: userId, entitlement: ENTITLEMENT_ID, last_event_id: eventId, last_event_at: new Date(eventAtMs).toISOString() };
  if (!ent) {
    return { ...base, product_id: null, store: null, status: 'expired', is_lifetime: false, will_renew: false, expires_at: null };
  }
  const info = sub.subscriptions[ent.product_identifier];
  const lifetime = ent.expires_date === null;
  const expires = ent.expires_date ? Date.parse(ent.expires_date) : null;
  const inGrace = !!ent.grace_period_expires_date && Date.parse(ent.grace_period_expires_date) > nowMs;
  const active = lifetime || (expires !== null && expires > nowMs);
  const status: SubscriptionStatus = inGrace ? 'grace' : active ? 'active' : info?.billing_issues_detected_at ? 'on_hold' : 'expired';
  return {
    ...base,
    product_id: ent.product_identifier,
    store: info?.store ?? null,
    status,
    is_lifetime: lifetime,
    will_renew: !lifetime && !info?.unsubscribe_detected_at,
    expires_at: inGrace ? ent.grace_period_expires_date! : ent.expires_date,
  };
}

// Constant-time comparison for the Authorization header.
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
