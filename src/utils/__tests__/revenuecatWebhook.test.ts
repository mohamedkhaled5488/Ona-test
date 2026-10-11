// The revenuecat-webhook Edge Function's rules (the same file the function
// runs): each event type → the subscriptions row, duplicates, out-of-order
// delivery, transfers, and that the row then drives sync access.
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import {
  applyEvent,
  resolveUserId,
  rowFromSubscriber,
  safeEqual,
  type RcEvent,
  type SubscriptionRow,
} from '../../../supabase/functions/revenuecat-webhook/logic';
import { computeEntitlement, snapshotFromRaw } from '../entitlement';

const USER = '3f2b8c1e-9a4d-4c5e-8f00-112233445566';
const DAY = 86_400_000;
const T = Date.parse('2026-10-08T12:00:00Z');
let n = 0;
const ev = (type: string, extra: Partial<RcEvent> = {}): RcEvent => ({
  id: `evt_${++n}`,
  type,
  app_user_id: USER,
  product_id: 'ona_sync:annual',
  entitlement_ids: ['sync_access'],
  store: 'PLAY_STORE',
  event_timestamp_ms: T + n * 1000,
  expiration_at_ms: T + 365 * DAY,
  ...extra,
});

function apply(current: SubscriptionRow | null, e: RcEvent): SubscriptionRow {
  const r = applyEvent(current, e);
  if (r.action !== 'upsert') throw new Error(`expected upsert, got ${JSON.stringify(r)}`);
  return r.row;
}

// What the app would conclude from this row (through get_entitlement()).
function access(row: SubscriptionRow | null, now = T + 2 * DAY) {
  const raw = {
    server_time: new Date(now).toISOString(),
    trial_started_at: null,
    trial_ends_at: null,
    subscription: row && { status: row.status, expires_at: row.expires_at, is_lifetime: row.is_lifetime, will_renew: row.will_renew, product_id: row.product_id, store: row.store },
  };
  return computeEntitlement(snapshotFromRaw(USER, raw, now), now);
}

