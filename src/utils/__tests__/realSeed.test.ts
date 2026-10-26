// The data the real-account tests (supabase/tests/realAccount.test.ts) put in
// an account: every section has some, none of it looks like Demo data, and
// Recap shows every section from it. Checked here so a CI failure there
// means the server, not the seed. IDs: docs/test-cases/backend.md (BE-REAL-*)
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));
import { SEED_REFERENCE_DATE, seededSections } from '../../test-utils/realSeed';
import { bringFeelingsTogether } from '../../feelings/fromSections';
import { LOCAL_DATA } from '../localData';
import { syncedCollections, toRecords } from '../../sync/records';
import { RECAP_CONTRIBUTORS } from '../../recap/registry';
import { periodStats } from '../recapStats';
import { addDaysISO } from '../date';
import { useClock, restoreClock } from '../../test-utils';

beforeEach(() => useClock('2026-10-25T12:00'));
afterEach(() => restoreClock());

test('BE-REAL-SEED-002 the seed never depends on the calendar: the same data on any day the tests run, by default for its fixed date', () => {
  const runs = ['2026-01-02T03:00', '2026-10-26T12:00', '2027-06-30T23:30'].map((when) => {
    useClock(when);
    return JSON.stringify(seededSections());
  });
  expect(new Set(runs).size).toBe(1);
  expect(runs[0]).toBe(JSON.stringify(seededSections(SEED_REFERENCE_DATE)));
});

test('BE-REAL-SEED-003 the seed is as the app keeps data: bringing feelings together changes nothing (so a restore compares like with like)', () => {
  const seeded = seededSections();
  for (const [section, state] of Object.entries(seeded)) LOCAL_DATA[section]?.store.setState(state as never);
  const before = JSON.stringify(Object.keys(LOCAL_DATA).map((s) => LOCAL_DATA[s].keys.map((k) => (LOCAL_DATA[s].store.getState() as Record<string, unknown>)[k])));
  expect(bringFeelingsTogether()).toEqual({ journal: 0, quit: 0 });
  const after = JSON.stringify(Object.keys(LOCAL_DATA).map((s) => LOCAL_DATA[s].keys.map((k) => (LOCAL_DATA[s].store.getState() as Record<string, unknown>)[k])));
  expect(after).toBe(before);
  // ...and the seed does carry journal and Quit feelings, so this means something.
  const kinds = new Set(((seeded.feelings.entries ?? []) as { source?: { kind: string } }[]).map((e) => e.source?.kind));
  expect(kinds.has('journal') && kinds.has('quitHabit')).toBe(true);
});

test('BE-REAL-SEED-001 eight weeks in every section, as ordinary data (no "-demo-" ids), and Recap has every section', () => {
  const today = '2026-10-25';
  const seeded = seededSections(today);
  expect(JSON.stringify(seeded)).not.toContain('-demo-');
  const records = syncedCollections().map((c) => [c.key, toRecords(c.key, seeded[c.section]?.[c.field]).size] as const);
  const total = records.reduce((n, [, k]) => n + k, 0);
  expect(total).toBeGreaterThan(500);
  for (const section of Object.keys(LOCAL_DATA)) expect({ section, has: !!seeded[section] }).toEqual({ section, has: true });
  const s = (x: string) => seeded[x] as Record<string, unknown>;
  const data = {
    tasks: s('dailyPlanning').tasks, journalEntries: s('journaling').entries, thoughts: s('catchAThought').thoughts, studySessions: s('studySession').sessions, meals: s('dietPlanning').plannedMeals,
    songs: s('songwriting').songs, gameResults: s('mindGames').results, feelingCheckIns: s('feelings').entries, sleepLogs: s('sleep').logs, readingEntries: s('book').entries, readingSessions: s('book').sessions,
    quotes: s('book').quotes, plans: s('planBuilder').plans, skills: s('skills').skills, skillSessions: s('skills').sessions, habits: s('habits').habits, habitCheckIns: s('habits').checkIns,
    budgets: s('budget').budgets, budgetEntries: s('budget').entries, quitHabits: s('quitHabit').habits, quitTracks: s('quitHabit').tracks, quitFeelingEntries: s('quitHabit').feelingEntries,
    quitSlips: s('quitHabit').slips ?? [], quitCravingSessions: s('quitHabit').cravingSessions ?? [], bestMoments: [],
  } as never;
  const ctx = { data, stats: periodStats(data, { start: addDaysISO(today, -56), end: today } as never), today };
  expect(RECAP_CONTRIBUTORS.filter((c) => !c.build(ctx).hasData).map((c) => c.section)).toEqual([]);
});
