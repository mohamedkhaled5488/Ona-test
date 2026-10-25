// Real-account tests (Sleep spec, part B1/B2), on the local stack in CI: real
// sign-in state, real row-level security, real trial rules, and an account
// filled with about eight weeks of realistic data in every section (the
// Demo mode generator, ids re-marked so they're ordinary data), written
// through Ona's own sync code, not straight into the database. Then a fresh
// phone signs in and must get every item back, and the account's plan state
// must behave as described. The service key is used only here, to arrange
// trial dates and to check what the server really holds.
// IDs: docs/test-cases/backend.md (BE-REAL-*)
jest.mock('../../src/utils/notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));
jest.mock('../../src/utils/reminders', () => ({ resyncFeature: jest.fn(async () => {}) }));
jest.mock('../../src/utils/network', () => ({ isOnline: async () => true }));
const mockPhone: { db: unknown } = { db: null };
jest.mock('../../src/lib/supabase', () => {
  const auth = { signOut: async () => ({ error: null }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) };
  const supabase = new Proxy({}, { get: (_t, key) => (key === 'auth' ? auth : ((mockPhone.db as Record<string | symbol, unknown>)[key] as (...a: unknown[]) => unknown).bind(mockPhone.db)) });
  return { isSupabaseConfigured: true, supabaseUrl: 'http://127.0.0.1', supabase };
});
jest.setTimeout(120_000);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { setDataSpace } from '../../src/utils/dataSpace';
import { __resetForTests, startAppData } from '../../src/utils/dataSpaceController';
import { LOCAL_DATA } from '../../src/utils/localData';
import { fingerprint, stableStringify, syncedCollections, toRecords } from '../../src/sync/records';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useSettingsStore, DEFAULT_SETTINGS } from '../../src/store/useSettingsStore';
import { useEntitlementStore } from '../../src/store/useEntitlementStore';
import { useSyncStore } from '../../src/store/useSyncStore';
import { syncInFlight, syncNow, unsentChanges } from '../../src/sync/syncController';
import { startAccountConsent, noteConsentSource } from '../../src/sync/accountConsent';
import { chooseForAccount, useAccountChoiceStore } from '../../src/sync/signInFlow';
import { startEntitlementSync } from '../../src/utils/entitlementBootstrap';
import { computeEntitlement } from '../../src/utils/entitlement';
import { seededSections as seedFor } from '../../src/test-utils/realSeed';
import { RECAP_CONTRIBUTORS } from '../../src/recap/registry';
import { periodStats } from '../../src/utils/recapStats';
import { admin, newUser, setTrial, setSubscription, DAY, fromNow, type TestUser } from './local';

const storage = AsyncStorage as unknown as { clear: () => Promise<void> };
const TODAY = new Date().toISOString().slice(0, 10);

const seededSections = () => seedFor(TODAY);

