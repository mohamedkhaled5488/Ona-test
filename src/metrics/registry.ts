// Every number Ona shows in more than one place, defined once (Problem 2,
// found on a phone 2026-10-29: Recap said 5 clean days, Quit said 8). Each
// metric is one count over a date range; "in total" is the same count from
// the very beginning to today. Recap counts its period, a section its own
// scope, and the label always says which:
//   "5 clean days this week" (Recap) · "8 clean days in total" (Quit)
// so two true numbers never look like a contradiction, and Recap over the
// whole history equals the section exactly (metricRegistry.test.ts).
// Days are the phone's own (local) days, never UTC's.
import type { RecapData } from '../utils/recapStats';
import type { RecapPeriod } from '../utils/feelingsStats';
import { localDateOf, quitDayCounts } from '../quit/journey';

// What a count needs: any part of the app's data (a section passes its own).
export type MetricData = Partial<RecapData>;

export interface DateRange {
  start: string;
  end: string;
}

// What a number covers. A period is Recap's (today, this week...); "current"
// is the period that includes today ("this week" vs "that week").
export type MetricScope = { kind: 'total' } | { kind: 'period'; period: RecapPeriod; current: boolean };
export const TOTAL: MetricScope = { kind: 'total' };

export function scopeWords(scope: MetricScope): string {
  if (scope.kind === 'total') return 'in total';
  if (scope.period === 'custom') return 'in this range';
  if (scope.period === 'today') return scope.current ? 'today' : 'that day';
  return `${scope.current ? 'this' : 'that'} ${scope.period}`;
}

// The range a scope counts: a period's own dates, or everything up to today.
export const rangeFor = (scope: MetricScope, period: DateRange | undefined, today: string, ahead = false): DateRange =>
  scope.kind === 'total' || !period ? { start: '0000-01-01', end: ahead ? '9999-12-31' : today } : period;

const inRange = (d: string, r: DateRange) => d >= r.start && d <= r.end;

export interface MetricFilter {
  habitId?: string; // Habit Builder
  skillId?: string;
  quitHabitId?: string;
  entryId?: string; // a book
}

export interface MetricDef {
  noun: [string, string]; // one, many: "clean day", "clean days"
  minutes?: boolean; // a duration, shown as time
  ahead?: boolean; // planned ahead (a meal for Friday): "in total" includes what's planned after today
  count: (data: MetricData, range: DateRange, today: string, filter?: MetricFilter) => number;
}

// Quit: days by the journey's own rules (quit/journey.ts: a day inside a
// chapter, not a hard day), never past today; summed over habits.
function quitHabitIds(data: MetricData, f?: MetricFilter): string[] {
  return f?.quitHabitId ? [f.quitHabitId] : (data.quitHabits ?? []).map((h) => h.id);
}
const quitDays = (data: MetricData, habitId: string, range: DateRange, today: string) => quitDayCounts(data.quitTracks ?? [], data.quitSlips ?? [], habitId, range.start, range.end, today);

