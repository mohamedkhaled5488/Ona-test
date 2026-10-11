// Recap's period-aware aggregation layer (Revision #5).
//
// Same rules as src/utils/recap.ts: pure functions over raw arrays the screen
// already selected from each store; nothing here writes anywhere. Every date
// range comes from the shared range utility in feelingsStats.ts (periodRange
// and friends) — this file only filters by `start <= date <= end`.
//
// Note on "SQL aggregates": the app keeps its data in local in-memory stores,
// not a local SQL database, so the aggregation runs here over the arrays,
// once per period, memoized by the screen.
import type {
  BestMoment,
  FeelingZone,
  Quote,
  ReadingListEntry,
  ReadingSession,
  SectionId,
} from '../types/sections';
import { collectRecapEvents, type RecapSourceData } from './recap';
import { datesInRange, type PatternsRange, type RecapPeriod } from './feelingsStats';
import { resolveTaskDone, taskAppliesToDate } from '../store/useDailyPlanningStore';
import { completionRate, longestFrequencyStreak } from './habitFrequency';
import { findFeeling, zoneMeta } from '../data/feelingsWheel';
import { bookProgress, describeProgress } from './bookProgress';
import { computePlanProgress, flattenSteps } from '../store/usePlanStore';
import { addDaysISO } from './date';

export interface RecapData extends RecapSourceData {
  readingSessions: ReadingSession[];
  quotes: Quote[];
  bestMoments: BestMoment[];
}

export type DateRange = Pick<PatternsRange, 'start' | 'end'>;
export type AreaId = 'plan' | 'reflect' | 'grow' | 'learn';
export type EffortKind = 'study' | 'skills' | 'reading' | 'habits';

export const AREA_SECTIONS: Record<AreaId, SectionId[]> = {
  plan: ['planBuilder', 'dailyPlanning', 'dietPlanning', 'budget'],
  reflect: ['journaling', 'moodCheck', 'sleep'],
  grow: ['habitBuilder', 'quitHabit', 'skills'],
  learn: ['book', 'studySession'],
};
export const AREA_TITLES: Record<AreaId, string> = { plan: 'Plan', reflect: 'Reflect', grow: 'Grow', learn: 'Learn' };

export const EFFORT_KINDS: EffortKind[] = ['study', 'skills', 'reading', 'habits'];
export const EFFORT_SECTION: Record<EffortKind, SectionId> = { study: 'studySession', skills: 'skills', reading: 'book', habits: 'habitBuilder' };
export const EFFORT_LABEL: Record<EffortKind, string> = { study: 'Study', skills: 'Skills', reading: 'Reading', habits: 'Habit sessions' };

// Left out of shared story cards unless the user opts in.
export const SENSITIVE_SECTIONS: SectionId[] = ['moodCheck', 'quitHabit'];

// Every section Recap can show — the "Choose what Recap shows" list.
export const RECAP_SECTIONS: SectionId[] = [...AREA_SECTIONS.plan, ...AREA_SECTIONS.reflect, ...AREA_SECTIONS.grow, ...AREA_SECTIONS.learn, 'catchAThought', 'songwriting', 'mindGames'];

const inRange = (date: string, r: DateRange) => date >= r.start && date <= r.end;

