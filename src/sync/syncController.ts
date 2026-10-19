// Runs sync for real: checks every rule, talks to Supabase, writes merged data
// into the sections, and decides when to sync (start-up, coming back to Ona,
// a little after a change, every few minutes while open, and "Sync now").
import { AppState } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { useAccountStore } from '../store/useAccountStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useEntitlementStore } from '../store/useEntitlementStore';
import { useSyncStore } from '../store/useSyncStore';
import { LOCAL_DATA, normalizeField } from '../utils/localData';
import { computeEntitlement } from '../utils/entitlement';
import { syncGate, type SyncGate } from '../utils/sync';
import { resyncFeature } from '../utils/reminders';
import { OtherAccountError, syncOnce, type LocalData, type OutgoingRow, type RemoteRow, type SyncServer } from './engine';
import { DemoModeError, isDemo, isSwitchingDataSpace } from '../utils/dataSpace';
import { withoutDemoItems } from '../utils/demoLeftovers';

const AFTER_CHANGE_MS = 15_000;
const EVERY_MS = 5 * 60_000;

export const localData: LocalData = {
  read: (collection) => {
    const [section, field] = collection.split('.');
    return (LOCAL_DATA[section].store.getState() as Record<string, unknown>)[field];
  },
  write: (collection, value) => {
    if (isDemo()) throw new DemoModeError('Sync');
    const [section, field] = collection.split('.');
    // Another device may still run an older version of Ona. Demo items that
    // leaked into the account (before FIX-14) are dropped; the next push
    // then deletes them from the account.
    LOCAL_DATA[section].store.setState({ [field]: withoutDemoItems(normalizeField(section, field, value)) });
  },
};

// `client` is the app's own client; the backend tests pass one for the local stack.
export function supabaseSyncServer(userId: string, client: SupabaseClient = supabase as unknown as SupabaseClient): SyncServer {
  return {
    pull: async (since, limit) => {
      if (isDemo()) throw new DemoModeError('Sync');
      let q = client
        .from('sync_records' as never)
        .select('collection, record_id, data, deleted, client_updated_at, server_updated_at')
        .order('server_updated_at', { ascending: true })
        .limit(limit);
      if (since) q = q.gt('server_updated_at', since);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as RemoteRow[];
    },
    push: async (rows: OutgoingRow[]) => {
      if (isDemo()) throw new DemoModeError('Sync');
      const { error } = await client
        .from('sync_records' as never)
        .upsert(rows.map((r) => ({ ...r, user_id: userId })) as never, { onConflict: 'user_id,collection,record_id' });
      if (error) {
        // Row-level security said no: the server doesn't see sync access.
        if (error.code === '42501') throw new Error('Sync access has ended on the server.');
        throw new Error(error.message);
      }
    },
  };
}

// The same rules as useSyncGate(), readable outside React.
export function currentSyncGate(): SyncGate {
  const session = useAuthStore.getState().session;
  const userId = session?.user.id;
  const settings = useSettingsStore.getState();
  const owner = useSyncStore.getState().owner;
  const snapshot = userId ? useEntitlementStore.getState().snapshots[userId] : undefined;
  return syncGate({
    // Mid-switch the stores may still hold the other space's data.
    demo: isDemo() || isSwitchingDataSpace(),
    configured: isSupabaseConfigured,
    signedIn: !!session,
    otherAccount: !!userId && !!owner && owner !== userId,
    consentStoreData: settings.consent.storeData,
    syncAccess: !!userId && computeEntitlement(snapshot, Date.now()).syncAccess,
    paused: useAccountStore.getState().syncPaused,
    offline: settings.devSimulateOffline,
  });
}

let running: Promise<SyncOutcome> | null = null;

export type SyncOutcome = { ok: true; pulled: number; pushed: number } | { ok: false; message: string };

// A sync that's still running (the data-space switch waits for it).
export function syncInFlight(): Promise<unknown> {
  return running ?? Promise.resolve();
}

export function syncNow(): Promise<SyncOutcome> {
  if (running) return running;
  running = (async (): Promise<SyncOutcome> => {
    const gate = currentSyncGate();
    if (!gate.allowed) return { ok: false, message: gate.message };
    const userId = useAuthStore.getState().session!.user.id;
    const store = useSyncStore.getState();
    store.setStatus('syncing');
    try {
      const { owner, cursor, fingerprints } = useSyncStore.getState();
      const result = await syncOnce(userId, supabaseSyncServer(userId), { owner, cursor, fingerprints }, localData);
      useSyncStore.getState().setSyncState(result.state);
      useSyncStore.getState().setStatus('idle');
      useAccountStore.getState().markSynced(new Date().toISOString());
      // Items from another phone: schedule their reminders on this one.
      if (result.changedCollections.includes('dailyPlanning.tasks')) await resyncFeature('tasks');
      if (result.changedCollections.some((c) => c === 'habits.habits' || c === 'skills.skills')) await resyncFeature('habits');
      return { ok: true, pulled: result.pulled, pushed: result.pushed };
    } catch (e) {
      const message = e instanceof OtherAccountError ? e.message : `Couldn't sync: ${e instanceof Error ? e.message : String(e)}`;
      useSyncStore.getState().setStatus('error', message);
      return { ok: false, message };
    } finally {
      running = null;
    }
  })();
  return running;
}

// Call once at startup, after local data has loaded.
export function startSync(): () => void {
  const quietly = () => {
    if (currentSyncGate().allowed) void syncNow();
  };
  let changeTimer: ReturnType<typeof setTimeout> | null = null;
  const onLocalChange = () => {
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = setTimeout(quietly, AFTER_CHANGE_MS);
  };

  const unsubs = Object.values(LOCAL_DATA).map(({ store }) => (store as unknown as { subscribe: (fn: () => void) => () => void }).subscribe(onLocalChange));
  // Signing in, a fresh entitlement answer, or switching sync back on.
  unsubs.push(useAuthStore.subscribe((s, p) => s.session?.user.id !== p.session?.user.id && quietly()));
  unsubs.push(useEntitlementStore.subscribe((s, p) => s.snapshots !== p.snapshots && quietly()));
  unsubs.push(useAccountStore.subscribe((s, p) => s.syncPaused !== p.syncPaused && !s.syncPaused && quietly()));
  unsubs.push(useSettingsStore.subscribe((s, p) => s.consent.storeData !== p.consent.storeData && s.consent.storeData && quietly()));

  const app = AppState.addEventListener('change', (state) => state === 'active' && quietly());
  const interval = setInterval(() => AppState.currentState === 'active' && quietly(), EVERY_MS);
  quietly();

  return () => {
    unsubs.forEach((u) => u());
    app.remove();
    clearInterval(interval);
    if (changeTimer) clearTimeout(changeTimer);
  };
}
