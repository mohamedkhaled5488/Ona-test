// The one place screens learn the plan state. No screen reads RevenueCat or
// trial dates directly.
import { useEffect, useMemo, useState } from 'react';
import { useAccountStore } from '../store/useAccountStore';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useEntitlementStore } from '../store/useEntitlementStore';
import { useSyncStore } from '../store/useSyncStore';
import { isSupabaseConfigured } from '../lib/supabase';
import { computeEntitlement, type Entitlement, type EntitlementSnapshot, type EntitlementState } from '../utils/entitlement';
import { syncGate, type SyncGate } from '../utils/sync';
import { useDataSpace } from './useDataSpace';

export interface EntitlementView extends Entitlement {
  loading: boolean; // signed in, nothing cached yet, and the first answer is on its way
}

const DAY = 86_400_000;

// Developer tools can force a state: a believable snapshot for each.
export function forcedSnapshot(state: EntitlementState, clock: number): EntitlementSnapshot {
  // Dates hang off midnight UTC (plus a little), so they stay the same all day
  // and "dismissed once" notices behave as they would with real server dates.
  const now = Math.floor(clock / DAY) * DAY + 60_000;
  const iso = (ms: number) => new Date(ms).toISOString();
  const base: EntitlementSnapshot = { userId: 'dev', serverTime: iso(now), fetchedAt: now, trial: null, subscription: null };
  const sub = (status: NonNullable<EntitlementSnapshot['subscription']>['status'], expiresIn: number, willRenew = true) => ({
    ...base,
    subscription: { status, expiresAt: iso(now + expiresIn), isLifetime: false, willRenew },
  });
  switch (state) {
    case 'trial':
      return { ...base, trial: { startedAt: iso(now - 18 * DAY), endsAt: iso(now + 12 * DAY) } };
    case 'trialEnded':
      return { ...base, trial: { startedAt: iso(now - 33 * DAY), endsAt: iso(now - 3 * DAY) } };
    case 'subscribed':
      return sub('active', 20 * DAY);
    case 'canceledActive':
      return sub('active', 9 * DAY, false);
    case 'grace':
      return sub('grace', 5 * DAY);
    case 'onHold':
      return sub('on_hold', -2 * DAY);
    case 'expired':
      return sub('expired', -10 * DAY);
    case 'lifetime':
      return { ...base, subscription: { status: 'active', expiresAt: null, isLifetime: true, willRenew: false } };
    default:
      return base;
  }
}

// Re-evaluates once a minute so a trial ending while Ona is open is noticed.
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function useEntitlement(): EntitlementView {
  const userId = useAuthStore((s) => s.session?.user.id);
  const snapshot = useEntitlementStore((s) => (userId ? s.snapshots[userId] : undefined));
  const fetching = useEntitlementStore((s) => s.loading);
  const devForced = useAccountStore((s) => s.devForcedEntitlement);
  const now = useMinuteClock();
  const demo = useDataSpace() === 'demo';

  return useMemo(() => {
    // Demo mode shows a neutral free plan, never the real account's state.
    if (demo) return { ...computeEntitlement(null, now), loading: false };
    if (__DEV__ && devForced) return { ...computeEntitlement(forcedSnapshot(devForced, now), now), loading: false };
    // No account means no trial and no subscription: the free plan, with
    // everything local working as always.
    if (!userId) return { ...computeEntitlement(null, now), loading: false };
    return { ...computeEntitlement(snapshot, now), loading: !snapshot && fetching };
  }, [demo, userId, snapshot, fetching, devForced, now]);
}

export function useSyncGate(): SyncGate {
  const session = useAuthStore((s) => s.session);
  const consentStoreData = useSettingsStore((s) => s.consent.storeData);
  const offline = useSettingsStore((s) => s.devSimulateOffline);
  const paused = useAccountStore((s) => s.syncPaused);
  const owner = useSyncStore((s) => s.owner);
  const { syncAccess } = useEntitlement();
  const otherAccount = !!session && !!owner && owner !== session.user.id;
  const demo = useDataSpace() === 'demo';
  return useMemo(
    () => syncGate({ demo, configured: isSupabaseConfigured, signedIn: !!session, otherAccount, syncAccess, consentStoreData, paused, offline }),
    [demo, session, otherAccount, syncAccess, consentStoreData, paused, offline]
  );
}
