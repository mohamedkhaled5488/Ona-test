// Keeps the cached entitlement fresh: on sign-in (starting the trial the first
// time), when Ona comes back to the foreground, and on demand. Offline or on
// any error, the cached answer stays in place.
import { computeEntitlement, snapshotFromRaw, type RawEntitlement } from './entitlement';
import { useEntitlementStore, type EntitlementCacheState } from '../store/useEntitlementStore';
import { track } from './analytics';
import { isDemo } from './dataSpace';
import { now as clockNow } from './clock';

export interface EntitlementServer {
  startTrial: () => Promise<RawEntitlement>; // idempotent on the server
  getEntitlement: () => Promise<RawEntitlement>;
}

type Store = { getState: () => EntitlementCacheState };

const inFlight = new Map<string, Promise<boolean>>();

// Returns true when a fresh answer was saved, false when the cache was kept.
export function refreshEntitlement(userId: string, server: EntitlementServer, store: Store = useEntitlementStore, now: () => number = clockNow): Promise<boolean> {
  if (isDemo()) return Promise.resolve(false); // no account traffic in Demo mode
  const running = inFlight.get(userId);
  if (running) return running;
  const job = (async () => {
    const s = store.getState();
    s.setLoading(true);
    try {
      // The first sign-in on this device asks the server to start the trial.
      // The server only ever starts one per account, so a reinstall or a new
      // phone gets the existing trial back, not a new one.
      const firstTime = !s.trialRequested[userId];
      const raw = firstTime ? await server.startTrial() : await server.getEntitlement();
      const snapshot = snapshotFromRaw(userId, raw, now());
      store.getState().saveSnapshot(snapshot);
      if (firstTime) store.getState().markTrialRequested(userId);
      if (raw.trial_newly_started) track('trial_started');

      const state = computeEntitlement(snapshot, now()).state;
      if (store.getState().lastState[userId] === 'trial' && state === 'trialEnded') track('trial_ended');
      store.getState().setLastState(userId, state);
      return true;
    } catch (e) {
      store.getState().setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      store.getState().setLoading(false);
      inFlight.delete(userId);
    }
  })();
  inFlight.set(userId, job);
  return job;
}
