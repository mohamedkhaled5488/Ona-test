// Journeys across accounts on one phone (design 3.3 and 3.4), as a person
// does them, with Ona's real start-up, sign-in check, sync and storage, and
// only the server faked (one set of rows per account, as row-level security
// keeps them). Merge flow, keeping data separate, another account's data,
// sign-out keep/remove, and the hold during each of these.
// IDs: docs/test-cases/integration.md (JRN-ACC-*)
jest.setTimeout(30_000);

type Row = { user_id: string; collection: string; record_id: string; data: unknown; deleted: boolean; client_updated_at: string; server_updated_at: string };
const mockServer = { rows: [] as Row[], user: null as string | null, tick: 0, onUpsert: null as null | ((n: number) => void), upserts: 0, onPull: null as null | (() => void), trialOver: false };

jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));
jest.mock('../reminders', () => ({ resyncFeature: jest.fn(async () => {}) }));
jest.mock('../network', () => ({ isOnline: async () => true }));
jest.mock('../../lib/supabase', () => {
  const stamp = () => new Date(Date.UTC(2026, 9, 24, 9, 0, 0, ++mockServer.tick)).toISOString();
  const mine = () => mockServer.rows.filter((r) => r.user_id === mockServer.user);
  const from = (table: string) => {
    const f: { since?: string; head?: boolean; id?: string } = {};
    const q: Record<string, unknown> = {
      select: (_c: string, opts?: { head?: boolean }) => ((f.head = !!opts?.head), q),
      order: () => q,
      limit: () => q,
      gt: (_c: string, v: string) => ((f.since = v), q),
      eq: (c: string, v: string) => (c === 'id' && (f.id = v), q),
      // The account's consent: yes for everyone here (sign-in says so).
      maybeSingle: async () => ({ data: { store_data_consent: true, store_data_consent_version: '2026-10-21', store_data_consent_source: 'sign-in' }, error: null }),
      update: () => ({ eq: async () => ({ error: null }) }),
      upsert: async (rows: Row[]) => {
        mockServer.upserts++;
        mockServer.onUpsert?.(mockServer.upserts);
        for (const r of rows) {
          const i = mockServer.rows.findIndex((x) => x.user_id === r.user_id && x.collection === r.collection && x.record_id === r.record_id);
          const row = { ...r, server_updated_at: stamp() };
          if (i >= 0) mockServer.rows[i] = row;
          else mockServer.rows.push(row);
        }
        return { error: null };
      },
      then: (resolve: (v: unknown) => void) => {
        if (table !== 'sync_records') return resolve({ data: [], error: null });
        if (f.head) return resolve({ data: null, count: mine().filter((r) => !r.deleted).length, error: null });
        mockServer.onPull?.();
        resolve({ data: mine().filter((r) => !f.since || r.server_updated_at > f.since).sort((a, b) => a.server_updated_at.localeCompare(b.server_updated_at)), error: null });
      },
    };
    return q;
  };
  const DAY = 86_400_000;
  const trial = () => ({ server_time: new Date().toISOString(), trial_started_at: new Date(Date.now() - (mockServer.trialOver ? 40 : 1) * DAY).toISOString(), trial_ends_at: new Date(Date.now() + (mockServer.trialOver ? -10 : 29) * DAY).toISOString(), subscription: null, trial_newly_started: false });
  return {
    isSupabaseConfigured: true,
    supabaseUrl: 'https://example.supabase.co',
    supabase: {
      from,
      rpc: async () => ({ data: trial(), error: null }),
      auth: {
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({ error: null }),
      },
    },
  };
});
jest.mock('../../auth/googleSignIn', () => ({ ...jest.requireActual('../../auth/googleSignIn'), signOutOfGoogle: async () => {} }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { setDataSpace } from '../dataSpace';
import { __flushForTests, __resetForTests, listParked, restoreParked, startAppData } from '../dataSpaceController';
import { useAuthStore } from '../../store/useAuthStore';
import { useSettingsStore, DEFAULT_SETTINGS } from '../../store/useSettingsStore';
import { useEntitlementStore } from '../../store/useEntitlementStore';
import { useSyncStore } from '../../store/useSyncStore';
import { useJournalStore } from '../../store/useJournalStore';
import { DATA_CHANGED, startSync, syncInFlight, syncNow, unsentChanges } from '../../sync/syncController';
import { startAccountConsent, noteConsentSource, useConsentStatusStore } from '../../sync/accountConsent';
import { CHOICE_NEEDED, chooseForAccount, signOutAndChoose, signOutCopy, signOutFacts, useAccountChoiceStore } from '../../sync/signInFlow';
import { CHOICE_COPY } from '../../components/AccountChoiceSheet';
import { currentBackupStatus } from '../../sync/backupStatus';
import { startEntitlementSync } from '../entitlementBootstrap';
import { useClock, restoreClock } from '../../test-utils';

const storage = AsyncStorage as unknown as { clear: () => Promise<void> };
const entry = (id: string, text = id) => ({ id, date: '2026-10-24', zone: 'calm', text, tags: [], createdAt: '2026-10-24T08:00:00.000Z', updatedAt: '2026-10-24T08:00:00.000Z' });
const accountRow = (user: string, id: string): Row => ({ user_id: user, collection: 'journaling.entries', record_id: id, data: entry(id), deleted: false, client_updated_at: '2026-10-20T08:00:00.000Z', server_updated_at: new Date(Date.UTC(2026, 9, 20, 8, 0, 0, ++mockServer.tick)).toISOString() });

let stops: (() => void)[] = [];
async function startOna() {
  stops.forEach((s) => s());
  __resetForTests();
  setDataSpace('real');
  await startAppData(storage as never, false);
  stops = [startEntitlementSync(), startAccountConsent(), startSync()];
}
async function freshInstall() {
  await storage.clear();
  useAuthStore.setState({ session: null, initializing: false });
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, consent: { ...DEFAULT_SETTINGS.consent } });
  useSyncStore.getState().reset();
  useEntitlementStore.setState({ snapshots: {} } as never);
  await startOna();
}
async function settle() {
  for (let i = 0; i < 10; i++) {
    await syncInFlight();
    await new Promise((r) => setTimeout(r, 0));
  }
}
const signIn = async (id: string) => {
  noteConsentSource('sign-in');
  mockServer.user = id;
  useAuthStore.setState({ session: { user: { id } } as never, initializing: false });
  await settle();
};
const write = async (...ids: string[]) => {
  useJournalStore.setState((s) => ({ entries: [...s.entries, ...ids.map((id) => entry(id))] }) as never);
  jest.advanceTimersByTime(11_000);
  await settle();
};
const onPhone = () => useJournalStore.getState().entries.map((e) => e.id).sort();
const inAccount = (user: string) => mockServer.rows.filter((r) => r.user_id === user && !r.deleted).map((r) => r.record_id).sort();
const pending = () => useAccountChoiceStore.getState().pending;

