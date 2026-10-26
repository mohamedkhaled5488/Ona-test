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
import { canUpload, syncGate, type SyncGate } from '../utils/sync';
import { resyncFeature } from '../utils/reminders';
import { fingerprint, syncedCollections, toRecords } from './records';
import { OtherAccountError, syncOnce, type LocalData, type OutgoingRow, type PushedRow, type RemoteRow, type SyncServer } from './engine';
import { DemoModeError, bumpDataGeneration, dataGeneration, isDemo, isSwitchingDataSpace } from '../utils/dataSpace';
import { CHOICE_NEEDED, prepareAccount, useAccountChoiceStore } from './signInFlow';
import { withoutDemoItems } from '../utils/demoLeftovers';
import { bringFeelingsTogether } from '../feelings/fromSections';

// A change is sent about 3 s after it's made (several quick changes go
// together), and never later than 10 s after the first unsent change, even
// if changes keep coming. Leaving Ona (Home, another app, locking the phone)
// sends right away: the moment before an app is closed or uninstalled.
const AFTER_CHANGE_MS = 3_000;
const MAX_WAIT_MS = 10_000;
export const UPLOAD_STOPPED = 'Sync was turned off, so nothing more was sent.';
export const DATA_CHANGED = 'The data on this phone changed during sync, so nothing more was sent.';
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
// `generation`: the data a sync started with (dataGeneration()); if it
// changes (a switch, a sign-in choice, sign-out), nothing more is sent.
// `stillAllowed`: this phone's own check before every batch (signed in as
// `userId`, sync on, access). The server-only tests pass their own, so they
// test what the server itself enforces.
// Until a push says otherwise (migration 0009 not run on the server yet).
let serverHasRevisions = true;

export function supabaseSyncServer(
  userId: string,
  client: SupabaseClient = supabase as unknown as SupabaseClient,
  generation?: number,
  stillAllowed: () => boolean = () => uploadStillAllowed(userId)
): SyncServer {
  return {
    pull: async (since, limit) => {
      if (isDemo()) throw new DemoModeError('Sync');
      let q = client
        .from('sync_records' as never)
        // Every column: a server with revisions (0009) also sends `rev`.
        .select('*')
        .order('server_updated_at', { ascending: true })
        .limit(limit);
      if (since) q = q.gt('server_updated_at', since);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as RemoteRow[];
    },
    push: async (rows: OutgoingRow[]) => {
      if (isDemo()) throw new DemoModeError('Sync');
      // Checked again before every batch: turning sync off (or the trial
      // ending, a switch to the demo, or a different account signing in)
      // stops sending at once, even in the middle of a sync.
      if (generation !== undefined && generation !== dataGeneration()) throw new Error(DATA_CHANGED);
      if (!stillAllowed()) throw new Error(UPLOAD_STOPPED);
      const write = (withRevisions: boolean) =>
        client
          .from('sync_records' as never)
          .upsert(rows.map(({ base_rev, ...r }) => ({ ...r, user_id: userId, ...(withRevisions ? { base_rev } : {}) })) as never, { onConflict: 'user_id,collection,record_id' })
          .select('*');
      let { data, error } = await write(serverHasRevisions);
      // A server without migration 0009 yet: sync as before (no revisions).
      if (error && serverHasRevisions && /base_rev/.test(error.message ?? '')) {
        serverHasRevisions = false;
        ({ data, error } = await write(false));
      }
      if (error) {
        // Row-level security said no: the server doesn't see sync access.
        if (error.code === '42501') throw new Error('Sync access has ended on the server.');
        throw new Error(error.message);
      }
      return (data ?? undefined) as PushedRow[] | undefined;
    },
  };
}

// Before each batch: still the same account, sync still on, still allowed to
// send. (A switch between spaces waits for a running sync, so it isn't a
// reason to stop one halfway.)
function uploadStillAllowed(userId: string): boolean {
  const session = useAuthStore.getState().session;
  if (session?.user.id !== userId || isDemo()) return false;
  const settings = useSettingsStore.getState();
  if (!settings.consent.storeData || useAccountStore.getState().syncPaused) return false;
  return computeEntitlement(useEntitlementStore.getState().snapshots[userId], Date.now()).syncAccess;
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
    // Before the account check has run, a different owner isn't a block yet:
    // syncNow() runs the check, which asks the person.
    otherAccount: !!userId && !!owner && owner !== userId && useAccountChoiceStore.getState().readyFor === userId,
    choosing: !!userId && useAccountChoiceStore.getState().pending?.userId === userId,
    consentStoreData: settings.consent.storeData,
    syncAccess: !!userId && computeEntitlement(snapshot, Date.now()).syncAccess,
    paused: useAccountStore.getState().syncPaused,
    offline: settings.devSimulateOffline,
  });
}

// Changes on this phone that the account doesn't have yet (what the last
// sync left behind, compared item by item). Sign-out mentions them.
export function unsentChanges(): number {
  const { fingerprints, owner } = useSyncStore.getState();
  let n = 0;
  for (const c of syncedCollections()) {
    const records = toRecords(c.key, localData.read(c.key));
    const known = owner ? (fingerprints[c.key] ?? {}) : {};
    for (const [id, data] of records) if (known[id] !== fingerprint(data)) n++;
    for (const id of Object.keys(known)) if (!records.has(id)) n++;
  }
  return n;
}

let running: Promise<SyncOutcome> | null = null;

export type SyncOutcome = { ok: true; pulled: number; pushed: number; downloadOnly?: boolean } | { ok: false; message: string };

