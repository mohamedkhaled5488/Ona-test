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
import { SEED_REFERENCE_DATE, seededSections as seedFor } from '../../src/test-utils/realSeed';
import { RECAP_CONTRIBUTORS } from '../../src/recap/registry';
import { periodStats, type RecapData } from '../../src/utils/recapStats';
import { METRICS, TOTAL, countIn, metricCount, type MetricId } from '../../src/metrics/registry';
import { journeyCounts } from '../../src/quit/journey';
import { totalMinutesFor } from '../../src/utils/skillProgress';
import { addDaysISO } from '../../src/utils/date';
import { tagInsight } from '../../src/utils/feelingsInsights';
import { logFeeling } from '../../src/feelings/logFeeling';
import { useFeelingsStore } from '../../src/store/useFeelingsStore';
import { useJournalStore } from '../../src/store/useJournalStore';
import { useLettersStore } from '../../src/store/useLettersStore';
import { useReflectionStore } from '../../src/store/useReflectionStore';
import { useSupportStore } from '../../src/store/useSupportStore';
import { admin, newUser, setTrial, setSubscription, DAY, fromNow, type TestUser } from './local';

const storage = AsyncStorage as unknown as { clear: () => Promise<void> };
// The seed's fixed reference date, never the calendar: every count below is
// the same on every day (BE-REAL-005 once failed only because of the date).
const TODAY = SEED_REFERENCE_DATE;

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