beforeEach(() => {
  mockServer.rows = [];
  mockServer.user = null;
  mockServer.onUpsert = null;
  mockServer.upserts = 0;
  mockServer.onPull = null;
  mockServer.trialOver = false;
  useConsentStatusStore.setState({ problem: null, notice: null });
  useClock('2026-10-24T09:00');
});
afterEach(() => {
  stops.forEach((s) => s());
  stops = [];
  restoreClock();
});

describe('JRN-ACC: signing in with data on this phone (merge flow)', () => {
  test('JRN-ACC-001 data made without an account, empty account: one tap to confirm, with the count; Continue sends it', async () => {
    await freshInstall();
    await write('g1', 'g2');
    await signIn('u1');
    expect(pending()).toMatchObject({ kind: 'adopt', here: 2 });
    expect(CHOICE_COPY.adopt.counts(2)).toBe('2 items on this phone. Your account is empty.');
    expect(inAccount('u1')).toEqual([]); // nothing before the tap
    await chooseForAccount('continue');
    await syncNow();
    await settle();
    expect(inAccount('u1')).toEqual(['g1', 'g2']);
  });

  test("JRN-ACC-001b empty account, Keep separate: the account stays empty, this phone's data is kept aside", async () => {
    await freshInstall();
    await write('g1');
    await signIn('u1');
    await chooseForAccount('keepSeparate');
    await syncNow();
    await settle();
    expect(onPhone()).toEqual([]);
    expect(inAccount('u1')).toEqual([]);
    expect(await listParked()).toEqual([expect.objectContaining({ origin: null, reason: 'keptSeparate', records: 1 })]);
  });

  test('JRN-ACC-002 data here and in the account: asked first, with both counts, and nothing syncs until answered', async () => {
    mockServer.rows.push(accountRow('u1', 'a1'), accountRow('u1', 'a2'), accountRow('u1', 'a3'));
    await freshInstall();
    await write('g1', 'g2');
    await signIn('u1');
    expect(pending()).toMatchObject({ kind: 'merge', here: 2, inAccount: 3 });
    expect(CHOICE_COPY.merge.counts(2, 3)).toBe('2 items on this phone, 3 items in your account.');
    expect(inAccount('u1')).toEqual(['a1', 'a2', 'a3']); // nothing sent
    expect(onPhone()).toEqual(['g1', 'g2']); // nothing received
    expect(await syncNow()).toEqual({ ok: false, message: CHOICE_NEEDED });
    await write('g3'); // a change meanwhile still waits
    expect(inAccount('u1')).toEqual(['a1', 'a2', 'a3']);
  });

  test('JRN-ACC-003 Merge: everything from both, on the phone and in the account; nothing deleted', async () => {
    mockServer.rows.push(accountRow('u1', 'a1'), accountRow('u1', 'a2'));
    await freshInstall();
    await write('g1');
    await signIn('u1');
    await chooseForAccount('merge');
    await syncNow();
    await settle();
    expect(onPhone()).toEqual(['a1', 'a2', 'g1']);
    expect(inAccount('u1')).toEqual(['a1', 'a2', 'g1']);
  });

  test('JRN-ACC-004 Keep separate: the account\'s data here, this phone\'s kept aside and never sent; back after signing out with Remove', async () => {
    mockServer.rows.push(accountRow('u1', 'a1'));
    await freshInstall();
    await write('g1', 'g2');
    await signIn('u1');
    await chooseForAccount('keepSeparate');
    await syncNow();
    await settle();
    expect(onPhone()).toEqual(['a1']);
    expect(inAccount('u1')).toEqual(['a1']);
    expect(await listParked()).toEqual([expect.objectContaining({ origin: null, reason: 'keptSeparate', records: 2 })]);
    await signOutAndChoose(false);
    await settle();
    expect(onPhone()).toEqual(['g1', 'g2']);
    expect(await listParked()).toEqual([]);
    expect(inAccount('u1')).toEqual(['a1']);
  });

  test('JRN-ACC-005 Use the account\'s data only: a copy of this phone\'s data stays, listed, until brought back or removed', async () => {
    mockServer.rows.push(accountRow('u1', 'a1'));
    await freshInstall();
    await write('g1');
    await signIn('u1');
    await chooseForAccount('accountOnly');
    await syncNow();
    await settle();
    expect(onPhone()).toEqual(['a1']);
    const [copy] = await listParked();
    expect(copy).toMatchObject({ reason: 'accountOnly', records: 1 });
    // Brought back later: added to what's here, nothing replaced, then synced.
    expect(await restoreParked(copy.id)).toBe('added');
    await write();
    expect(onPhone()).toEqual(['a1', 'g1']);
    expect(inAccount('u1')).toEqual(['a1', 'g1']);
  });

  test('JRN-ACC-006 Decide later: nothing syncs, and Ona asks again after a restart', async () => {
    mockServer.rows.push(accountRow('u1', 'a1'));
    await freshInstall();
    await write('g1');
    await signIn('u1');
    useAccountChoiceStore.setState({ hidden: true });
    await startOna(); // closed and opened again, still signed in
    await syncNow();
    await settle();
    expect(pending()).toMatchObject({ kind: 'merge' });
    expect(useAccountChoiceStore.getState().hidden).toBe(false);
    expect(inAccount('u1')).toEqual(['a1']);
  });
});