// A sync that's still running (the data-space switch waits for it).
export function syncInFlight(): Promise<unknown> {
  return running ?? Promise.resolve();
}

// Before the first sync with an account: what to do with the data on this
// phone (signInFlow.ts). Runs outside a sync, because bringing data back
// waits for any running sync.
let preparing: Promise<SyncOutcome> | null = null;

export function syncNow(): Promise<SyncOutcome> {
  if (running) return running;
  const userId = useAuthStore.getState().session?.user.id;
  if (userId && !isDemo() && !isSwitchingDataSpace() && useAccountChoiceStore.getState().readyFor !== userId && isSupabaseConfigured) {
    preparing ??= prepareAccount(userId)
      .then((r) => (r === 'ready' ? syncNow() : { ok: false as const, message: CHOICE_NEEDED }))
      .catch((e): SyncOutcome => ({ ok: false, message: `Couldn't sync: ${e instanceof Error ? e.message : String(e)}` }))
      .finally(() => {
        preparing = null;
      });
    return preparing;
  }
  // Refused up front (offline, sync off, paused, signed out...): answered
  // without marking a sync as running. (A refusal used to stay as `running`,
  // so every later sync got the same answer until Ona restarted: RA-07.)
  const gate = currentSyncGate();
  if (!gate.allowed) return Promise.resolve({ ok: false, message: gate.message });
  running = (async (): Promise<SyncOutcome> => {
    const userId = useAuthStore.getState().session!.user.id;
    const store = useSyncStore.getState();
    store.setStatus('syncing');
    try {
      const { owner, cursor, fingerprints, revs } = useSyncStore.getState();
      const generation = dataGeneration();
      // Writes stop too if the phone's data changed under this sync.
      const local: LocalData = {
        read: localData.read,
        write: (c, v) => {
          if (generation !== dataGeneration()) throw new Error(DATA_CHANGED);
          localData.write(c, v);
        },
      };
      const result = await syncOnce(userId, supabaseSyncServer(userId, undefined, generation), { owner, cursor, fingerprints, revs }, local, Date.now, { upload: canUpload(gate) });
      if (generation !== dataGeneration()) throw new Error(DATA_CHANGED);
      useSyncStore.getState().setSyncState(result.state);
      useSyncStore.getState().setStatus('idle');
      useAccountStore.getState().markSynced(new Date().toISOString());
      // Items from another phone: schedule their reminders on this one.
      if (result.changedCollections.includes('dailyPlanning.tasks')) await resyncFeature('tasks');
      if (result.changedCollections.some((c) => c === 'habits.habits' || c === 'skills.skills')) await resyncFeature('habits');
      // Journal entries or Quit moments from another phone: their feelings into
      // the Feelings log (sent with the next sync).
      if (result.changedCollections.some((c) => c === 'journaling.entries' || c === 'quitHabit.feelingEntries')) bringFeelingsTogether();
      return { ok: true, pulled: result.pulled, pushed: result.pushed, ...(canUpload(gate) ? {} : { downloadOnly: true }) };
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
  let changeTimer: ReturnType<typeof setTimeout> | null = null;
  let firstUnsentAt: number | null = null;
  let followUp = false; // asked for while a sync was running
  const quietly = () => {
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = null;
    firstUnsentAt = null;
    if (!currentSyncGate().allowed) return;
    if (running) {
      // That sync read the data before this request: run once more after it.
      if (!followUp) {
        followUp = true;
        void running.then(() => {
          followUp = false;
          quietly();
        });
      }
      return;
    }
    void syncNow();
  };
  const onLocalChange = () => {
    if (changeTimer) clearTimeout(changeTimer);
    firstUnsentAt ??= Date.now();
    const wait = Math.max(0, Math.min(AFTER_CHANGE_MS, firstUnsentAt + MAX_WAIT_MS - Date.now()));
    changeTimer = setTimeout(quietly, wait);
  };

  const unsubs = Object.values(LOCAL_DATA).map(({ store }) => (store as unknown as { subscribe: (fn: () => void) => () => void }).subscribe(onLocalChange));
  // Signing in, a fresh entitlement answer, or switching sync back on.
  // A new account (or none) means the account check runs again.
  useAccountChoiceStore.setState({ pending: null, readyFor: null, busy: false });
  unsubs.push(
    useAuthStore.subscribe((s, p) => {
      // A token refresh (same account) changes nothing. Signing in, out,
      // the session expiring, or another account signing in without a
      // sign-out: a sync that's running stops writing and sending.
      if (s.session?.user.id === p.session?.user.id) return;
      bumpDataGeneration();
      useAccountChoiceStore.setState({ pending: null, readyFor: null });
      quietly();
    })
  );
  unsubs.push(useEntitlementStore.subscribe((s, p) => s.snapshots !== p.snapshots && quietly()));
  unsubs.push(useAccountStore.subscribe((s, p) => s.syncPaused !== p.syncPaused && !s.syncPaused && quietly()));
  unsubs.push(useSettingsStore.subscribe((s, p) => s.consent.storeData !== p.consent.storeData && s.consent.storeData && quietly()));

  // Coming back to Ona, and leaving it: both sync.
  const app = AppState.addEventListener('change', (state) => {
    if (state === 'active' || state === 'background' || state === 'inactive') quietly();
  });
  const interval = setInterval(() => AppState.currentState === 'active' && quietly(), EVERY_MS);
  quietly();

  return () => {
    unsubs.forEach((u) => u());
    app.remove();
    clearInterval(interval);
    if (changeTimer) clearTimeout(changeTimer);
  };
}