async function until(what: string, ok: () => boolean, ms = 15_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (ok()) return;
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
async function signIn(u: TestUser) {
  noteConsentSource('sign-in');
  mockPhone.db = u.db;
  useAuthStore.setState({ session: { user: { id: u.id, email: u.email } } as never, initializing: false });
  await until('consent and plan', () => useSettingsStore.getState().consent.storeData && !!useEntitlementStore.getState().snapshots[u.id]);
}
async function sync() {
  const r = await syncNow();
  await syncInFlight();
  // A failed sync says why (diagnosis in the CI log).
  if (!r.ok) console.log(`sync failed: ${r.message}`);
  return r;
}
// What's still unsent, by collection (diagnosis in the CI log).
function unsentByCollection(): Record<string, number> {
  const { fingerprints } = useSyncStore.getState();
  const out: Record<string, number> = {};
  for (const [c, m] of Object.entries(phoneRecords())) {
    const known = fingerprints[c] ?? {};
    let n = 0;
    for (const [id, data] of m) if (known[id] !== fingerprint(data)) n++;
    for (const id of Object.keys(known)) if (!m.has(id)) n++;
    if (n) out[c] = n;
  }
  return out;
}
function loadIntoPhone(sections: Record<string, Record<string, unknown>>) {
  for (const [section, state] of Object.entries(sections)) {
    const store = LOCAL_DATA[section]?.store;
    if (store) store.setState(state as never);
  }
}
// Every synced item on this phone, as the sync records it (phone-only fields aside).
function phoneRecords(): Record<string, Map<string, unknown>> {
  return Object.fromEntries(syncedCollections().map((c) => [c.key, toRecords(c.key, (LOCAL_DATA[c.section].store.getState() as Record<string, unknown>)[c.field])]));
}

afterEach(() => {
  stops.forEach((s) => s());
  stops = [];
});


test('BE-REAL-001 an account with eight weeks of every section: it all goes up through the app, and a fresh phone gets every item back, the same', async () => {
  const u = await newUser('real');
  await freshPhone();
  await signIn(u); // empty account, empty phone: nothing to ask
  await sync(); // the phone is now this account's
  loadIntoPhone(seededSections());
  const before = phoneRecords();
  const total = Object.values(before).reduce((n, m) => n + m.size, 0);
  expect(total).toBeGreaterThan(500);
  const started = Date.now();
  await sync();
  expect(unsentChanges()).toBe(0);
  const { count } = await admin().from('sync_records').select('record_id', { count: 'exact', head: true }).eq('user_id', u.id).eq('deleted', false);
  expect(count).toBe(total);

  await freshPhone(); // a new phone, or a reinstall
  await signIn(u);
  const r = await sync();
  const restoreMs = Date.now() - started;
  expect(r.ok).toBe(true);
  const after = phoneRecords();
  for (const c of Object.keys(before)) {
    // Key order isn't meaningful (Postgres stores JSON with its own key
    // order); compared as sync does, with sorted keys.
    const a = [...before[c].entries()].sort(([x], [y]) => x.localeCompare(y));
    const b = [...after[c].entries()].sort(([x], [y]) => x.localeCompare(y));
    expect({ c, items: stableStringify(b) }).toEqual({ c, items: stableStringify(a) });
  }
  console.log(`BE-REAL-001: ${total} items in ${Object.keys(before).length} collections, up and back in ${restoreMs} ms`);
});

test('BE-REAL-002 on the restored phone, Recap has every section that has data, Quit included', async () => {
  const u = await newUser('real');
  await freshPhone();
  await signIn(u);
  await sync(); // the phone is now this account's (no Continue question)
  const seeded = seededSections();
  loadIntoPhone(seeded);
  await sync();
  await freshPhone();
  await signIn(u);
  await sync();
  const s = (section: string) => LOCAL_DATA[section].store.getState() as Record<string, unknown>;
  const data = {
    tasks: s('dailyPlanning').tasks, journalEntries: s('journaling').entries, thoughts: s('catchAThought').thoughts, studySessions: s('studySession').sessions, meals: s('dietPlanning').plannedMeals,
    songs: s('songwriting').songs, gameResults: s('mindGames').results, feelingCheckIns: s('feelings').entries, sleepLogs: s('sleep').logs, readingEntries: s('book').entries, readingSessions: s('book').sessions,
    quotes: s('book').quotes, plans: s('planBuilder').plans, skills: s('skills').skills, skillSessions: s('skills').sessions, habits: s('habits').habits, habitCheckIns: s('habits').checkIns,
    budgets: s('budget').budgets, budgetEntries: s('budget').entries, quitHabits: s('quitHabit').habits, quitTracks: s('quitHabit').tracks, quitFeelingEntries: s('quitHabit').feelingEntries,
    quitSlips: s('quitHabit').slips, quitCravingSessions: s('quitHabit').cravingSessions, bestMoments: [],
  } as never;
  const range = { start: new Date(Date.now() - 56 * DAY).toISOString().slice(0, 10), end: TODAY };
  const ctx = { data, stats: periodStats(data, range as never), today: TODAY };
  const empty = RECAP_CONTRIBUTORS.filter((c) => !c.build(ctx).hasData).map((c) => c.section);
  expect(empty).toEqual([]);
});

test('BE-REAL-003 the plan states, from the server\'s own dates: day 1, mid-trial, ended, Plus', async () => {
  const fresh = await newUser('real-day1');
  await fresh.db.rpc('start_trial');
  const mid = await newUser('real-mid');
  await setTrial(mid.id, fromNow(15 * DAY), fromNow(-15 * DAY));
  const ended = await newUser('real-ended');
  await setTrial(ended.id, fromNow(-2 * DAY));
  const plus = await newUser('real-plus');
  await setTrial(plus.id, fromNow(-40 * DAY));
  await setSubscription(plus.id, { status: 'active', expires_at: fromNow(20 * DAY).toISOString() });
  const states: Record<string, { syncAccess: boolean; state: string }> = {};
  for (const [name, u] of Object.entries({ fresh, mid, ended, plus })) {
    await freshPhone();
    await signIn(u);
    const e = computeEntitlement(useEntitlementStore.getState().snapshots[u.id], Date.now());
    states[name] = { syncAccess: e.syncAccess, state: e.state };
  }
  expect(states).toEqual({
    fresh: { syncAccess: true, state: 'trial' },
    mid: { syncAccess: true, state: 'trial' },
    ended: { syncAccess: false, state: 'trialEnded' },
    plus: { syncAccess: true, state: 'subscribed' },
  });
});

test('BE-REAL-004 trial ended: the account\'s data still comes down; this phone\'s changes wait, and the server itself refuses them', async () => {
  const u = await newUser('real');
  await freshPhone();
  await signIn(u);
  await sync(); // the phone is now this account's
  loadIntoPhone(seededSections());
  await sync();
  await setTrial(u.id, fromNow(-1 * DAY));
  await freshPhone();
  await signIn(u);
  const r = await sync();
  expect(r).toMatchObject({ ok: true, downloadOnly: true });
  expect(phoneRecords()['journaling.entries'].size).toBeGreaterThan(0);
  const direct = await u.db.from('sync_records').insert({ user_id: u.id, collection: 'journaling.entries', record_id: 'x', data: {}, deleted: false, client_updated_at: new Date().toISOString() });
  expect(direct.error).not.toBeNull();
  await chooseForAccount('merge'); // nothing pending: a no-op
});

// --- B2: more of what a person does, on a real server ------------------------

// One small edit in every item list, and one item removed from each: what a
// second phone must get.
function editAndDeleteEverywhere(): { edited: number; deleted: number } {
  let edited = 0;
  let deleted = 0;
  for (const c of syncedCollections()) {
    const store = LOCAL_DATA[c.section].store;
    const list = (store.getState() as Record<string, unknown>)[c.field];
    if (!Array.isArray(list) || list.length < 2 || typeof list[0] !== 'object' || list[0] === null || !('id' in list[0])) continue;
    const [first, ...rest] = list as Record<string, unknown>[];
    const key = ['title', 'name', 'text', 'note', 'label'].find((k) => typeof first[k] === 'string');
    const changed = key ? { ...first, [key]: `${first[key] as string} (edited on phone B)` } : first;
    if (key) edited++;
    store.setState({ [c.field]: [changed, ...rest.slice(0, -1)] } as never);
    deleted++;
  }
  return { edited, deleted };
}
const same = (a: Record<string, Map<string, unknown>>, b: Record<string, Map<string, unknown>>) =>
  Object.keys(a).map((c) => ({ c, same: stableStringify([...a[c].entries()].sort(([x], [y]) => x.localeCompare(y))) === stableStringify([...(b[c] ?? new Map()).entries()].sort(([x], [y]) => x.localeCompare(y))) })).filter((r) => !r.same);

test('BE-REAL-005 two phones: edits and deletes in every section on one reach the other', async () => {
  const u = await newUser('real');
  await freshPhone();
  await signIn(u);
  await sync();
  loadIntoPhone(seededSections());
  await sync(); // phone A
  await freshPhone();
  await signIn(u);
  await sync(); // phone B has everything
  const { edited, deleted } = editAndDeleteEverywhere();
  expect(edited).toBeGreaterThan(15);
  expect(deleted).toBeGreaterThan(20);
  await sync();
  const onB = phoneRecords();
  await freshPhone(); // phone A again, fresh, or a third phone
  await signIn(u);
  await sync();
  expect(same(onB, phoneRecords())).toEqual([]);
});

test('BE-REAL-006 offline edits wait, and go up when the phone is back online', async () => {
  const u = await newUser('real');
  await freshPhone();
  await signIn(u);
  await sync();
  loadIntoPhone(seededSections());
  await sync();
  useSettingsStore.setState({ devSimulateOffline: true });
  editAndDeleteEverywhere();
  expect((await sync()).ok).toBe(false);
  expect(unsentChanges()).toBeGreaterThan(20);
  const offline = phoneRecords();
  useSettingsStore.setState({ devSimulateOffline: false });
  const back = await sync();
  if (unsentChanges()) console.log(`BE-REAL-006 still unsent after reconnecting: ${JSON.stringify(unsentByCollection())}; result ${JSON.stringify(back)}`);
  expect(unsentChanges()).toBe(0);
  await freshPhone();
  await signIn(u);
  await sync();
  expect(same(offline, phoneRecords())).toEqual([]);
});

test('BE-REAL-007 consent off: nothing goes up', async () => {
  const u = await newUser('real');
  await freshPhone();
  await signIn(u);
  await sync();
  useSettingsStore.getState().setConsent({ storeData: false });
  loadIntoPhone(seededSections());
  await sync();
  const { count } = await admin().from('sync_records').select('record_id', { count: 'exact', head: true }).eq('user_id', u.id);
  expect(count).toBe(0);
});

test('BE-REAL-008 a restore that fails halfway (the network drops after the first page) finishes on the next try, whole, nothing twice', async () => {
  const u = await newUser('real');
  await freshPhone();
  await signIn(u);
  await sync();
  loadIntoPhone(seededSections());
  await sync();
  const all = phoneRecords();
  await freshPhone();
  await signIn(u);
  const realFetch = global.fetch;
  let pulls = 0;
  global.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/rest/v1/sync_records') && (!init?.method || init.method === 'GET') && ++pulls === 2) return Promise.reject(new TypeError('Network request failed'));
    return realFetch(input, init);
  }) as typeof fetch;
  try {
    expect((await sync()).ok).toBe(false);
  } finally {
    global.fetch = realFetch;
  }
  // Nothing half-written as if it were complete.
  const partial = Object.values(phoneRecords()).reduce((n, m) => n + m.size, 0);
  expect(partial === 0 || partial === Object.values(all).reduce((n, m) => n + m.size, 0)).toBe(true);
  const retry = await sync();
  console.log(`BE-REAL-008 retry: ${JSON.stringify(retry)}`);
  expect(same(all, phoneRecords())).toEqual([]);
});