describe('JRN-ACC: another account on the same phone', () => {
  async function aThenB() {
    mockServer.rows.push(accountRow('b', 'b1'));
    await freshInstall();
    await signIn('a');
    await write('a1', 'a2');
    expect(inAccount('a')).toEqual(['a1', 'a2']);
    await signOutAndChoose(true); // keeps A's data on the phone
    await signIn('b');
  }

  test('JRN-ACC-010 A\'s data on the phone, B signs in: asked, never added by default, nothing of A reaches B', async () => {
    await aThenB();
    expect(pending()).toMatchObject({ kind: 'otherAccount', here: 2, otherOwner: 'a' });
    expect(inAccount('b')).toEqual(['b1']);
    expect(onPhone()).toEqual(['a1', 'a2']);
  });

  test('JRN-ACC-011 Keep separate: B\'s data here; A\'s kept aside; when A signs in again, A\'s own data comes back by itself', async () => {
    await aThenB();
    await chooseForAccount('keepSeparate');
    await syncNow();
    await settle();
    expect(onPhone()).toEqual(['b1']);
    expect(inAccount('b')).toEqual(['b1']);
    expect(inAccount('a')).toEqual(['a1', 'a2']);
    // B signs out and removes B's copy; A signs in on the now-empty phone.
    await signOutAndChoose(false);
    await signIn('a');
    await settle();
    expect(pending()).toBeNull();
    expect(onPhone()).toEqual(['a1', 'a2']);
    expect(await listParked()).toEqual([]);
    expect(inAccount('b')).toEqual(['b1']);
  });

  test('JRN-ACC-012 Add them to this account: only when chosen; then A\'s items are in B too, and A keeps its own', async () => {
    await aThenB();
    await chooseForAccount('addToAccount');
    await syncNow();
    await settle();
    expect(inAccount('b')).toEqual(['a1', 'a2', 'b1']);
    expect(inAccount('a')).toEqual(['a1', 'a2']);
  });

  test('JRN-ACC-013 a phone that was empty when B signs in: B\'s data comes down, with no question', async () => {
    mockServer.rows.push(accountRow('b', 'b1'));
    await freshInstall();
    await signIn('b');
    expect(pending()).toBeNull();
    expect(onPhone()).toEqual(['b1']);
  });
});