export const METRICS = {
  cleanDays: { noun: ['clean day', 'clean days'], count: (d, r, t, f) => quitHabitIds(d, f).reduce((n, id) => n + quitDays(d, id, r, t).clean, 0) },
  hardDays: { noun: ['hard day', 'hard days'], count: (d, r, t, f) => quitHabitIds(d, f).reduce((n, id) => n + quitDays(d, id, r, t).hard, 0) },
  urgesRiddenOut: {
    noun: ['urge ridden out', 'urges ridden out'],
    // Every urge ridden out, or one habit's (by its chapters).
    count: (d, r, _t, f) => {
      const tracks = f?.quitHabitId ? new Set((d.quitTracks ?? []).filter((t) => t.quitHabitId === f.quitHabitId).map((t) => t.id)) : undefined;
      return (d.quitFeelingEntries ?? []).filter((e) => e.isResistedUrge && (!tracks || tracks.has(e.trackId)) && inRange(localDateOf(e.createdAt), r)).length;
    },
  },
  habitCheckIns: { noun: ['habit check-in', 'habit check-ins'], count: (d, r, _t, f) => (d.habitCheckIns ?? []).filter((c) => c.done && (!f?.habitId || c.habitId === f.habitId) && inRange(c.date, r)).length },
  practiceMinutes: { noun: ['practice', 'practice'], minutes: true, count: (d, r, _t, f) => (d.skillSessions ?? []).filter((s) => (!f?.skillId || s.skillId === f.skillId) && inRange(s.date, r)).reduce((n, s) => n + (s.minutes > 0 ? s.minutes : 0), 0) },
  practiceSessions: { noun: ['practice session', 'practice sessions'], count: (d, r, _t, f) => (d.skillSessions ?? []).filter((s) => (!f?.skillId || s.skillId === f.skillId) && inRange(s.date, r)).length },
  focusMinutes: { noun: ['focus time', 'focus time'], minutes: true, count: (d, r) => (d.studySessions ?? []).filter((s) => inRange(s.date, r)).reduce((n, s) => n + (s.focusMinutes > 0 ? s.focusMinutes : 0), 0) },
  studySessions: { noun: ['study session', 'study sessions'], count: (d, r) => (d.studySessions ?? []).filter((s) => inRange(s.date, r)).length },
  pagesRead: { noun: ['page read', 'pages read'], count: (d, r, _t, f) => (d.readingSessions ?? []).filter((s) => (!f?.entryId || s.entryId === f.entryId) && inRange(s.date, r)).reduce((n, s) => n + (s.pagesRead ?? 0), 0) },
  readingMinutes: { noun: ['reading time', 'reading time'], minutes: true, count: (d, r, _t, f) => (d.readingSessions ?? []).filter((s) => (!f?.entryId || s.entryId === f.entryId) && inRange(s.date, r)).reduce((n, s) => n + (s.minutes > 0 ? s.minutes : 0), 0) },
  journalEntries: { noun: ['journal entry', 'journal entries'], count: (d, r) => (d.journalEntries ?? []).filter((e) => inRange(e.date, r)).length },
  feelingsNamed: { noun: ['feeling named', 'feelings named'], count: (d, r) => (d.feelingCheckIns ?? []).filter((e) => inRange(e.date, r)).length },
  nightsLogged: { noun: ['night logged', 'nights logged'], count: (d, r) => (d.sleepLogs ?? []).filter((l) => inRange(l.date, r)).length },
  thoughtsCaught: { noun: ['thought caught', 'thoughts caught'], count: (d, r) => (d.thoughts ?? []).filter((t) => inRange(localDateOf(t.createdAt), r)).length },
  gamesPlayed: { noun: ['game played', 'games played'], count: (d, r) => (d.gameResults ?? []).filter((g) => inRange(localDateOf(g.playedAt), r)).length },
  quotesSaved: { noun: ['quote saved', 'quotes saved'], count: (d, r) => (d.quotes ?? []).filter((q) => inRange(localDateOf(q.createdAt), r)).length },
  mealsPlanned: { noun: ['meal planned', 'meals planned'], ahead: true, count: (d, r) => (d.meals ?? []).filter((m) => inRange(m.date, r)).length },
} satisfies Record<string, MetricDef>;
export type MetricId = keyof typeof METRICS;

// One metric over a date range (Recap's period, a habit's chapters...).
export function countIn(id: MetricId, data: MetricData, range: DateRange, today: string, filter?: MetricFilter): number {
  return (METRICS[id] as MetricDef).count(data, range, today, filter);
}

export function metricCount(id: MetricId, data: MetricData, scope: MetricScope, today: string, period?: DateRange, filter?: MetricFilter): number {
  const def = METRICS[id] as MetricDef;
  return def.count(data, rangeFor(scope, period, today, def.ahead), today, filter);
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// A row's label with its scope: "Clean days this week", "Practice time in total".
export function metricLabel(id: MetricId, scope: MetricScope, n?: number): string {
  const def = METRICS[id] as MetricDef;
  const noun = def.minutes ? `${def.noun[1].replace(/^practice$/, 'practice time')}` : n === 1 ? def.noun[0] : def.noun[1];
  return `${capitalize(noun)} ${scopeWords(scope)}`;
}

// The same as a sentence part: "8 clean days in total".
export function metricPhrase(id: MetricId, n: number, scope: MetricScope): string {
  const def = METRICS[id] as MetricDef;
  return `${n} ${n === 1 ? def.noun[0] : def.noun[1]} ${scopeWords(scope)}`;
}
