// The account journeys (JRN-ACC) against the real local stack: Ona's own
// start-up, sign-in check, consent, entitlement and sync code, with the
// app's Supabase client pointed at whichever test user is "signed in" on
// the phone. Real row-level security, real counts, real trial rules.
// IDs: docs/test-cases/backend.md (BE-ACC-*)
jest.mock('../../src/utils/notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));
jest.mock('../../src/utils/reminders', () => ({ resyncFeature: jest.fn(async () => {}) }));
jest.mock('../../src/utils/network', () => ({ isOnline: async () => true }));
const mockPhone: { db: unknown } = { db: null };
jest.mock('../../src/lib/supabase', () => {
  const auth = { signOut: async () => ({ error: null }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) };
  const supabase = new Proxy({}, { get: (_t, key) => (key === 'auth' ? auth : ((mockPhone.db as Record<string | symbol, unknown>)[key] as (...a: unknown[]) => unknown).bind(mockPhone.db)) });
  return { isSupabaseConfigured: true, supabaseUrl: 'http://127.0.0.1', supabase };
});
jest.mock('../../src/auth/googleSignIn', () => ({ ...jest.requireActual('../../src/auth/googleSignIn'), signOutOfGoogle: async () => {} }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { setDataSpace } from '../../src/utils/dataSpace';
import { __resetForTests, listParked, startAppData } from '../../src/utils/dataSpaceController';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useSettingsStore, DEFAULT_SETTINGS } from '../../src/store/useSettingsStore';
import { useEntitlementStore } from '../../src/store/useEntitlementStore';
import { useSyncStore } from '../../src/store/useSyncStore';
import { useJournalStore } from '../../src/store/useJournalStore';
import { syncInFlight, syncNow, unsentChanges } from '../../src/sync/syncController';
import { startAccountConsent, noteConsentSource } from '../../src/sync/accountConsent';
import { chooseForAccount, signOutAndChoose, useAccountChoiceStore } from '../../src/sync/signInFlow';
import { currentBackupStatus } from '../../src/sync/backupStatus';
import { startEntitlementSync } from '../../src/utils/entitlementBootstrap';
import { admin, newUser, setTrial, DAY, fromNow, type TestUser } from './local';

const storage = AsyncStorage as unknown as { clear: () => Promise<void> };
const entry = (id: string) => ({ id, date: '2026-10-24', zone: 'calm', text: id, tags: [], createdAt: '2026-10-24T08:00:00.000Z', updatedAt: '2026-10-24T08:00:00.000Z' });

async function until(what: string, ok: () => boolean | Promise<boolean>, ms = 10_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await ok()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timed out waiting for: ${what}`);
}

let stops: (() => void)[] = [];
async function freshPhone() {
  stops.forEach((s) => s());
  await storage.clear();
  __resetForTests();
  setDataSpace('real');
  useAuthStore.setState({ session: null, initializing: false });
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, consent: { ...DEFAULT_SETTINGS.consent } });
  useSyncStore.getState().reset();
  useEntitlementStore.setState({ snapshots: {} } as never);
  useAccountChoiceStore.setState({ pending: null, readyFor: null, busy: false, hidden: false });
  await startAppData(storage as never, false);
  stops = [startEntitlementSync(), startAccountConsent()];
}
// As the sign-in screen does; waits for the account's consent and plan.
async function signIn(u: TestUser) {
  noteConsentSource('sign-in');
  mockPhone.db = u.db;
  useAuthStore.setState({ session: { user: { id: u.id, email: u.email } } as never, initializing: false });
  await until('consent and plan', () => useSettingsStore.getState().consent.storeData && !!useEntitlementStore.getState().snapshots[u.id]);
}
async function sync() {
  const r = await syncNow();
  await syncInFlight();
  return r;
}
const write = (...ids: string[]) => useJournalStore.setState((s) => ({ entries: [...s.entries, ...ids.map(entry)] }) as never);
const onPhone = () => useJournalStore.getState().entries.map((e) => e.id).sort();
async function inAccount(u: TestUser): Promise<string[]> {
  const { data, error } = await admin().from('sync_records').select('record_id').eq('user_id', u.id).eq('deleted', false);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: { record_id: string }) => r.record_id).sort();
}
async function seed(u: TestUser, ...ids: string[]) {
  const { error } = await admin()
    .from('sync_records')
    .insert(ids.map((id) => ({ user_id: u.id, collection: 'journaling.entries', record_id: id, data: entry(id), deleted: false, client_updated_at: new Date().toISOString() })));
  if (error) throw new Error(error.message);
}
const pending = () => useAccountChoiceStore.getState().pending;

afterEach(() => {
  stops.forEach((s) => s());
  stops = [];
});

test('BE-ACC-001 this phone\'s data, empty account: asked with the real count; Continue sends it', async () => {
  const u = await newUser('acc');
  await freshPhone();
  write('g1', 'g2');
  await signIn(u);
  await sync();
  expect(pending()).toMatchObject({ kind: 'adopt', here: 2 });
  expect(await inAccount(u)).toEqual([]);
  await chooseForAccount('continue');
  await sync();
  expect(await inAccount(u)).toEqual(['g1', 'g2']);
});

test('BE-ACC-002 data here and in the account: the counts come from the server; Merge gives both everything', async () => {
  const u = await newUser('acc');
  await seed(u, 'a1', 'a2');
  await freshPhone();
  write('g1');
  await signIn(u);
  await sync();
  expect(pending()).toMatchObject({ kind: 'merge', here: 1, inAccount: 2 });
  await chooseForAccount('merge');
  await sync();
  expect(onPhone()).toEqual(['a1', 'a2', 'g1']);
  expect(await inAccount(u)).toEqual(['a1', 'a2', 'g1']);
});

test('BE-ACC-003 Keep separate: nothing of this phone reaches the account', async () => {
  const u = await newUser('acc');
  await seed(u, 'a1');
  await freshPhone();
  write('g1');
  await signIn(u);
  await sync();
  await chooseForAccount('keepSeparate');
  await sync();
  expect(onPhone()).toEqual(['a1']);
  expect(await inAccount(u)).toEqual(['a1']);
  expect(await listParked()).toEqual([expect.objectContaining({ records: 1 })]);
});

test('BE-ACC-004 another account on the phone: nothing of A reaches B unless chosen; A\'s account is untouched either way', async () => {
  const a = await newUser('acc-a');
  const b = await newUser('acc-b');
  await seed(b, 'b1');
  await freshPhone();
  await signIn(a);
  await sync();
  write('a1');
  await sync();
  expect(await inAccount(a)).toEqual(['a1']);
  await signOutAndChoose(true);
  await signIn(b);
  await sync();
  expect(pending()).toMatchObject({ kind: 'otherAccount', otherOwner: a.id });
  expect(await inAccount(b)).toEqual(['b1']);
  await chooseForAccount('keepSeparate');
  await sync();
  expect(onPhone()).toEqual(['b1']);
  expect(await inAccount(b)).toEqual(['b1']);
  expect(await inAccount(a)).toEqual(['a1']);
});

test('BE-ACC-005 Merge with the trial over: the server sends the account\'s data, refuses uploads, and the phone keeps its changes waiting', async () => {
  const u = await newUser('acc');
  await setTrial(u.id, fromNow(-10 * DAY));
  await seed(u, 'a1');
  await freshPhone();
  write('g1');
  await signIn(u);
  await sync();
  await chooseForAccount('merge');
  const r = await sync();
  expect(r).toMatchObject({ ok: true, downloadOnly: true });
  expect(onPhone()).toEqual(['a1', 'g1']);
  expect(await inAccount(u)).toEqual(['a1']);
  expect(unsentChanges()).toBe(1);
  expect(currentBackupStatus().kind).toBe('withoutPlus');
  // And the server itself refuses, even if the app tried.
  const direct = await u.db.from('sync_records').insert({ user_id: u.id, collection: 'journaling.entries', record_id: 'g1', data: entry('g1'), deleted: false, client_updated_at: new Date().toISOString() });
  expect(direct.error).not.toBeNull();
});

test('BE-ACC-006 sign out with Remove, sign in again: the phone empties, then everything comes back from the account', async () => {
  const u = await newUser('acc');
  await freshPhone();
  await signIn(u);
  await sync();
  write('j1', 'j2');
  await sync();
  await signOutAndChoose(false);
  expect(onPhone()).toEqual([]);
  expect(await inAccount(u)).toEqual(['j1', 'j2']);
  await signIn(u);
  await sync();
  expect(onPhone()).toEqual(['j1', 'j2']);
});