// What Recap reads, from this phone's stores.
function phoneData(): RecapData {
  const s = (section: string) => LOCAL_DATA[section].store.getState() as Record<string, unknown>;
  return {
    tasks: s('dailyPlanning').tasks, journalEntries: s('journaling').entries, thoughts: s('catchAThought').thoughts, studySessions: s('studySession').sessions, meals: s('dietPlanning').plannedMeals,
    songs: s('songwriting').songs, gameResults: s('mindGames').results, feelingCheckIns: s('feelings').entries, sleepLogs: s('sleep').logs, readingEntries: s('book').entries, readingSessions: s('book').sessions,
    quotes: s('book').quotes, plans: s('planBuilder').plans, skills: s('skills').skills, skillSessions: s('skills').sessions, habits: s('habits').habits, habitCheckIns: s('habits').checkIns,
    budgets: s('budget').budgets, budgetEntries: s('budget').entries, quitHabits: s('quitHabit').habits, quitTracks: s('quitHabit').tracks, quitFeelingEntries: s('quitHabit').feelingEntries,
    quitSlips: s('quitHabit').slips, quitCravingSessions: s('quitHabit').cravingSessions, bestMoments: [],
  } as never;
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
  const data = phoneData();
  const range = { start: addDaysISO(TODAY, -56), end: TODAY };
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
  // Exact, from the seed on its fixed reference date (BE-REAL-SEED-002 keeps
  // the seed the same whatever the calendar says). A change to the Demo
  // generator can change these; then update them here.
  expect(edited).toBe(14); // 15 before held sections (Songwriting, Mind Games) left the seed
  expect(deleted).toBe(24);
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
  // The network drops on the second page of the download. (Inside the
  // user's client: supabase-js keeps its own fetch, so replacing the global
  // one does nothing.)
  let pages = 0;
  const dropSecondPage = <T extends object>(query: T): T =>
    new Proxy(query, {
      get(target, key) {
        const value = (target as Record<string | symbol, unknown>)[key];
        if (key === 'then') {
          return (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) =>
            ++pages === 2 ? Promise.reject(new TypeError('Network request failed')).then(ok, fail) : (value as (a: unknown, b: unknown) => Promise<unknown>).call(target, ok, fail);
        }
        return typeof value === 'function' ? (...args: unknown[]) => dropSecondPage((value as (...a: unknown[]) => object).apply(target, args)) : value;
      },
    });
  const realDb = u.db;
  mockPhone.db = new Proxy(realDb, {
    get(target, key) {
      if (key !== 'from') return (target as unknown as Record<string | symbol, unknown>)[key];
      return (table: string) => {
        const builder = target.from(table);
        if (table !== 'sync_records') return builder;
        // Downloads only (select); uploads (upsert(...).select()) go through.
        return new Proxy(builder, {
          get(b, k) {
            const v = (b as unknown as Record<string | symbol, unknown>)[k];
            if (k === 'select') return (...args: unknown[]) => dropSecondPage((v as (...a: unknown[]) => object).apply(b, args));
            return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(b) : v;
          },
        });
      };
    },
  });
  try {
    expect((await sync()).ok).toBe(false);
    expect(pages).toBeGreaterThanOrEqual(2);
  } finally {
    mockPhone.db = realDb;
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
    const day = addDaysISO(TODAY, -k * 56);
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

// Problem 1 from a phone (2026-10-29): a feeling noted in the journal, with a
// "What's behind this?" tag, through a real account: on a fresh phone it's in
// the Feelings log and in Analysis by tag, linked to its entry.
test('BE-REAL-010 a journal feeling with a tag reaches a fresh phone and its Analysis by tag', async () => {
  const u = await newUser('real');
  await freshPhone();
  await signIn(u);
  await sync();
  useJournalStore.getState().upsertEntry(TODAY, undefined, 'A long meeting.', []);
  const jid = useJournalStore.getState().entries.find((e) => e.date === TODAY)!.id;
  logFeeling({ source: { kind: 'journal', refId: jid }, zone: 'tense', tags: ['Work'] });
  await sync();
  await freshPhone();
  await signIn(u);
  await sync();
  const entries = useFeelingsStore.getState().entries;
  expect(entries.find((e) => e.source?.kind === 'journal' && e.source.refId === jid)).toMatchObject({ zone: 'tense', reasonTags: ['Work'], date: TODAY });
  expect(useJournalStore.getState().entries.find((e) => e.id === jid)).toMatchObject({ zone: 'tense', feelingChosen: true });
  expect(tagInsight(entries, 'Work')).toMatchObject({ n: 1 });
});

// Problem 2 from a phone (2026-10-29): Recap said 5 clean days, Quit said 8.
// Through a real account: on a fresh phone every number is the same as on the
// phone that wrote it, and the sections' "in total" numbers equal Recap's
// over the whole history (metrics/registry.ts, one definition each).
test('BE-REAL-011 every number shown in both Recap and a section matches by scope, before and after a restore', async () => {
  const u = await newUser('real');
  await freshPhone();
  await signIn(u);
  await sync();
  loadIntoPhone(seededSections());
  const ids = Object.keys(METRICS) as MetricId[];
  const counts = (d: RecapData) => Object.fromEntries(ids.map((id) => [id, metricCount(id, d, TOTAL, TODAY)]));
  const before = counts(phoneData());
  await sync();
  await freshPhone();
  await signIn(u);
  await sync();
  const data = phoneData();
  expect(counts(data)).toEqual(before);
  const start = [...data.quitTracks.map((t) => t.startDate), ...data.habitCheckIns.map((c) => c.date), ...data.skillSessions.map((x) => x.date)].reduce((m, d) => (d < m ? d : m), TODAY);
  const stats = periodStats(data, { start, end: TODAY });
  const clean = data.quitHabits.reduce((n, h) => n + journeyCounts(data.quitTracks, data.quitSlips ?? [], h.id, TODAY).cleanDays, 0);
  expect(countIn('cleanDays', data, { start, end: TODAY }, TODAY)).toBe(clean);
  expect(stats.habitCompletions).toBe(data.habits.reduce((n, h) => n + metricCount('habitCheckIns', data, TOTAL, TODAY, undefined, { habitId: h.id }), 0));
  expect(stats.minutes.skills).toBe(data.skills.reduce((n, k) => n + totalMinutesFor(data.skillSessions, k.id), 0));
});

// Reflection, Letters to Myself and Support for this feeling (held in the app
// until the owner's review, synced already): through a real account, sessions
// and letters reach a fresh phone the same, a reminder id never leaves the
// phone, Support's memory never does, and another account sees none of it.
test('BE-REAL-012 reflections and letters reach a fresh phone; Support\'s memory and reminder ids stay on the phone; another account sees nothing', async () => {
  const u = await newUser('real');
  await freshPhone();
  await signIn(u);
  await sync();
  const sid = useReflectionStore.getState().start({ mode: 'free', title: 'Mine', questions: [{ question: 'What matters?' }] });
  useReflectionStore.getState().setAnswer(sid, useReflectionStore.getState().sessions[0].answers[0].id, 'Quiet mornings');
  useReflectionStore.getState().finish(sid, { takeaway: 'Protect mornings', tags: ['me'] });
  const lid = useLettersStore.getState().addLetter({ kind: 'date', zones: [], feelingIds: [], text: 'Hello, future me', deliverOn: '2027-01-01', remind: true });
  useLettersStore.getState().setNotificationIds(lid, ['phone-only-1']);
  useSupportStore.getState().vote('tense.do.walk', 'yes');
  await sync();
  const { data: rows } = await admin().from('sync_records').select('collection, data').eq('user_id', u.id);
  const collections = (rows ?? []).map((r) => r.collection as string);
  expect(collections).toEqual(expect.arrayContaining(['reflection.sessions', 'letters.letters']));
  expect(collections.filter((c) => c.startsWith('support.'))).toEqual([]);
  expect(JSON.stringify(rows)).not.toContain('phone-only-1');

  await freshPhone();
  await signIn(u);
  await sync();
  expect(useReflectionStore.getState().sessions.find((s) => s.id === sid)).toMatchObject({ status: 'done', takeaway: 'Protect mornings' });
  expect(useReflectionStore.getState().sessions.find((s) => s.id === sid)!.answers[0].answer).toBe('Quiet mornings');
  expect(useLettersStore.getState().letters.find((l) => l.id === lid)).toMatchObject({ text: 'Hello, future me', deliverOn: '2027-01-01' });
  expect(useLettersStore.getState().letters.find((l) => l.id === lid)!.notificationIds).toBeUndefined();
  expect(useSupportStore.getState().votes).toEqual({});

  // Another account: nothing of these is visible to it (row-level security).
  const other = await newUser('real-other');
  const { data: theirs } = await other.db.from('sync_records').select('record_id').in('collection', ['reflection.sessions', 'letters.letters']);
  expect(theirs ?? []).toEqual([]);
});