describe('JRN-ACC: signing out', () => {
  test('JRN-ACC-020 changes not yet in the account are counted, and removing this phone\'s copy is offered only when nothing would be lost', async () => {
    await freshInstall();
    await signIn('u1');
    await write('j1');
    expect(unsentChanges()).toBe(0);
    useJournalStore.setState((s) => ({ entries: [...s.entries, entry('j2')] }) as never); // not synced yet
    expect(unsentChanges()).toBe(1);
    const facts = await signOutFacts(unsentChanges(), true);
    expect(facts.canRemove).toBe(false);
    expect(signOutCopy(facts).message).toMatch(/^1 change on this phone isn't in your account, so your data stays on this phone/);
    expect(signOutCopy(facts).message).toMatch(/App lock/); // no lock set
    await settle();
    jest.advanceTimersByTime(11_000);
    await settle();
    expect(unsentChanges()).toBe(0);
    expect((await signOutFacts(0, true)).canRemove).toBe(true);
  });

  test('JRN-ACC-021 Remove my data from this phone: the phone is empty, the account keeps everything, and signing in brings it back', async () => {
    await freshInstall();
    await signIn('u1');
    await write('j1', 'j2');
    await signOutAndChoose(false);
    expect(useAuthStore.getState().session).toBeNull();
    expect(onPhone()).toEqual([]);
    expect(inAccount('u1')).toEqual(['j1', 'j2']);
    await signIn('u1');
    expect(onPhone()).toEqual(['j1', 'j2']);
  });

  test('JRN-ACC-022 Keep my data on this phone (the default): it stays; the same account signing in again just syncs', async () => {
    await freshInstall();
    await signIn('u1');
    await write('j1');
    await signOutAndChoose(true);
    await write('j2'); // written while signed out
    expect(onPhone()).toEqual(['j1', 'j2']);
    await signIn('u1');
    expect(pending()).toBeNull();
    expect(inAccount('u1')).toEqual(['j1', 'j2']);
  });
});

describe('JRN-ACC: the hold while the phone\'s data changes (space lock)', () => {
  test('JRN-ACC-030 a sync fired while this phone\'s data is being put aside sends none of it', async () => {
    mockServer.rows.push(accountRow('u1', 'a1'));
    await freshInstall();
    await write('g1', 'g2');
    await signIn('u1');
    const keeping = chooseForAccount('keepSeparate');
    const fired = [syncNow(), syncNow()];
    jest.advanceTimersByTime(11_000);
    await keeping;
    await Promise.all(fired);
    await settle();
    expect(inAccount('u1')).toEqual(['a1']);
    expect(mockServer.rows.some((r) => r.record_id.startsWith('g'))).toBe(false);
  });

  test('JRN-ACC-031 if the phone\'s data changes in the middle of a sync, the rest isn\'t sent and nothing is written back', async () => {
    await freshInstall();
    await signIn('u1');
    useJournalStore.setState({ entries: Array.from({ length: 450 }, (_, i) => entry(`j${String(i).padStart(3, '0')}`)) } as never);
    const { bumpDataGeneration } = require('../dataSpace') as typeof import('../dataSpace');
    mockServer.onUpsert = (n) => n === 1 && bumpDataGeneration();
    const result = await syncNow();
    expect(result).toEqual({ ok: false, message: `Couldn't sync: ${DATA_CHANGED}` });
    expect(inAccount('u1').length).toBe(200); // the first batch only
    mockServer.onUpsert = null;
    await syncNow();
    expect(inAccount('u1').length).toBe(450); // the next sync sends the rest
  });

  test('JRN-ACC-032 whatever is chosen, nothing anyone made is deleted (phone + kept aside + account)', async () => {
    for (const option of ['merge', 'keepSeparate', 'accountOnly'] as const) {
      mockServer.rows = [accountRow('u1', 'a1')];
      await freshInstall();
      await write('g1', 'g2');
      await signIn('u1');
      await chooseForAccount(option);
      await syncNow();
      await settle();
      const kept = new Set([...onPhone(), ...inAccount('u1')]);
      for (const c of await listParked()) if (c.records) kept.add(`parked:${c.records}`);
      const all = option === 'merge' ? ['a1', 'g1', 'g2'].every((id) => kept.has(id)) : kept.has('a1') && kept.has('parked:2');
      expect({ option, all }).toEqual({ option, all: true });
    }
  });
});

describe('JRN-ACC: reminders follow the data', () => {
  test('JRN-ACC-040 data put aside stops ringing; brought back, its reminders are scheduled again', async () => {
    const { cancelReminders } = require('../notifications') as { cancelReminders: jest.Mock };
    const { resyncFeature } = require('../reminders') as { resyncFeature: jest.Mock };
    const { useDailyPlanningStore } = require('../../store/useDailyPlanningStore') as typeof import('../../store/useDailyPlanningStore');
    mockServer.rows.push(accountRow('u1', 'a1'));
    await freshInstall();
    useDailyPlanningStore.setState({ tasks: [{ id: 't1', title: 'Call', date: '2026-10-25', done: false, notificationIds: ['n-t1'] }] } as never);
    await write('g1');
    await signIn('u1');
    cancelReminders.mockClear();
    resyncFeature.mockClear();
    await chooseForAccount('keepSeparate');
    expect(cancelReminders.mock.calls.flat(2)).toContain('n-t1');
    await signOutAndChoose(false); // brings this phone's data back
    expect(useDailyPlanningStore.getState().tasks.map((t) => t.id)).toEqual(['t1']);
    expect(resyncFeature).toHaveBeenCalledWith('tasks');
    expect(resyncFeature).toHaveBeenCalledWith('habits');
  });
});

describe('JRN-ACC: the worst moment for a sync', () => {
  test('JRN-ACC-033 a sync fired while signing out with Remove brings nothing back down', async () => {
    await freshInstall();
    await signIn('u1');
    await write('j1', 'j2');
    const out = signOutAndChoose(false);
    const fired = syncNow();
    jest.advanceTimersByTime(11_000);
    await out;
    await fired;
    await settle();
    expect(onPhone()).toEqual([]);
    expect(inAccount('u1')).toEqual(['j1', 'j2']);
  });

  test('JRN-ACC-034 a sync fired while switching to the other account sends nothing of the first account to the second', async () => {
    mockServer.rows.push(accountRow('b', 'b1'));
    await freshInstall();
    await signIn('a');
    await write('a1');
    await signOutAndChoose(true);
    noteConsentSource('sign-in');
    mockServer.user = 'b';
    useAuthStore.setState({ session: { user: { id: 'b' } } as never, initializing: false });
    const fired = [syncNow(), syncNow()];
    jest.advanceTimersByTime(11_000);
    await Promise.all(fired);
    await settle();
    expect(inAccount('b')).toEqual(['b1']);
    await chooseForAccount('keepSeparate');
    const again = syncNow();
    await again;
    await settle();
    expect(inAccount('b')).toEqual(['b1']);
    expect(onPhone()).toEqual(['b1']);
  });
});

describe('JRN-ACC: without Plus, and waiting for a choice', () => {
  test("JRN-ACC-060 Merge when sending isn't allowed (trial over): the account's data comes down and merges here, this phone's waits, the status says so, and it goes up when Plus is back", async () => {
    mockServer.trialOver = true;
    mockServer.rows.push(accountRow('u1', 'a1'), accountRow('u1', 'a2'));
    await freshInstall();
    await write('g1');
    await signIn('u1');
    await chooseForAccount('merge');
    const r = await syncNow();
    await settle();
    expect(r).toMatchObject({ ok: true, downloadOnly: true, pushed: 0 });
    expect(onPhone()).toEqual(['a1', 'a2', 'g1']);
    expect(inAccount('u1')).toEqual(['a1', 'a2']);
    expect(unsentChanges()).toBe(1);
    expect(currentBackupStatus()).toMatchObject({ kind: 'withoutPlus', title: 'Backup paused' });
    expect(currentBackupStatus().line).toMatch(/^1 change on this phone isn't in your account yet\. They're kept here, and sent when you have Plus again/);
    await write('g2'); // more changes keep waiting here
    expect(unsentChanges()).toBe(2);
    expect(inAccount('u1')).toEqual(['a1', 'a2']);
    // Plus again: everything waiting goes up.
    useEntitlementStore.getState().saveSnapshot({ userId: 'u1', serverTime: new Date().toISOString(), fetchedAt: Date.now(), trial: null, subscription: { status: 'active', productId: 'plus_monthly', expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString() } } as never);
    await settle();
    await syncNow();
    await settle();
    expect(inAccount('u1')).toEqual(['a1', 'a2', 'g1', 'g2']);
    expect(unsentChanges()).toBe(0);
    expect(currentBackupStatus()).toMatchObject({ kind: 'backedUp', title: 'Backed up' });
  });

  test('JRN-ACC-061 Decide later: the status says "Waiting for your choice"', async () => {
    mockServer.rows.push(accountRow('u1', 'a1'));
    await freshInstall();
    await write('g1');
    await signIn('u1');
    useAccountChoiceStore.setState({ hidden: true });
    expect(currentBackupStatus()).toMatchObject({ kind: 'waitingForChoice', title: 'Waiting for your choice' });
  });
});

describe('JRN-ACC: the session changing in the middle of a sync', () => {
  const big = () => useJournalStore.setState({ entries: Array.from({ length: 450 }, (_, i) => entry(`j${String(i).padStart(3, '0')}`)) } as never);

  test('JRN-ACC-035 the session expires mid-upload: nothing more is sent', async () => {
    await freshInstall();
    await signIn('u1');
    big();
    mockServer.onUpsert = (n) => n === 1 && useAuthStore.setState({ session: null });
    await syncNow();
    expect(inAccount('u1').length).toBe(200);
  });

  test('JRN-ACC-036 another account signs in without a sign-out, mid-upload: nothing more goes to the first account, nothing of it to the second', async () => {
    await freshInstall();
    await signIn('u1');
    big();
    mockServer.onUpsert = (n) => {
      if (n !== 1) return;
      mockServer.user = 'u2';
      useAuthStore.setState({ session: { user: { id: 'u2' } } as never });
    };
    await syncNow();
    await settle();
    expect(inAccount('u1').length).toBe(200);
    expect(inAccount('u2')).toEqual([]);
    expect(pending()).toMatchObject({ kind: 'otherAccount', userId: 'u2', otherOwner: 'u1' });
  });

  test('JRN-ACC-037 another account signs in mid-download: nothing it brings is written to this phone', async () => {
    mockServer.rows.push(accountRow('u1', 'a1'));
    await freshInstall();
    await signIn('u1');
    mockServer.rows.push(accountRow('u1', 'a2'));
    mockServer.onPull = () => {
      mockServer.onPull = null;
  mockServer.trialOver = false;
      useAuthStore.setState({ session: { user: { id: 'u2' } } as never });
    };
    const r = await syncNow();
    expect(r).toEqual({ ok: false, message: `Couldn't sync: ${DATA_CHANGED}` });
    expect(onPhone()).toEqual(['a1']);
  });

  test('JRN-ACC-038 a token refresh (same account) mid-upload changes nothing: the whole upload goes through', async () => {
    await freshInstall();
    await signIn('u1');
    big();
    mockServer.onUpsert = (n) => n === 1 && useAuthStore.setState({ session: { user: { id: 'u1' }, access_token: 'refreshed' } as never });
    await syncNow();
    expect(inAccount('u1').length).toBe(450);
  });
});

afterAll(async () => {
  await __flushForTests();
});
