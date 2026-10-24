// Who has sync access, and why. Pure functions: the server's answer goes in,
// a plan state comes out. Screens never look at RevenueCat or trial dates
// themselves; they use useEntitlement(), which calls computeEntitlement().
//
//   syncAccess = lifetime OR subscription active (including grace) OR app trial active
//
// Only sync is gated. Local data is readable, editable and exportable on
// every plan, in every state.
import { FREE_CAPS, type CapId } from '../config/plans';
import type { Habit, Plan, QuitTrack, Skill } from '../types/sections';

const DAY_MS = 86_400_000;

// As stored by the RevenueCat webhook (supabase/migrations/0003_entitlements.sql).
export type SubscriptionStatus = 'active' | 'canceled' | 'grace' | 'on_hold' | 'paused' | 'expired' | 'refunded';

export interface ServerSubscription {
  status: SubscriptionStatus;
  expiresAt: string | null; // ISO; null for lifetime
  isLifetime: boolean;
  willRenew: boolean;
  productId?: string | null;
  store?: string | null;
}

// The last answer from get_entitlement(), cached on the device.
export interface EntitlementSnapshot {
  userId: string;
  serverTime: string; // the server's clock when it answered (ISO)
  fetchedAt: number; // the device's clock at that moment (ms)
  trial: { startedAt: string; endsAt: string } | null;
  subscription: ServerSubscription | null;
}

export type EntitlementState =
  | 'free' // no account, or never had a trial or subscription
  | 'trial'
  | 'trialEnded'
  | 'subscribed'
  | 'canceledActive' // won't renew, but paid time is left
  | 'grace' // payment failed; store is retrying, access continues
  | 'onHold' // payment failed past grace; no sync until fixed
  | 'expired' // subscription ended or was refunded
  | 'lifetime';

export interface Entitlement {
  state: EntitlementState;
  syncAccess: boolean;
  trialDaysLeft: number | null;
  trialEndsAt: string | null;
  renewsAt: string | null; // next renewal, for an active renewing subscription
  endsAt: string | null; // when access stops (canceled-but-active, grace)
  isLifetime: boolean;
  refunded: boolean; // 'expired' because the purchase was refunded
}

const ACCESS: Record<EntitlementState, boolean> = {
  free: false,
  trial: true,
  trialEnded: false,
  subscribed: true,
  canceledActive: true,
  grace: true,
  onHold: false,
  expired: false,
  lifetime: true,
};

export function hasSyncAccess(state: EntitlementState): boolean {
  return ACCESS[state];
}

// The server's "now", estimated from the last answer. Time that passed on the
// device since then is added, but never subtracted: winding the phone's clock
// back can't make the trial younger than the server last said it was.
export function estimateServerNow(snapshot: Pick<EntitlementSnapshot, 'serverTime' | 'fetchedAt'>, deviceNow: number): number {
  return Date.parse(snapshot.serverTime) + Math.max(0, deviceNow - snapshot.fetchedAt);
}

function result(state: EntitlementState, extra: Partial<Entitlement> = {}): Entitlement {
  return { state, syncAccess: ACCESS[state], trialDaysLeft: null, trialEndsAt: null, renewsAt: null, endsAt: null, isLifetime: state === 'lifetime', refunded: false, ...extra };
}

export function computeEntitlement(snapshot: EntitlementSnapshot | null | undefined, deviceNow: number): Entitlement {
  if (!snapshot) return result('free');
  const now = estimateServerNow(snapshot, deviceNow);
  const sub = snapshot.subscription;

  if (sub?.isLifetime && sub.status !== 'refunded') return result('lifetime');

  // What the subscription alone says.
  let subState: EntitlementState | null = null;
  let subExtra: Partial<Entitlement> = {};
  if (sub) {
    const expires = sub.expiresAt ? Date.parse(sub.expiresAt) : null;
    const inPeriod = expires === null || expires > now;
    if (sub.status === 'grace') {
      subState = 'grace';
      subExtra = { endsAt: sub.expiresAt };
    } else if (sub.status === 'on_hold' || sub.status === 'paused') {
      subState = 'onHold';
    } else if ((sub.status === 'active' || sub.status === 'canceled') && inPeriod) {
      subState = sub.status === 'active' && sub.willRenew ? 'subscribed' : 'canceledActive';
      subExtra = subState === 'subscribed' ? { renewsAt: sub.expiresAt } : { endsAt: sub.expiresAt };
    } else {
      subState = 'expired'; // expired, refunded, or past its end date
      subExtra = { refunded: sub.status === 'refunded' };
    }
  }

  if (subState && ACCESS[subState]) return result(subState, subExtra);

  const trial = snapshot.trial;
  if (trial) {
    const ends = Date.parse(trial.endsAt);
    if (now < ends) {
      return result('trial', { trialEndsAt: trial.endsAt, trialDaysLeft: Math.max(1, Math.ceil((ends - now) / DAY_MS)) });
    }
  }
  if (subState) return result(subState, subExtra); // onHold or expired
  if (trial) return result('trialEnded', { trialEndsAt: trial.endsAt });
  return result('free');
}

// What get_entitlement() / start_trial() return (snake_case JSON).
export interface RawEntitlement {
  server_time: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  trial_newly_started?: boolean;
  subscription: {
    status: SubscriptionStatus;
    expires_at: string | null;
    is_lifetime: boolean;
    will_renew: boolean;
    product_id?: string | null;
    store?: string | null;
  } | null;
}

export function snapshotFromRaw(userId: string, raw: RawEntitlement, deviceNow: number): EntitlementSnapshot {
  return {
    userId,
    serverTime: raw.server_time,
    fetchedAt: deviceNow,
    trial: raw.trial_started_at && raw.trial_ends_at ? { startedAt: raw.trial_started_at, endsAt: raw.trial_ends_at } : null,
    subscription: raw.subscription
      ? {
          status: raw.subscription.status,
          expiresAt: raw.subscription.expires_at,
          isLifetime: raw.subscription.is_lifetime,
          willRenew: raw.subscription.will_renew,
          productId: raw.subscription.product_id ?? null,
          store: raw.subscription.store ?? null,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Free-plan usage, shown on Plan & usage (the caps are enforced by
// plans/access.ts canCreate). Quit is never capped.
// ---------------------------------------------------------------------------
export interface UsageInput {
  plans: Plan[];
  habits: Habit[];
  skills: Skill[];
  readingEntries?: { status: string }[];
  budgets?: unknown[];
  taskTemplates?: unknown[];
  quitTracks?: QuitTrack[]; // accepted, never counted
}

export type CountCapId = Exclude<CapId, 'dietWeeksAhead'>;
export interface CapUsage {
  id: CountCapId;
  used: number;
  cap: number;
}

// Archived items never count; a Build habit marked "formed" is finished, not active; a finished book isn't "at a time".
export function capUsage({ plans, habits, skills, readingEntries = [], budgets = [], taskTemplates = [] }: UsageInput): CapUsage[] {
  const used: Record<CountCapId, number> = {
    activePlans: plans.filter((p) => p.status === 'active').length,
    buildHabits: habits.filter((h) => !h.archivedAt && h.graduationChoice !== 'formed').length,
    skills: skills.filter((s) => !s.archivedAt).length,
    activeBooks: readingEntries.filter((e) => e.status !== 'finished').length,
    budgets: budgets.length,
    taskTemplates: taskTemplates.length,
  };
  return (Object.keys(used) as CountCapId[]).map((id) => ({ id, used: used[id], cap: FREE_CAPS[id] }));
}
