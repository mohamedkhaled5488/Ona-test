// One definition per number (metrics/registry.ts), over the real seeded data.
// Problem 2 from a phone (2026-10-29): Recap said 5 clean days, Quit said 8:
// both true, for different scopes, with the same label. Now:
// - the same scope gives the same number in Recap and in the section;
// - a Recap period is never more than the whole history, and the periods of
//   a history add up to it (weeks with either week start, month ends);
// - every label says its scope ("this week", "in total");
// - days are the phone's own (also run with TZ=Pacific/Auckland and
//   America/Los_Angeles in CI), older chapters ended by a slip count the same.
// IDs: docs/test-cases/integration.md (METRIC-*)
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));

import { seededSections, SEED_REFERENCE_DATE } from '../../test-utils/realSeed';
import { METRICS, TOTAL, countIn, metricCount, metricLabel, scopeWords, type MetricId, type MetricScope } from '../../metrics/registry';
import { sectionRecaps, type RecapContext } from '../../recap/registry';
import { periodStats, type RecapData } from '../recapStats';
import { journeyCounts } from '../../quit/journey';
import { totalMinutesFor } from '../skillProgress';
import { addDaysISO } from '../date';
import { weekStartFor } from '../feelingsStats';
import type { QuitTrack } from '../../types/sections';

const TODAY = SEED_REFERENCE_DATE;
function recapData(): RecapData {
  const s = seededSections();
  const g = (section: string, key: string) => ((s[section] as Record<string, unknown>)?.[key] ?? []) as never;
  return {
    tasks: g('dailyPlanning', 'tasks'), journalEntries: g('journaling', 'entries'), thoughts: g('catchAThought', 'thoughts'), studySessions: g('studySession', 'sessions'),
    meals: g('dietPlanning', 'plannedMeals'), songs: g('songwriting', 'songs'), gameResults: g('mindGames', 'results'), feelingCheckIns: g('feelings', 'entries'),
    sleepLogs: g('sleep', 'logs'), readingEntries: g('book', 'entries'), readingSessions: g('book', 'sessions'), quotes: g('book', 'quotes'), plans: g('planBuilder', 'plans'),
    skills: g('skills', 'skills'), skillSessions: g('skills', 'sessions'), habits: g('habits', 'habits'), habitCheckIns: g('habits', 'checkIns'), budgets: g('budget', 'budgets'),
    budgetEntries: g('budget', 'entries'), quitHabits: g('quitHabit', 'habits'), quitTracks: g('quitHabit', 'tracks'), quitFeelingEntries: g('quitHabit', 'feelingEntries'),
    quitSlips: g('quitHabit', 'slips'), quitCravingSessions: g('quitHabit', 'cravingSessions'), bestMoments: [],
  } as RecapData;
}
const ALL = Object.keys(METRICS) as MetricId[];
const earliest = (data: RecapData) => {
  const dates = [...data.quitTracks.map((t) => t.startDate), ...data.habitCheckIns.map((c) => c.date), ...data.skillSessions.map((s) => s.date), ...data.journalEntries.map((e) => e.date), ...data.feelingCheckIns.map((e) => e.date), ...data.sleepLogs.map((l) => l.date)];
  return dates.reduce((m, d) => (d < m ? d : m), TODAY);
};
// The last day anything is dated (meals are planned ahead).
const latest = (data: RecapData) => data.meals.map((m) => m.date).reduce((m, d) => (d > m ? d : m), TODAY);
// Recap's rows for an area over a range, with its scope.
function recapRows(data: RecapData, area: 'plan' | 'reflect' | 'grow' | 'learn', range: { start: string; end: string }, scope: MetricScope) {
  const ctx: RecapContext = { data, stats: periodStats(data, range), today: TODAY, scope };
  return sectionRecaps(area, ctx, [], false);
}
const rowValue = (recaps: ReturnType<typeof recapRows>, section: string, labelStart: string) => recaps.find((r) => r.section === section)?.rows.find((x) => x.label.startsWith(labelStart))?.value;