test('BE-REAL-009 about a year of data: restore time and memory, on a fresh phone', async () => {
  const u = await newUser('real');
  await freshPhone();
  await signIn(u);
  await sync();
  // Six eight-week stretches, each its own items.
  const merged: Record<string, Record<string, unknown>> = {};
  for (let k = 0; k < 6; k++) {
    const day = new Date(Date.now() - k * 56 * DAY).toISOString().slice(0, 10);
    const chunk = JSON.parse(JSON.stringify(seedFor(day, `ona-real-year-${k}`)).split('-seed-').join(`-y${k}-`)) as Record<string, Record<string, unknown>>;
    for (const [section, state] of Object.entries(chunk)) {
      merged[section] ??= {};
      for (const [field, value] of Object.entries(state)) {
        const prev = merged[section][field];
        merged[section][field] = Array.isArray(prev) && Array.isArray(value) ? [...prev, ...value] : prev ?? value;
      }
    }
  }
  loadIntoPhone(merged);
  const total = Object.values(phoneRecords()).reduce((n, m) => n + m.size, 0);
  expect(total).toBeGreaterThan(2500);
  const up = await sync();
  console.log(`BE-REAL-009 upload: ${JSON.stringify(up)}; unsent ${unsentChanges()}`);
  await freshPhone();
  await signIn(u);
  const heap0 = process.memoryUsage().heapUsed;
  const t0 = Date.now();
  await sync();
  const ms = Date.now() - t0;
  const mb = (process.memoryUsage().heapUsed - heap0) / 1e6;
  expect(Object.values(phoneRecords()).reduce((n, m) => n + m.size, 0)).toBe(total);
  console.log(`BE-REAL-009: ${total} items restored in ${ms} ms, heap +${mb.toFixed(1)} MB`);
  expect(ms).toBeLessThan(60_000);
});