describe('each event type updates the row', () => {
  test('INITIAL_PURCHASE → active, renewing, with an expiry', () => {
    const row = apply(null, ev('INITIAL_PURCHASE'));
    expect(row).toMatchObject({ user_id: USER, status: 'active', will_renew: true, is_lifetime: false, product_id: 'ona_sync:annual', store: 'PLAY_STORE' });
    expect(row.expires_at).toBe(new Date(T + 365 * DAY).toISOString());
    expect(access(row)).toMatchObject({ state: 'subscribed', syncAccess: true });
  });

  test('RENEWAL moves the expiry forward', () => {
    const row = apply(apply(null, ev('INITIAL_PURCHASE')), ev('RENEWAL', { expiration_at_ms: T + 730 * DAY }));
    expect(row.expires_at).toBe(new Date(T + 730 * DAY).toISOString());
  });

  test('CANCELLATION keeps access to the end of the period, without renewing', () => {
    const row = apply(apply(null, ev('INITIAL_PURCHASE')), ev('CANCELLATION', { cancel_reason: 'UNSUBSCRIBE' }));
    expect(row).toMatchObject({ status: 'active', will_renew: false });
    expect(access(row)).toMatchObject({ state: 'canceledActive', syncAccess: true });
  });

  test('UNCANCELLATION turns renewal back on', () => {
    let row = apply(null, ev('INITIAL_PURCHASE'));
    row = apply(row, ev('CANCELLATION', { cancel_reason: 'UNSUBSCRIBE' }));
    row = apply(row, ev('UNCANCELLATION'));
    expect(row.will_renew).toBe(true);
    expect(access(row).state).toBe('subscribed');
  });

  test('a refund through support → refunded, no access', () => {
    const row = apply(apply(null, ev('INITIAL_PURCHASE')), ev('CANCELLATION', { cancel_reason: 'CUSTOMER_SUPPORT' }));
    expect(row.status).toBe('refunded');
    expect(access(row)).toMatchObject({ state: 'expired', refunded: true, syncAccess: false });
  });

  test('REFUND_REVERSED restores it', () => {
    let row = apply(null, ev('INITIAL_PURCHASE'));
    row = apply(row, ev('CANCELLATION', { cancel_reason: 'CUSTOMER_SUPPORT' }));
    row = apply(row, ev('REFUND_REVERSED'));
    expect(access(row).syncAccess).toBe(true);
  });

  test('BILLING_ISSUE with a grace period → grace (access continues)', () => {
    const row = apply(apply(null, ev('INITIAL_PURCHASE')), ev('BILLING_ISSUE', { grace_period_expiration_at_ms: T + 16 * DAY }));
    expect(row).toMatchObject({ status: 'grace', expires_at: new Date(T + 16 * DAY).toISOString() });
    expect(access(row)).toMatchObject({ state: 'grace', syncAccess: true });
  });

  test('BILLING_ISSUE without grace → on hold (no sync until fixed)', () => {
    const row = apply(apply(null, ev('INITIAL_PURCHASE')), ev('BILLING_ISSUE', { grace_period_expiration_at_ms: null }));
    expect(row.status).toBe('on_hold');
    expect(access(row)).toMatchObject({ state: 'onHold', syncAccess: false });
  });

  test('RENEWAL after a billing issue → active again', () => {
    let row = apply(null, ev('INITIAL_PURCHASE'));
    row = apply(row, ev('BILLING_ISSUE', { grace_period_expiration_at_ms: null }));
    row = apply(row, ev('RENEWAL', { expiration_at_ms: T + 400 * DAY }));
    expect(access(row).state).toBe('subscribed');
  });

  test('SUBSCRIPTION_PAUSED → paused (no sync)', () => {
    const row = apply(apply(null, ev('INITIAL_PURCHASE')), ev('SUBSCRIPTION_PAUSED'));
    expect(row.status).toBe('paused');
    expect(access(row).syncAccess).toBe(false);
  });

  test('EXPIRATION → expired', () => {
    const row = apply(apply(null, ev('INITIAL_PURCHASE')), ev('EXPIRATION', { expiration_at_ms: T + DAY }));
    expect(row).toMatchObject({ status: 'expired', will_renew: false });
    expect(access(row)).toMatchObject({ state: 'expired', syncAccess: false });
  });

  test('NON_RENEWING_PURCHASE with no end → lifetime, and a later EXPIRATION is ignored', () => {
    const row = apply(null, ev('NON_RENEWING_PURCHASE', { product_id: 'ona_lifetime', expiration_at_ms: null }));
    expect(row).toMatchObject({ status: 'active', is_lifetime: true, expires_at: null });
    expect(access(row)).toMatchObject({ state: 'lifetime', syncAccess: true });
    expect(applyEvent(row, ev('EXPIRATION'))).toEqual({ action: 'skip', reason: 'ignoredType' });
  });

  test('PRODUCT_CHANGE (monthly → annual) keeps access with the new product', () => {
    let row = apply(null, ev('INITIAL_PURCHASE', { product_id: 'ona_sync:monthly', expiration_at_ms: T + 30 * DAY }));
    row = apply(row, ev('PRODUCT_CHANGE', { product_id: 'ona_sync:annual', expiration_at_ms: T + 365 * DAY }));
    expect(row.product_id).toBe('ona_sync:annual');
    expect(access(row).syncAccess).toBe(true);
  });

  test('TEST events and unknown types change nothing', () => {
    expect(applyEvent(null, ev('TEST'))).toEqual({ action: 'skip', reason: 'ignoredType' });
    expect(applyEvent(null, ev('SOMETHING_NEW'))).toEqual({ action: 'skip', reason: 'ignoredType' });
  });

  test('events for other entitlements are ignored', () => {
    expect(applyEvent(null, ev('INITIAL_PURCHASE', { entitlement_ids: ['something_else'] }))).toEqual({ action: 'skip', reason: 'notOurs' });
  });
});