describe('the same scope, the same number', () => {
  test('METRIC-001 Quit: clean days and hard days in total are the journey\'s own (per habit), and Recap over the whole history says the same', () => {
    const data = recapData();
    let clean = 0;
    for (const h of data.quitHabits) {
      const c = journeyCounts(data.quitTracks, data.quitSlips ?? [], h.id, TODAY);
      expect(metricCount('cleanDays', data, TOTAL, TODAY, undefined, { quitHabitId: h.id })).toBe(c.cleanDays);
      expect(metricCount('hardDays', data, TOTAL, TODAY, undefined, { quitHabitId: h.id })).toBe(c.hardDays);
      clean += c.cleanDays;
    }
    expect(clean).toBeGreaterThan(0);
    const all = recapRows(data, 'grow', { start: earliest(data), end: TODAY }, { kind: 'period', period: 'custom', current: true });
    expect(rowValue(all, 'quitHabit', 'Clean days')).toBe(String(clean));
  });

  test('METRIC-002 Habits: check-ins in total per habit, and Recap over the whole history, are one count', () => {
    const data = recapData();
    const perHabit = data.habits.map((h) => metricCount('habitCheckIns', data, TOTAL, TODAY, undefined, { habitId: h.id }));
    const doneCheckIns = data.habitCheckIns.filter((c) => c.done && c.date <= TODAY).length;
    expect(perHabit.reduce((a, b) => a + b, 0)).toBe(doneCheckIns);
    const all = recapRows(data, 'grow', { start: earliest(data), end: TODAY }, { kind: 'period', period: 'custom', current: true });
    expect(rowValue(all, 'habitBuilder', 'Habit check-ins')).toBe(String(doneCheckIns));
  });

  test('METRIC-003 Skills: the section\'s "invested in total" per skill is the registry\'s, and adds up to Recap over the whole history', () => {
    const data = recapData();
    let sum = 0;
    for (const s of data.skills) {
      const m = totalMinutesFor(data.skillSessions, s.id);
      expect(m).toBe(metricCount('practiceMinutes', data, TOTAL, TODAY, undefined, { skillId: s.id }));
      sum += m;
    }
    expect(periodStats(data, { start: earliest(data), end: TODAY }).minutes.skills).toBe(sum);
    // Recap's own row (it once summed only skills still in the list).
    const all = recapRows(data, 'grow', { start: earliest(data), end: TODAY }, { kind: 'period', period: 'custom', current: true });
    const row = all.find((r) => r.section === 'skills')?.rows.find((x) => x.label.startsWith('Practice time'));
    const withGone = { ...data, skills: data.skills.slice(1) };
    const gone = recapRows(withGone, 'grow', { start: earliest(data), end: TODAY }, { kind: 'period', period: 'custom', current: true });
    expect(gone.find((r) => r.section === 'skills')?.rows.find((x) => x.label.startsWith('Practice time'))?.value).toBe(row?.value);
  });

  test('METRIC-004 every Recap count is the registry\'s over its period (periodStats has no counting rules of its own)', () => {
    const data = recapData();
    const range = { start: addDaysISO(TODAY, -27), end: TODAY };
    const s = periodStats(data, range);
    const pairs: [number, MetricId][] = [
      [s.habitCompletions, 'habitCheckIns'], [s.resistedUrges, 'urgesRiddenOut'], [s.skillSessions, 'practiceSessions'], [s.studySessions, 'studySessions'],
      [s.journalEntries, 'journalEntries'], [s.feelingsLogged, 'feelingsNamed'], [s.sleepLogs, 'nightsLogged'], [s.pagesRead, 'pagesRead'],
      [s.thoughtsCaught, 'thoughtsCaught'], [s.gamesPlayed, 'gamesPlayed'], [s.quotesSaved, 'quotesSaved'], [s.mealsPlanned, 'mealsPlanned'],
      [s.minutes.study, 'focusMinutes'], [s.minutes.skills, 'practiceMinutes'], [s.minutes.reading, 'readingMinutes'],
    ];
    for (const [value, id] of pairs) expect({ id, value }).toEqual({ id, value: countIn(id, data, range, TODAY) });
  });
});