// ---------------------------------------------------------------------------
// Hidden sections — applied once, up front, so a hidden section can't leak
// into any card, chart, highlight, story card or shared image.
// ---------------------------------------------------------------------------
export function withoutHidden(data: RecapData, hidden: SectionId[]): RecapData {
  if (hidden.length === 0) return data;
  const h = new Set(hidden);
  const keep = <T>(section: SectionId, arr: T[]): T[] => (h.has(section) ? [] : arr);
  return {
    tasks: keep('dailyPlanning', data.tasks),
    journalEntries: keep('journaling', data.journalEntries),
    thoughts: keep('catchAThought', data.thoughts),
    studySessions: keep('studySession', data.studySessions),
    meals: keep('dietPlanning', data.meals),
    songs: keep('songwriting', data.songs),
    gameResults: keep('mindGames', data.gameResults),
    feelingCheckIns: keep('moodCheck', data.feelingCheckIns),
    sleepLogs: keep('sleep', data.sleepLogs),
    readingEntries: keep('book', data.readingEntries),
    readingSessions: keep('book', data.readingSessions),
    quotes: keep('book', data.quotes),
    plans: keep('planBuilder', data.plans),
    skills: keep('skills', data.skills),
    skillSessions: keep('skills', data.skillSessions),
    habits: keep('habitBuilder', data.habits),
    habitCheckIns: keep('habitBuilder', data.habitCheckIns),
    budgets: keep('budget', data.budgets),
    budgetEntries: keep('budget', data.budgetEntries),
    quitHabits: keep('quitHabit', data.quitHabits),
    quitTracks: keep('quitHabit', data.quitTracks),
    quitFeelingEntries: keep('quitHabit', data.quitFeelingEntries),
    bestMoments: data.bestMoments.filter((m) => !h.has(m.sourceSection)),
  };
}

// ---------------------------------------------------------------------------
// Period totals
// ---------------------------------------------------------------------------
export interface PeriodStats {
  range: DateRange;
  dates: string[];
  minutes: Record<EffortKind, number>;
  totalMinutes: number;
  minutesByDay: Record<string, Record<EffortKind, number>>;
  tasksPlanned: number;
  tasksCompleted: number;
  tasksByDay: Record<string, { planned: number; done: number }>;
  mealsPlanned: number;
  journalEntries: number;
  journalWords: number;
  feelingsLogged: number;
  zoneMix: Record<FeelingZone, number>;
  topFeelings: { id: string; name: string; count: number }[];
  sleepLogs: number;
  restedNights: number;
  habitCompletions: number;
  resistedUrges: number;
  skillSessions: number;
  studySessions: number;
  readingSessions: number;
  pagesRead: number;
  pagesByDay: Record<string, number>;
  quotesSaved: number;
  booksFinished: ReadingListEntry[];
  thoughtsCaught: number;
  gamesPlayed: number;
  activeDates: string[]; // days with anything logged, in order
}

const emptyMinutes = (): Record<EffortKind, number> => ({ study: 0, skills: 0, reading: 0, habits: 0 });