describe('idempotent and order-safe', () => {
  test('the same event twice changes nothing the second time', () => {
    const e = ev('INITIAL_PURCHASE');
    const row = apply(null, e);
    expect(applyEvent(row, e)).toEqual({ action: 'skip', reason: 'duplicate' });
  });

  test('an older event arriving late is ignored (no rollback)', () => {
    const purchase = ev('INITIAL_PURCHASE');
    const expiration = ev('EXPIRATION', { event_timestamp_ms: T - 10 * DAY }); // happened earlier, delivered later
    const row = apply(null, purchase);
    expect(applyEvent(row, expiration)).toEqual({ action: 'skip', reason: 'outOfOrder' });
    expect(access(row).syncAccess).toBe(true);
  });

  test('a retried batch in a scrambled order ends in the same place as the true order', () => {
    const events = [
      ev('INITIAL_PURCHASE'),
      ev('BILLING_ISSUE', { grace_period_expiration_at_ms: T + 16 * DAY }),
      ev('RENEWAL', { expiration_at_ms: T + 400 * DAY }),
      ev('CANCELLATION', { cancel_reason: 'UNSUBSCRIBE', expiration_at_ms: T + 400 * DAY }),
    ];
    const run = (list: RcEvent[]) =>
      list.reduce<SubscriptionRow | null>((row, e) => {
        const r = applyEvent(row, e);
        return r.action === 'upsert' ? r.row : row;
      }, null);
    const inOrder = run(events);
    // The last event always arrives; earlier ones may come late or twice.
    const scrambled = run([events[0], events[3], events[1], events[2], events[3], events[0]]);
    expect(scrambled).toEqual(inOrder);
    expect(access(inOrder)).toMatchObject({ state: 'canceledActive', syncAccess: true });
  });
});

describe('users and transfers', () => {
  test('the Supabase user id is found even if the event leads with an anonymous id', () => {
    expect(resolveUserId(ev('INITIAL_PURCHASE', { app_user_id: '$RCAnonymousID:abc', aliases: ['$RCAnonymousID:abc', USER] }))).toBe(USER);
    expect(applyEvent(null, ev('INITIAL_PURCHASE', { app_user_id: '$RCAnonymousID:abc', original_app_user_id: undefined, aliases: [] }))).toEqual({
      action: 'skip',
      reason: 'unknownUser',
    });
  });

  test('TRANSFER asks for both accounts to be re-read', () => {
    const other = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    expect(applyEvent(null, ev('TRANSFER', { transferred_from: [USER], transferred_to: [other] }))).toEqual({ action: 'refetch', userIds: [USER, other] });
  });

  test('re-reading a subscriber from RevenueCat builds the same kind of row', () => {
    const now = T;
    const active = rowFromSubscriber(USER, {
      entitlements: { sync_access: { expires_date: new Date(now + 30 * DAY).toISOString(), product_identifier: 'ona_sync:monthly' } },
      subscriptions: { 'ona_sync:monthly': { store: 'PLAY_STORE', unsubscribe_detected_at: null } },
    }, now, 'evt_x', now);
    expect(active).toMatchObject({ status: 'active', will_renew: true, is_lifetime: false });
    const gone = rowFromSubscriber(USER, { entitlements: {}, subscriptions: {} }, now, 'evt_y', now);
    expect(gone.status).toBe('expired');
    const lifetime = rowFromSubscriber(USER, { entitlements: { sync_access: { expires_date: null, product_identifier: 'ona_lifetime' } }, subscriptions: {} }, now, 'evt_z', now);
    expect(lifetime).toMatchObject({ status: 'active', is_lifetime: true });
  });
});

describe('the auth header check', () => {
  test('exact match only', () => {
    expect(safeEqual('Bearer s3cret', 'Bearer s3cret')).toBe(true);
    expect(safeEqual('Bearer s3cre', 'Bearer s3cret')).toBe(false);
    expect(safeEqual('', 'Bearer s3cret')).toBe(false);
  });
});