describe('periods and the whole history', () => {
  test.each([1, 0])('METRIC-010 weeks starting on day %i: no week is more than the total, and the weeks add up to it, for every number (meals planned ahead count in total too)', (weekStartsOn) => {
    const data = recapData();
    let start = weekStartFor(earliest(data), weekStartsOn);
    const sums: Record<string, number> = {};
    while (start <= latest(data)) {
      const range = { start, end: addDaysISO(start, 6) };
      for (const id of ALL) {
        const n = countIn(id, data, range, TODAY);
        expect(n).toBeLessThanOrEqual(metricCount(id, data, TOTAL, TODAY));
        sums[id] = (sums[id] ?? 0) + n;
      }
      start = addDaysISO(start, 7);
    }
    for (const id of ALL) expect({ id, sum: sums[id] }).toEqual({ id, sum: metricCount(id, data, TOTAL, TODAY) });
  });

  test('METRIC-011 month ends: months (31, 30, 28 days) add up to the whole history', () => {
    const data = recapData();
    const sums: Record<string, number> = {};
    for (let d = `${earliest(data).slice(0, 7)}-01`; d <= latest(data); ) {
      const [y, m] = d.split('-').map(Number);
      const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const range = { start: d, end: addDaysISO(next, -1) };
      for (const id of ALL) sums[id] = (sums[id] ?? 0) + countIn(id, data, range, TODAY);
      d = next;
    }
    for (const id of ALL) expect({ id, sum: sums[id] }).toEqual({ id, sum: metricCount(id, data, TOTAL, TODAY) });
  });

  test('METRIC-012 Recap\'s clean days for any week are never more than Quit\'s in total (5 this week vs 8 in total is fine; 9 never)', () => {
    const data = recapData();
    const total = data.quitHabits.reduce((n, h) => n + journeyCounts(data.quitTracks, data.quitSlips ?? [], h.id, TODAY).cleanDays, 0);
    for (let start = weekStartFor(earliest(data), 1); start <= TODAY; start = addDaysISO(start, 7)) {
      const week = recapRows(data, 'grow', { start, end: addDaysISO(start, 6) }, { kind: 'period', period: 'week', current: start <= TODAY && TODAY <= addDaysISO(start, 6) });
      const v = rowValue(week, 'quitHabit', 'Clean days');
      if (v !== undefined) expect(Number(v)).toBeLessThanOrEqual(total);
    }
  });

  test('METRIC-013 an older chapter ended by a slip (before slips were marked): Quit and Recap count its days the same', () => {
    const data = recapData();
    const h = data.quitHabits[0];
    const tracks: QuitTrack[] = [
      { id: 'old', quitHabitId: h.id, startDate: '2026-08-01', endDate: '2026-08-20', status: 'archived', createdAt: '2026-08-01T08:00:00.000Z' },
      { id: 'new', quitHabitId: h.id, startDate: '2026-08-20', status: 'active', createdAt: '2026-08-20T20:00:00.000Z' },
    ];
    const d = { ...data, quitTracks: tracks, quitSlips: [], quitHabits: [h] };
    const c = journeyCounts(tracks, [], h.id, TODAY);
    expect(c.hardDays).toBe(1); // the day the old chapter ended
    expect(metricCount('cleanDays', d, TOTAL, TODAY)).toBe(c.cleanDays);
    const all = recapRows(d, 'grow', { start: '2026-08-01', end: TODAY }, { kind: 'period', period: 'custom', current: true });
    expect(rowValue(all, 'quitHabit', 'Clean days')).toBe(String(c.cleanDays));
  });
});

describe('every label says its scope', () => {
  test('METRIC-020 the words: "this week", "that month", "today", "in this range", "in total"', () => {
    expect(scopeWords({ kind: 'period', period: 'week', current: true })).toBe('this week');
    expect(scopeWords({ kind: 'period', period: 'month', current: false })).toBe('that month');
    expect(scopeWords({ kind: 'period', period: 'today', current: true })).toBe('today');
    expect(scopeWords({ kind: 'period', period: 'custom', current: true })).toBe('in this range');
    expect(scopeWords(TOTAL)).toBe('in total');
    expect(metricLabel('cleanDays', { kind: 'period', period: 'week', current: true })).toBe('Clean days this week');
    expect(metricLabel('practiceMinutes', TOTAL)).toBe('Practice time in total');
  });

  test('METRIC-021 every Recap row in every area says its period (except a row with its own: a budget\'s, where a plan stands)', () => {
    const data = recapData();
    const scope: MetricScope = { kind: 'period', period: 'week', current: true };
    for (const area of ['plan', 'reflect', 'grow', 'learn'] as const) {
      for (const r of recapRows(data, area, { start: weekStartFor(TODAY, 1), end: addDaysISO(weekStartFor(TODAY, 1), 6) }, scope)) {
        for (const row of r.rows) if (!row.ownScope) expect({ section: r.section, label: row.label, scoped: row.label.endsWith(' this week') }).toEqual({ section: r.section, label: row.label, scoped: true });
      }
    }
  });

  test('METRIC-022 the sections\' lifetime numbers say "in total" (Quit journey and Analysis, Habits, Skills, the Quit export)', () => {
    const fs = require('fs') as { readFileSync: (p: string, e: string) => string };
    const src = (f: string) => fs.readFileSync(`${process.cwd()}/${f}`, 'utf8');
    expect(src('src/quit/journey.ts')).toMatch(/clean days'\} in total/);
    expect(src('src/screens/QuitHabitAnalysis.tsx')).toMatch(/clean days'\} in total[\s\S]*urges ridden out'\} in total/);
    expect(src('src/screens/BuildHabitAnalysis.tsx')).toMatch(/completions in total/);
    expect(src('src/screens/SkillAnalysis.tsx')).toMatch(/invested in total/);
    expect(src('src/screens/SkillsScreen.tsx')).toMatch(/invested in total/);
    expect(src('src/utils/habitExport.ts')).toMatch(/metricPhrase\('cleanDays', c\.cleanDays, TOTAL\)/);
  });
});

test('METRIC-030 days are the phone\'s own: something caught at 23:30 local counts on that day, whatever UTC says', () => {
  const data = recapData();
  const at = new Date(2026, 9, 20, 23, 30).toISOString(); // 2026-10-20 23:30 here
  const d = { ...data, thoughts: [{ id: 't', createdAt: at, kind: 'idea', text: 'x' }] } as RecapData;
  expect(countIn('thoughtsCaught', d, { start: '2026-10-20', end: '2026-10-20' }, TODAY)).toBe(1);
  expect(countIn('thoughtsCaught', d, { start: '2026-10-21', end: '2026-10-21' }, TODAY)).toBe(0);
});