export function periodStats(data: RecapData, range: DateRange): PeriodStats {
  const dates = datesInRange(range.start, range.end);
  const minutesByDay: Record<string, Record<EffortKind, number>> = {};
  for (const d of dates) minutesByDay[d] = emptyMinutes();
  const minutes = emptyMinutes();
  const addMinutes = (date: string, kind: EffortKind, value: number) => {
    if (!inRange(date, range) || !(value > 0)) return;
    minutes[kind] += value;
    minutesByDay[date][kind] += value;
  };

  // Time comes only from timed sessions.
  for (const s of data.studySessions) addMinutes(s.date, 'study', s.focusMinutes);
  for (const s of data.skillSessions) addMinutes(s.date, 'skills', s.minutes);
  for (const s of data.readingSessions) addMinutes(s.date, 'reading', s.minutes);
  for (const c of data.habitCheckIns) if (c.done) addMinutes(c.date, 'habits', c.durationMinutes ?? 0);

  // Counts — kept as counts, never converted into time.
  const tasksByDay: Record<string, { planned: number; done: number }> = {};
  let tasksPlanned = 0;
  let tasksCompleted = 0;
  for (const d of dates) {
    let planned = 0;
    let done = 0;
    for (const t of data.tasks) {
      if (!taskAppliesToDate(t, d)) continue;
      planned += 1;
      if (resolveTaskDone(t, d)) done += 1;
    }
    tasksByDay[d] = { planned, done };
    tasksPlanned += planned;
    tasksCompleted += done;
  }

  const journal = data.journalEntries.filter((e) => inRange(e.date, range));
  const feelingsIn = data.feelingCheckIns.filter((e) => inRange(e.date, range));
  const zoneMix: Record<FeelingZone, number> = { lively: 0, calm: 0, okay: 0, tense: 0, low: 0 };
  const feelingCounts = new Map<string, number>();
  for (const e of feelingsIn) {
    zoneMix[e.zone] += 1;
    for (const id of e.feelingIds) feelingCounts.set(id, (feelingCounts.get(id) ?? 0) + 1);
  }
  const topFeelings = [...feelingCounts.entries()]
    .map(([id, count]) => ({ id, name: findFeeling(id)?.name ?? '', count }))
    .filter((f) => f.name)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const sleepIn = data.sleepLogs.filter((l) => inRange(l.date, range));
  const readingIn = data.readingSessions.filter((s) => inRange(s.date, range));
  const pagesByDay: Record<string, number> = {};
  for (const s of readingIn) if (s.pagesRead) pagesByDay[s.date] = (pagesByDay[s.date] ?? 0) + s.pagesRead;

  const events = collectRecapEvents(data).filter((e) => inRange(e.date, range));
  const active = new Set(events.map((e) => e.date));
  for (const d of dates) {
    if (tasksByDay[d].done > 0 || EFFORT_KINDS.some((k) => minutesByDay[d][k] > 0)) active.add(d);
  }

  return {
    range: { start: range.start, end: range.end },
    dates,
    minutes,
    totalMinutes: EFFORT_KINDS.reduce((sum, k) => sum + minutes[k], 0),
    minutesByDay,
    tasksPlanned,
    tasksCompleted,
    tasksByDay,
    mealsPlanned: data.meals.filter((m) => inRange(m.date, range)).length,
    journalEntries: journal.length,
    journalWords: journal.reduce((sum, e) => sum + (e.text.trim() ? e.text.trim().split(/\s+/).length : 0), 0),
    feelingsLogged: feelingsIn.length,
    zoneMix,
    topFeelings,
    sleepLogs: sleepIn.length,
    restedNights: sleepIn.filter((l) => l.quality >= 4).length,
    habitCompletions: data.habitCheckIns.filter((c) => c.done && inRange(c.date, range)).length,
    resistedUrges: data.quitFeelingEntries.filter((e) => e.isResistedUrge && inRange(e.createdAt.slice(0, 10), range)).length,
    skillSessions: data.skillSessions.filter((s) => inRange(s.date, range)).length,
    studySessions: data.studySessions.filter((s) => inRange(s.date, range)).length,
    readingSessions: readingIn.length,
    pagesRead: readingIn.reduce((sum, s) => sum + (s.pagesRead ?? 0), 0),
    pagesByDay,
    quotesSaved: data.quotes.filter((q) => inRange(q.createdAt.slice(0, 10), range)).length,
    // Approximate: a finished book's last update is when it was marked finished.
    booksFinished: data.readingEntries.filter((e) => e.status === 'finished' && inRange(e.updatedAt.slice(0, 10), range)),
    thoughtsCaught: data.thoughts.filter((t) => inRange(t.createdAt.slice(0, 10), range)).length,
    gamesPlayed: data.gameResults.filter((g) => inRange(g.playedAt.slice(0, 10), range)).length,
    activeDates: [...active].filter((d) => inRange(d, range)).sort(),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
export function formatDuration(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

const previousWord: Record<RecapPeriod, string> = {
  today: 'yesterday',
  week: 'last week',
  month: 'last month',
  year: 'last year',
  custom: 'the period before',
};

export function periodLead(period: RecapPeriod, isCurrent: boolean): string {
  if (isCurrent) return { today: 'Today', week: 'This week', month: 'This month', year: 'This year', custom: 'In this period' }[period];
  return { today: 'On that day', week: 'That week', month: 'That month', year: 'That year', custom: 'In this period' }[period];
}

export function storyTitle(period: RecapPeriod): string {
  return { today: 'Your day in Ona', week: 'Your week in Ona', month: 'Your month in Ona', year: 'Your year in Ona', custom: 'Your time in Ona' }[period];
}

// ---------------------------------------------------------------------------
// Effort summary — up to four big numbers, only for what the user uses
// ---------------------------------------------------------------------------
export interface BigNumber {
  id: string;
  label: string;
  value: number;
  display: string;
  section: SectionId;
  area: AreaId;
  delta?: string; // neutral comparison, e.g. "+3 vs last week"
}

interface Candidate {
  id: string;
  label: string;
  value: (s: PeriodStats) => number;
  display: (v: number) => string;
  phrase: (v: number) => string;
  section: (s: PeriodStats) => SectionId;
  area: AreaId | ((s: PeriodStats) => AreaId);
  isTime?: boolean;
}

function dominantKind(s: PeriodStats): EffortKind {
  return [...EFFORT_KINDS].sort((a, b) => s.minutes[b] - s.minutes[a])[0];
}

const CANDIDATES: Candidate[] = [
  {
    id: 'time',
    label: 'Time invested',
    value: (s) => s.totalMinutes,
    display: formatDuration,
    phrase: (v) => `focused for ${formatDuration(v)}`,
    section: (s) => EFFORT_SECTION[dominantKind(s)],
    area: (s) => (['study', 'reading'].includes(dominantKind(s)) ? 'learn' : 'grow'),
    isTime: true,
  },
  { id: 'tasks', label: 'Tasks done', value: (s) => s.tasksCompleted, display: String, phrase: (v) => `finished ${plural(v, 'task', 'tasks')}`, section: () => 'dailyPlanning', area: 'plan' },
  { id: 'pages', label: 'Pages read', value: (s) => s.pagesRead, display: String, phrase: (v) => `read ${plural(v, 'page', 'pages')}`, section: () => 'book', area: 'learn' },
  { id: 'journal', label: 'Journal entries', value: (s) => s.journalEntries, display: String, phrase: (v) => `wrote ${plural(v, 'journal entry', 'journal entries')}`, section: () => 'journaling', area: 'reflect' },
  { id: 'habits', label: 'Habit check-ins', value: (s) => s.habitCompletions, display: String, phrase: (v) => `showed up for a habit ${plural(v, 'time', 'times')}`, section: () => 'habitBuilder', area: 'grow' },
  { id: 'practice', label: 'Practice sessions', value: (s) => s.skillSessions, display: String, phrase: (v) => `practiced ${plural(v, 'time', 'times')}`, section: () => 'skills', area: 'grow' },
  { id: 'feelings', label: 'Feelings named', value: (s) => s.feelingsLogged, display: String, phrase: (v) => `named ${plural(v, 'feeling', 'feelings')}`, section: () => 'moodCheck', area: 'reflect' },
  { id: 'quotes', label: 'Quotes saved', value: (s) => s.quotesSaved, display: String, phrase: (v) => `saved ${plural(v, 'quote', 'quotes')}`, section: () => 'book', area: 'learn' },
];

function neutralDelta(current: number, previous: number, isTime: boolean, period: RecapPeriod): string {
  const diff = current - previous;
  if (diff === 0) return `same as ${previousWord[period]}`;
  const size = isTime ? formatDuration(Math.abs(diff)) : String(Math.abs(diff));
  return `${diff > 0 ? '+' : '−'}${size} vs ${previousWord[period]}`;
}

export function effortSummary(
  stats: PeriodStats,
  previous: PeriodStats | undefined,
  period: RecapPeriod,
  isCurrent: boolean,
  excludeSections: SectionId[] = []
): { numbers: BigNumber[]; sentence: string } {
  const used = CANDIDATES.filter((c) => c.value(stats) > 0 && !excludeSections.includes(c.section(stats))).slice(0, 4);
  const numbers = used.map((c) => {
    const value = c.value(stats);
    return {
      id: c.id,
      label: c.label,
      value,
      display: c.display(value),
      section: c.section(stats),
      area: typeof c.area === 'function' ? c.area(stats) : c.area,
      delta: previous ? neutralDelta(value, c.value(previous), !!c.isTime, period) : undefined,
    };
  });
  const lead = periodLead(period, isCurrent);
  const sentence =
    used.length === 0
      ? isCurrent
        ? `${lead} is quiet so far — nothing logged yet, and that's okay.`
        : `Nothing was logged ${lead.toLowerCase()}.`
      : `${lead} you ${joinList(used.slice(0, 3).map((c) => c.phrase(c.value(stats))))}.`;
  return { numbers, sentence };
}

// ---------------------------------------------------------------------------
// Highlights — 3–5 true lines, milestones and best moments first
// ---------------------------------------------------------------------------
export type HighlightTarget =
  | { kind: 'section'; section: SectionId; params?: Record<string, string> }
  | { kind: 'day'; date: string };

export interface Highlight {
  id: string;
  text: string;
  target: HighlightTarget;
  sensitive: boolean;
}

const weekdayName = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long' });
const shortDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function longestActiveRun(dates: string[], range: DateRange): { length: number; end?: string } {
  const set = new Set(dates);
  let best = 0;
  let bestEnd: string | undefined;
  let run = 0;
  for (const d of datesInRange(range.start, range.end)) {
    run = set.has(d) ? run + 1 : 0;
    if (run > best) {
      best = run;
      bestEnd = d;
    }
  }
  return { length: best, end: bestEnd };
}

export function buildHighlights(data: RecapData, stats: PeriodStats): Highlight[] {
  const range = stats.range;
  const multiDay = stats.dates.length > 1;
  const dayLabel = (d: string) => (stats.dates.length <= 7 ? weekdayName(d) : shortDate(d));
  const out: Highlight[] = [];

  // User-tagged best moments come first.
  for (const m of data.bestMoments.filter((x) => inRange(x.date, range)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2)) {
    out.push({
      id: `moment-${m.date}`,
      text: `Best moment${multiDay ? ` (${dayLabel(m.date)})` : ''}: ${m.label}`,
      target: { kind: 'day', date: m.date },
      sensitive: SENSITIVE_SECTIONS.includes(m.sourceSection),
    });
  }

  // Milestones reached in the period.
  for (const h of data.habits.filter((x) => x.graduatedAt && inRange(x.graduatedAt, range))) {
    out.push({ id: `grad-${h.id}`, text: `You reached the end of your ${h.name} journey.`, target: { kind: 'section', section: 'habitBuilder', params: { openHabitId: h.id } }, sensitive: false });
  }
  for (const b of stats.booksFinished) {
    out.push({ id: `book-${b.id}`, text: `You finished ${b.book.title}.`, target: { kind: 'section', section: 'book', params: { openEntryId: b.id } }, sensitive: false });
  }
  for (const skill of data.skills) {
    for (const m of skill.milestones.filter((x) => x.achieved && x.achievedAt && inRange(x.achievedAt, range))) {
      out.push({ id: `skillm-${m.id}`, text: `${skill.name}: ${m.text}`, target: { kind: 'section', section: 'skills', params: { openSkillId: skill.id } }, sensitive: false });
    }
  }

  if (multiDay) {
    const fullest = [...stats.dates].sort((a, b) => totalOf(stats, b) - totalOf(stats, a))[0];
    if (fullest && totalOf(stats, fullest) > 0) {
      out.push({ id: 'best-day', text: `Your fullest day was ${dayLabel(fullest)}, with ${formatDuration(totalOf(stats, fullest))} of focused time.`, target: { kind: 'day', date: fullest }, sensitive: false });
    }
    const run = longestActiveRun(stats.activeDates, range);
    if (run.length >= 3 && run.end) {
      out.push({ id: 'streak', text: `${run.length} days in a row with something logged.`, target: { kind: 'day', date: run.end }, sensitive: false });
    }
    const reading = Object.entries(stats.pagesByDay).sort((a, b) => b[1] - a[1])[0];
    if (reading && reading[1] > 0) {
      out.push({ id: 'reading-day', text: `Biggest reading day: ${plural(reading[1], 'page', 'pages')} on ${dayLabel(reading[0])}.`, target: { kind: 'section', section: 'book' }, sensitive: false });
    }
  }

  return out.slice(0, 5);
}

function totalOf(stats: PeriodStats, date: string): number {
  const m = stats.minutesByDay[date];
  return m ? EFFORT_KINDS.reduce((sum, k) => sum + m[k], 0) : 0;
}

// ---------------------------------------------------------------------------
// Area cards and pages
// ---------------------------------------------------------------------------
// A per-day series squeezed to at most ~31 bars (per month for long ranges),
// for the small charts on the area cards.
export function bucketSeries(stats: PeriodStats, valueFor: (date: string) => number): number[] {
  if (stats.dates.length <= 31) return stats.dates.map(valueFor);
  const byMonth = new Map<string, number>();
  for (const d of stats.dates) byMonth.set(d.slice(0, 7), (byMonth.get(d.slice(0, 7)) ?? 0) + valueFor(d));
  return [...byMonth.values()];
}

export interface AreaSummary {
  area: AreaId;
  stats: { label: string; value: string }[];
  bars: number[];
  hasData: boolean;
}

export function areaSummaries(stats: PeriodStats, hidden: SectionId[]): AreaSummary[] {
  const visible = (area: AreaId) => AREA_SECTIONS[area].some((s) => !hidden.includes(s));
  const m = stats.minutesByDay;
  const rate = stats.tasksPlanned ? Math.round((stats.tasksCompleted / stats.tasksPlanned) * 100) : undefined;
  const all: AreaSummary[] = [
    {
      area: 'plan',
      stats: [
        { label: 'Tasks done', value: stats.tasksPlanned ? `${stats.tasksCompleted} of ${stats.tasksPlanned}` : '0' },
        ...(rate !== undefined ? [{ label: 'Completion', value: `${rate}%` }] : []),
        ...(stats.mealsPlanned ? [{ label: 'Meals planned', value: String(stats.mealsPlanned) }] : []),
      ],
      bars: bucketSeries(stats, (d) => stats.tasksByDay[d]?.done ?? 0),
      hasData: stats.tasksPlanned > 0 || stats.mealsPlanned > 0,
    },
    {
      area: 'reflect',
      stats: [
        { label: 'Journal entries', value: String(stats.journalEntries) },
        { label: 'Feelings named', value: String(stats.feelingsLogged) },
        ...(stats.sleepLogs ? [{ label: 'Rested nights', value: `${stats.restedNights} of ${stats.sleepLogs}` }] : []),
      ],
      bars: [],
      hasData: stats.journalEntries + stats.feelingsLogged + stats.sleepLogs > 0,
    },
    {
      area: 'grow',
      stats: [
        { label: 'Habit check-ins', value: String(stats.habitCompletions) },
        { label: 'Practice time', value: formatDuration(stats.minutes.skills) },
        ...(stats.resistedUrges ? [{ label: 'Urges ridden out', value: String(stats.resistedUrges) }] : []),
      ],
      bars: bucketSeries(stats, (d) => (m[d]?.skills ?? 0) + (m[d]?.habits ?? 0)),
      hasData: stats.habitCompletions + stats.skillSessions + stats.resistedUrges > 0,
    },
    {
      area: 'learn',
      stats: [
        { label: 'Focus time', value: formatDuration(stats.minutes.study) },
        { label: 'Pages read', value: String(stats.pagesRead) },
        ...(stats.quotesSaved ? [{ label: 'Quotes saved', value: String(stats.quotesSaved) }] : []),
      ],
      bars: bucketSeries(stats, (d) => (m[d]?.study ?? 0) + (m[d]?.reading ?? 0)),
      hasData: stats.studySessions + stats.readingSessions + stats.quotesSaved > 0,
    },
  ];
  return all.filter((a) => visible(a.area));
}

export interface PlanDetails {
  completionRate?: number;
  busiestDay?: { date: string; done: number };
  plans: { id: string; title: string; color: string; done: number; total: number }[];
  spending: { budgetId: string; name: string; currency: string; mode: 'limit' | 'goal'; amount: number; target: number }[];
}

export function planDetails(data: RecapData, stats: PeriodStats): PlanDetails {
  const busiest = [...stats.dates].sort((a, b) => (stats.tasksByDay[b]?.done ?? 0) - (stats.tasksByDay[a]?.done ?? 0))[0];
  const spendingMap = new Map<string, number>();
  for (const e of data.budgetEntries) if (inRange(e.date, stats.range)) spendingMap.set(e.budgetId, (spendingMap.get(e.budgetId) ?? 0) + e.amount);
  return {
    completionRate: stats.tasksPlanned ? Math.round((stats.tasksCompleted / stats.tasksPlanned) * 100) : undefined,
    busiestDay: busiest && (stats.tasksByDay[busiest]?.done ?? 0) > 0 ? { date: busiest, done: stats.tasksByDay[busiest].done } : undefined,
    plans: data.plans
      .filter((p) => p.status === 'active')
      .map((p) => {
        const { done, total } = computePlanProgress(p.steps);
        return { id: p.id, title: p.title || 'Untitled plan', color: p.color, done, total };
      })
      .filter((p) => p.total > 0),
    spending: data.budgets
      .filter((b) => spendingMap.has(b.id))
      .map((b) => ({ budgetId: b.id, name: b.name, currency: b.currency, mode: b.mode, amount: spendingMap.get(b.id) ?? 0, target: b.targetAmount })),
  };
}

export interface GrowDetails {
  habits: { id: string; name: string; done: number; rate: number | null; longest: number; unit: 'day' | 'week' }[];
}

export function growDetails(data: RecapData, stats: PeriodStats, today: string): GrowDetails {
  const end = stats.range.end < today ? stats.range.end : today;
  return {
    habits: data.habits
      .filter((h) => !h.archivedAt)
      .map((h) => {
        const start = h.createdAt > stats.range.start ? h.createdAt : stats.range.start;
        const longest = longestFrequencyStreak(data.habitCheckIns, h.id, h.frequency);
        return {
          id: h.id,
          name: h.name,
          done: data.habitCheckIns.filter((c) => c.habitId === h.id && c.done && inRange(c.date, stats.range)).length,
          rate: start <= end ? completionRate(data.habitCheckIns, h.id, h.frequency, start, end) : null,
          longest: longest.current,
          unit: longest.unit,
        };
      }),
  };
}

export interface LearnDetails {
  bestFocusTime?: string;
  books: { id: string; title: string; progress?: string; fraction?: number }[];
}

export function learnDetails(data: RecapData, stats: PeriodStats): LearnDetails {
  // Best focus time of day: where most study minutes started, once there
  // are at least three timed sessions to say anything.
  const timed = data.studySessions.filter((s) => s.startedAt && inRange(s.date, stats.range) && s.focusMinutes > 0);
  let bestFocusTime: string | undefined;
  if (timed.length >= 3) {
    const buckets: Record<string, number> = { morning: 0, afternoon: 0, evening: 0, night: 0 };
    for (const s of timed) {
      const h = new Date(s.startedAt!).getHours();
      const b = h >= 5 && h < 12 ? 'morning' : h < 17 && h >= 12 ? 'afternoon' : h >= 17 && h < 22 ? 'evening' : 'night';
      buckets[b] += s.focusMinutes;
    }
    bestFocusTime = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0][0];
  }
  return {
    bestFocusTime,
    books: data.readingEntries
      .filter((e) => e.status === 'reading' || data.readingSessions.some((s) => s.entryId === e.id && inRange(s.date, stats.range)))
      .map((e) => {
        const p = bookProgress(e);
        return { id: e.id, title: e.book.title, progress: describeProgress(p), fraction: p.fraction };
      }),
  };
}

// ---------------------------------------------------------------------------
// Effort over time — the stacked-bar series for the shared graph engine
// ---------------------------------------------------------------------------
export interface EffortSlot {
  key: string;
  date: string; // first day of the slot
  minutes: Record<EffortKind, number>;
  total: number;
}

export function effortSlots(stats: PeriodStats, granularity: 'day' | 'month'): EffortSlot[] {
  if (granularity === 'day') {
    return stats.dates.map((d) => {
      const minutes = stats.minutesByDay[d];
      return { key: d, date: d, minutes, total: EFFORT_KINDS.reduce((sum, k) => sum + minutes[k], 0) };
    });
  }
  const byMonth = new Map<string, Record<EffortKind, number>>();
  for (const d of stats.dates) {
    const key = d.slice(0, 7);
    const acc = byMonth.get(key) ?? emptyMinutes();
    for (const k of EFFORT_KINDS) acc[k] += stats.minutesByDay[d][k];
    byMonth.set(key, acc);
  }
  return [...byMonth.entries()].map(([key, minutes]) => ({ key, date: `${key}-01`, minutes, total: EFFORT_KINDS.reduce((sum, k) => sum + minutes[k], 0) }));
}

// ---------------------------------------------------------------------------
// Story — "Your week in Ona"
// ---------------------------------------------------------------------------
export interface StoryCard {
  id: string;
  title: string;
  headline: string;
  lines: string[];
  sensitive: boolean; // contains Feelings or Quit data
}

export function buildStory(
  data: RecapData,
  stats: PeriodStats,
  highlights: Highlight[],
  period: RecapPeriod,
  includesToday: boolean,
  today: string
): StoryCard[] {
  const cards: (StoryCard | null)[] = [];

  // Feelings get their own card, so the opening card leaves them out and
  // stays shareable.
  const opening = effortSummary(stats, undefined, period, includesToday, SENSITIVE_SECTIONS);
  cards.push(
    opening.numbers.length
      ? { id: 'effort', title: storyTitle(period), headline: opening.sentence, lines: opening.numbers.map((n) => `${n.display} · ${n.label.toLowerCase()}`), sensitive: false }
      : null
  );

  cards.push(
    stats.totalMinutes > 0
      ? {
          id: 'time',
          title: 'Where your time went',
          headline: formatDuration(stats.totalMinutes),
          lines: [...EFFORT_KINDS].filter((k) => stats.minutes[k] > 0).sort((a, b) => stats.minutes[b] - stats.minutes[a]).map((k) => `${EFFORT_LABEL[k]} — ${formatDuration(stats.minutes[k])}`),
          sensitive: false,
        }
      : null
  );

  const win = highlights.find((h) => !h.id.startsWith('moment-'));
  cards.push(win ? { id: 'win', title: 'One win', headline: win.text, lines: [], sensitive: win.sensitive } : null);

  if (stats.feelingsLogged > 0) {
    const zones = (Object.entries(stats.zoneMix) as [FeelingZone, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    cards.push({
      id: 'feelings',
      title: 'Feelings, in words',
      headline: `Mostly ${joinList(zones.slice(0, 2).map(([z]) => zoneMeta(z).label.toLowerCase()))}`,
      lines: stats.topFeelings.map((f) => `${f.name} — ${plural(f.count, 'time', 'times')}`),
      sensitive: true,
    });
  }

  cards.push(
    stats.resistedUrges > 0
      ? { id: 'urges', title: 'Urges you rode out', headline: plural(stats.resistedUrges, 'urge', 'urges'), lines: ['Each one counts.'], sensitive: true }
      : null
  );

  const moment = data.bestMoments.filter((m) => inRange(m.date, stats.range)).sort((a, b) => b.date.localeCompare(a.date))[0];
  cards.push(moment ? { id: 'moment', title: 'A best moment', headline: moment.label, lines: [shortDate(moment.date)], sensitive: SENSITIVE_SECTIONS.includes(moment.sourceSection) } : null);

  const next: string[] = [];
  const reading = data.readingEntries.find((e) => e.status === 'reading' && e.totalPages && e.currentPage);
  if (reading) next.push(`${reading.book.title}: ${describeProgress(bookProgress(reading))}`);
  for (const plan of data.plans.filter((p) => p.status === 'active')) {
    const step = flattenSteps(plan.steps).find((f) => !f.step.done);
    if (step) {
      next.push(`${plan.title || 'Your plan'}: ${step.step.title}`);
      break;
    }
  }
  if (includesToday) {
    const tomorrow = addDaysISO(today, 1);
    const count = data.tasks.filter((t) => taskAppliesToDate(t, tomorrow) && !resolveTaskDone(t, tomorrow)).length;
    if (count) next.push(`${plural(count, 'task', 'tasks')} planned for tomorrow`);
  }
  cards.push(next.length ? { id: 'next', title: "What's next", headline: next[0], lines: next.slice(1), sensitive: false } : null);

  return cards.filter((c): c is StoryCard => c !== null);
}

// What a shared image may contain: Feelings and Quit cards stay out unless
// the user turned on "include them when sharing".
export function shareableStoryCards(cards: StoryCard[], includeSensitive: boolean): StoryCard[] {
  return includeSensitive ? cards : cards.filter((c) => !c.sensitive);
}
