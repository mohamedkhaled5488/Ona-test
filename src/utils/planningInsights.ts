// Daily Planning → Insights. Pure functions over tasks (and the feelings
// linked to them). The language rules are the Feelings Analysis ones:
// correlational, never causal ("tends to", "often", "on days when"), at
// least MIN_POINTS data points before any insight, and always saying how
// many it's based on.
import type { DailyTask, FeelingCheckIn, FeelingZone, TaskEnergy, TaskTag } from '../types/sections';
import { occursOn } from './taskRepeat';
import { addDaysISO, addMonthsISO, daysBetweenISODates, daysInMonthISO, weekdayOfISO } from './date';
import { datesInRange, weekStartFor } from './feelingsStats';
import { linkedEntry } from './taskFeelings';
import { getCalendarWeekStart } from './date';

export const MIN_POINTS = 5;
// Insights never rank (no "best day", no "most often"): they show the counts
// behind a pattern in a fixed order (week order, morning to night, the zone
// order, your own tag order) and let you read them yourself.

export interface Range {
  start: string;
  end: string;
}
export type RangeKind = 'week' | 'month' | 'quarter' | 'custom';
export type Granularity = 'day' | 'week';

export function insightRange(kind: RangeKind, today: string, weekStartsOn: number, custom?: Range): Range {
  if (kind === 'week') {
    const start = weekStartFor(today, weekStartsOn);
    return { start, end: addDaysISO(start, 6) };
  }
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthEnd = `${today.slice(0, 7)}-${String(daysInMonthISO(today)).padStart(2, '0')}`;
  if (kind === 'month') return { start: monthStart, end: monthEnd };
  if (kind === 'quarter') return { start: addMonthsISO(monthStart, -2), end: monthEnd };
  const c = custom ?? { start: addDaysISO(today, -29), end: today };
  return c.start <= c.end ? c : { start: c.end, end: c.start };
}

// The same number of days, just before.
export function previousRange(r: Range): Range {
  const days = daysBetweenISODates(r.start, r.end) + 1;
  return { start: addDaysISO(r.start, -days), end: addDaysISO(r.start, -1) };
}

export function granularityFor(r: Range): Granularity {
  return daysBetweenISODates(r.start, r.end) + 1 <= 45 ? 'day' : 'week';
}

export interface Bucket {
  key: string;
  start: string;
  end: string; // inclusive, never past the range
}

// Every day (or week) of the range, empty ones included, so a chart's x-axis
// always covers the whole period.
export function buckets(r: Range, g: Granularity, weekStartsOn: number): Bucket[] {
  if (g === 'day') return datesInRange(r.start, r.end).map((d) => ({ key: d, start: d, end: d }));
  const out: Bucket[] = [];
  let start = r.start;
  while (start <= r.end) {
    const weekEnd = addDaysISO(weekStartFor(start, weekStartsOn), 6);
    const end = weekEnd < r.end ? weekEnd : r.end;
    out.push({ key: start, start, end });
    start = addDaysISO(end, 1);
  }
  return out;
}

// --- One row per task per day it was on ------------------------------------------
export interface Occurrence {
  taskId: string;
  date: string;
  done: boolean;
  completedAt?: string;
  actual?: number; // minutes timed
  estimate?: number;
  minutes: number; // estimate, else duration, else 0
  tagIds: string[];
  energy?: TaskEnergy;
  priority: DailyTask['priority'];
  difficulty?: 'easier' | 'asExpected' | 'harder';
  after?: FeelingZone;
  before?: FeelingZone;
}

export type DoneOn = (task: DailyTask, date: string) => boolean;

export function occurrences(tasks: DailyTask[], r: Range, doneOn: DoneOn, entries: FeelingCheckIn[], tagFilter: string[] = []): Occurrence[] {
  const out: Occurrence[] = [];
  const dates = datesInRange(r.start, r.end);
  for (const task of tasks) {
    if (tagFilter.length && !task.tagIds.some((id) => tagFilter.includes(id))) continue;
    for (const date of dates) {
      if (!occursOn(task, date)) continue;
      const done = doneOn(task, date);
      out.push({
        taskId: task.id,
        date,
        done,
        completedAt: done ? task.completedAt[date] : undefined,
        actual: task.actualMinutes[date],
        estimate: task.estimateMinutes,
        minutes: task.estimateMinutes ?? task.durationMinutes ?? 0,
        tagIds: task.tagIds,
        energy: task.energy,
        priority: task.priority,
        difficulty: task.completionNotes[date]?.difficulty,
        after: linkedEntry(task, date, 'after', entries)?.zone,
        before: linkedEntry(task, date, 'before', entries)?.zone,
      });
    }
  }
  return out;
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const WEEKDAY_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';
export const TIME_OF_DAY_LABEL: Record<TimeOfDay, string> = { morning: 'the morning', afternoon: 'the afternoon', evening: 'the evening', night: 'at night' };
export function timeOfDay(isoDateTime: string): TimeOfDay {
  const h = new Date(isoDateTime).getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 22) return 'evening';
  return 'night';
}

// Finished tasks by part of the day, morning to night (only parts that have any).
export function finishTimes(occ: Occurrence[]): { counts: [TimeOfDay, number][]; of: number } {
  const timed = occ.filter((o) => o.completedAt);
  const m = new Map<TimeOfDay, number>();
  for (const o of timed) m.set(timeOfDay(o.completedAt!), (m.get(timeOfDay(o.completedAt!)) ?? 0) + 1);
  const order: TimeOfDay[] = ['morning', 'afternoon', 'evening', 'night'];
  return { counts: order.filter((t) => m.has(t)).map((t) => [t, m.get(t)!] as [TimeOfDay, number]), of: timed.length };
}

const TIME_SHORT: Record<TimeOfDay, string> = { morning: 'morning', afternoon: 'afternoon', evening: 'evening', night: 'night' };
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const timesText = (counts: [TimeOfDay, number][]) => counts.map(([t, n]) => `${TIME_SHORT[t]} ${n}`).join(' · ');

// An insight that isn't ready yet still says how far along it is.
export interface Gate {
  enough: boolean;
  n: number;
  needed: number;
  unit: string; // "tasks", "timed tasks"...
}
const gate = (n: number, unit: string, needed = MIN_POINTS): Gate => ({ enough: n >= needed, n, needed, unit });

// --- 1. Completion over time ------------------------------------------------------
export interface CompletionInsight extends Gate {
  series: { key: string; start: string; planned: number; done: number }[];
  planned: number;
  done: number;
  rate: number;
  byWeekday: { weekday: number; name: string; rate: number; planned: number }[]; // in week order
  times: [TimeOfDay, number][]; // finished tasks, morning to night
  lines: string[];
}

export function completionInsight(occ: Occurrence[], bs: Bucket[]): CompletionInsight {
  const series = bs.map((b) => {
    const inB = occ.filter((o) => o.date >= b.start && o.date <= b.end);
    return { key: b.key, start: b.start, planned: inB.length, done: inB.filter((o) => o.done).length };
  });
  const planned = occ.length;
  const done = occ.filter((o) => o.done).length;
  const byDay = new Map<number, { planned: number; done: number }>();
  for (const o of occ) {
    const d = byDay.get(weekdayOfISO(o.date)) ?? { planned: 0, done: 0 };
    d.planned += 1;
    if (o.done) d.done += 1;
    byDay.set(weekdayOfISO(o.date), d);
  }
  // Every weekday that had tasks, in week order: the numbers, no "best day".
  const ws = getCalendarWeekStart();
  const byWeekday = [0, 1, 2, 3, 4, 5, 6]
    .map((k) => (ws + k) % 7)
    .filter((wd) => byDay.has(wd))
    .map((wd) => ({ weekday: wd, name: WEEKDAY_SHORT[wd], rate: pct(byDay.get(wd)!.done, byDay.get(wd)!.planned), planned: byDay.get(wd)!.planned }));
  const ft = finishTimes(occ);
  const g = gate(planned, 'tasks');
  const lines = g.enough
    ? [
        `You finished ${done} of ${plural(planned, 'task')} (${pct(done, planned)}%).`,
        ...(byWeekday.length > 1 ? [`Done by weekday: ${byWeekday.map((d) => `${d.name} ${d.rate}% of ${d.planned}`).join(' · ')}.`] : []),
        ...(ft.of >= MIN_POINTS ? [`When the ${plural(ft.of, 'finished task')} with a time were checked off: ${timesText(ft.counts)}.`] : []),
      ]
    : [];
  return { ...g, series, planned, done, rate: pct(done, planned), byWeekday, times: ft.counts, lines };
}

// --- 2. By tag --------------------------------------------------------------------
export interface TagStat {
  tag: TaskTag;
  planned: number;
  done: number;
  rate: number;
  minutes: number; // timed
  moved: number; // times its tasks were moved to another day
}
export interface TagInsight extends Gate {
  tags: TagStat[]; // only tags with enough tasks to say something, in your tag order
  quiet: TaskTag[]; // "haven't had much room lately"
  lines: string[];
}

export function tagInsight(occ: Occurrence[], tasks: DailyTask[], tags: TaskTag[]): TagInsight {
  const stats: TagStat[] = tags.map((tag) => {
    const mine = occ.filter((o) => o.tagIds.includes(tag.id));
    const done = mine.filter((o) => o.done).length;
    const moved = tasks.filter((t) => t.tagIds.includes(tag.id) && mine.some((o) => o.taskId === t.id)).reduce((s, t) => s + t.moveCount, 0);
    return { tag, planned: mine.length, done, rate: pct(done, mine.length), minutes: mine.reduce((s, o) => s + (o.actual ?? 0), 0), moved };
  });
  const shown = stats.filter((s) => s.planned >= MIN_POINTS);
  const quiet = stats
    .filter((s) => (s.planned === 0 && tasks.some((t) => t.tagIds.includes(s.tag.id))) || (s.planned >= 3 && s.done === 0))
    .map((s) => s.tag);
  const tagged = occ.filter((o) => o.tagIds.length).length;
  const g = gate(tagged, 'tagged tasks');
  const lines = g.enough
    ? [
        ...shown.map((s) => `${s.tag.name}: ${s.done} of ${s.planned} done (${s.rate}%)${s.minutes ? `, ${s.minutes} min timed` : ''}${s.moved ? `, moved ${plural(s.moved, 'time')}` : ''}.`),
        ...(quiet.length ? [`Haven't had much room lately: ${quiet.map((t) => t.name).join(', ')}. Only if you want them to.`] : []),
      ]
    : [];
  return { ...g, tags: shown, quiet, lines };
}

// --- 3. Estimate accuracy ------------------------------------------------------------
export interface EstimateInsight extends Gate {
  pairs: { estimate: number; actual: number }[];
  ratio: number; // median actual / estimate
  percent: number; // +30 = takes 30% longer
  lines: string[];
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function estimateInsight(occ: Occurrence[]): EstimateInsight {
  const pairs = occ.filter((o) => o.estimate && o.actual).map((o) => ({ estimate: o.estimate!, actual: o.actual! }));
  const g = gate(pairs.length, 'timed tasks with an estimate');
  const ratio = pairs.length ? median(pairs.map((p) => p.actual / p.estimate)) : 1;
  const percent = Math.round((ratio - 1) * 100);
  let lines: string[] = [];
  if (g.enough) {
    const across = `Across ${plural(pairs.length, 'timed task')} with an estimate (the middle value)`;
    if (Math.abs(percent) <= 10) lines = [`${across}, tasks took about as long as estimated, within 10%.`];
    else if (percent > 0) lines = [`${across}, tasks took about ${percent}% longer than estimated.`, `Adding about ${percent}% when you estimate might make days feel less tight.`];
    else lines = [`${across}, tasks took about ${-percent}% less time than estimated.`, 'You could plan a little more into a day, if you want to.'];
  }
  return { ...g, pairs, ratio, percent, lines };
}

// --- 4. Energy match ---------------------------------------------------------------
export interface EnergyInsight extends Gate {
  high: [TimeOfDay, number][]; // high-energy tasks finished, morning to night
  all: [TimeOfDay, number][]; // every finished task with a time
  highDone: number;
  lines: string[];
}

export function energyInsight(occ: Occurrence[]): EnergyInsight {
  const all = finishTimes(occ);
  const high = finishTimes(occ.filter((o) => o.energy === 'high'));
  const g = gate(high.of, 'high-energy tasks finished');
  const lines = g.enough
    ? [`High-energy tasks, when they were finished (${high.of}): ${timesText(high.counts)}.`, `All finished tasks with a time (${all.of}): ${timesText(all.counts)}.`]
    : [];
  return { ...g, high: high.counts, all: all.counts, highDone: high.of, lines };
}

// --- 5 & 6. Feelings after tasks ------------------------------------------------
const ZONE_LABEL: Record<FeelingZone, string> = { lively: 'Lively', calm: 'Calm', tense: 'Tense', low: 'Low', okay: 'Okay' };
const ZONES: FeelingZone[] = ['lively', 'calm', 'tense', 'low', 'okay']; // the app's zone order
const mixText = (count: (z: FeelingZone) => number) => ZONES.filter((z) => count(z) > 0).map((z) => `${ZONE_LABEL[z]} ${count(z)}`).join(' · ');

export interface FeelingsInsight extends Gate {
  mix: Record<FeelingZone, number>;
  byTag: { tag: TaskTag; n: number; mix: Record<FeelingZone, number> }[]; // your tag order
  harder: { tag: TaskTag; n: number; harder: number }[];
  lines: string[];
}

export function feelingsInsight(occ: Occurrence[], tags: TaskTag[]): FeelingsInsight {
  const felt = occ.filter((o) => o.after);
  const mix = Object.fromEntries(ZONES.map((z) => [z, felt.filter((o) => o.after === z).length])) as Record<FeelingZone, number>;
  const byTag = tags
    .map((tag) => {
      const mine = felt.filter((o) => o.tagIds.includes(tag.id));
      const tagMix = Object.fromEntries(ZONES.map((z) => [z, mine.filter((o) => o.after === z).length])) as Record<FeelingZone, number>;
      return { tag, n: mine.length, mix: tagMix };
    })
    .filter((t) => t.n >= MIN_POINTS);
  const harder = tags
    .map((tag) => {
      const rated = occ.filter((o) => o.difficulty && o.tagIds.includes(tag.id));
      return { tag, n: rated.length, harder: rated.filter((o) => o.difficulty === 'harder').length };
    })
    .filter((t) => t.n >= MIN_POINTS);
  const g = gate(felt.length, 'feelings after tasks');
  const lines = g.enough
    ? [
        `How you felt after tasks (${plural(felt.length, 'feeling')}): ${mixText((z) => mix[z])}.`,
        ...byTag.map((t) => `After tasks tagged ${t.tag.name} (${t.n}): ${mixText((z) => t.mix[z])}.`),
        ...harder.map((t) => `Tasks tagged ${t.tag.name}: harder than expected ${t.harder} of ${plural(t.n, 'time')} rated.`),
      ]
    : [];
  return { ...g, mix, byTag, harder, lines };
}

export interface FeelGoodInsight extends Gate {
  perTag: { tag: TaskTag; n: number; pleasant: number; unpleasant: number }[]; // your tag order
  lines: string[];
}

export function feelGoodInsight(occ: Occurrence[], tags: TaskTag[]): FeelGoodInsight {
  const felt = occ.filter((o) => o.after);
  const perTag = tags
    .map((tag) => {
      const mine = felt.filter((o) => o.tagIds.includes(tag.id));
      return {
        tag,
        n: mine.length,
        pleasant: mine.filter((o) => o.after === 'lively' || o.after === 'calm').length,
        unpleasant: mine.filter((o) => o.after === 'tense' || o.after === 'low').length,
      };
    })
    .filter((t) => t.n >= MIN_POINTS);
  const g = gate(felt.length, 'feelings after tasks');
  const lines = !g.enough
    ? []
    : perTag.length === 0
      ? ['No single tag has 5 feelings after it yet.']
      : perTag.map((t) => `${t.tag.name} (${t.n}): Lively or Calm ${t.pleasant} · Tense or Low ${t.unpleasant}.`);
  return { ...g, perTag, lines };
}

// --- 7. Overload ---------------------------------------------------------------
export const OVERLOAD_FACTOR = 1.25;

export interface OverloadInsight extends Gate {
  days: { date: string; plannedMinutes: number; rate: number }[]; // the overloaded ones
  overRate: number;
  otherRate: number;
  lines: string[];
}

export function overloadInsight(occ: Occurrence[], availableMinutes: number): OverloadInsight {
  const byDay = new Map<string, Occurrence[]>();
  for (const o of occ) byDay.set(o.date, [...(byDay.get(o.date) ?? []), o]);
  const withEstimates = [...byDay.entries()].filter(([, list]) => list.some((o) => o.minutes > 0));
  const isOver = (list: Occurrence[]) => list.reduce((s, o) => s + o.minutes, 0) > availableMinutes * OVERLOAD_FACTOR;
  const over = withEstimates.filter(([, l]) => isOver(l));
  const other = withEstimates.filter(([, l]) => !isOver(l));
  const rateOf = (days: [string, Occurrence[]][]) => {
    const all = days.flatMap(([, l]) => l);
    return pct(all.filter((o) => o.done).length, all.length);
  };
  const g = gate(withEstimates.length, 'days with time estimates');
  const overRate = rateOf(over);
  const otherRate = rateOf(other);
  const lines =
    g.enough && over.length
      ? [
          `On ${plural(over.length, 'day')}, you planned well over your usual time for tasks.`,
          ...(other.length ? [`On those days you finished ${overRate}% of tasks; on other days, ${otherRate}%.`] : []),
        ]
      : g.enough
        ? ['Your days stayed within the time you have for tasks.']
        : [];
  return {
    ...g,
    days: over.map(([date, l]) => ({ date, plannedMinutes: l.reduce((s, o) => s + o.minutes, 0), rate: pct(l.filter((o) => o.done).length, l.length) })),
    overRate,
    otherRate,
    lines,
  };
}

// --- 8. Carry-over -----------------------------------------------------------------
export const MOVED_OFTEN = 3;

// Open one-off tasks moved 3 or more times: offer to break down, reschedule or let go.
export function movedOften(tasks: DailyTask[], doneOn: DoneOn): DailyTask[] {
  return tasks
    .filter((t) => t.repeat === 'none' && t.moveCount >= MOVED_OFTEN && !doneOn(t, t.date) && !t.letGoDates.includes(t.date))
    .sort((a, b) => b.moveCount - a.moveCount);
}

// --- 9. Planning days (a calm streak: gaps pause it, nothing resets it) ---------------
export const STREAK_PAUSE_DAYS = 2;

export interface PlanningStreak {
  current: number; // planning days in the current run
  paused: boolean; // no planning today (yet), but the run is still open
  best: number;
  total: number; // planning days in the last year
}

// A planning day: a day with a one-off task on it, or with anything ticked off.
export function planningDays(tasks: DailyTask[], since: string, today: string): Set<string> {
  const days = new Set<string>();
  for (const t of tasks) {
    if (t.repeat === 'none' && t.date >= since && t.date <= today) days.add(t.date);
    for (const d of Object.keys(t.completedAt)) if (d >= since && d <= today) days.add(d);
  }
  return days;
}

export function planningStreak(days: Set<string>, today: string): PlanningStreak {
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let last: string | undefined;
  for (const d of sorted) {
    // Up to STREAK_PAUSE_DAYS empty days in between just pause the run.
    run = last && daysBetweenISODates(last, d) <= STREAK_PAUSE_DAYS + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    last = d;
  }
  const open = !!last && daysBetweenISODates(last, today) <= STREAK_PAUSE_DAYS;
  return { current: open ? run : 0, paused: open && last !== today, best, total: days.size };
}

// --- Weekly review (Recap) -------------------------------------------------------
export interface WeeklyReview {
  weekStart: string;
  wins: string[];
  slipped: string[];
  suggestion: string;
}

// For the week before this one. Undefined when there's too little to say.
export function weeklyReview(
  tasks: DailyTask[],
  tags: TaskTag[],
  today: string,
  weekStartsOn: number,
  doneOn: DoneOn,
  entries: FeelingCheckIn[],
  availableMinutes: number,
  titleOf: (t: DailyTask) => string
): WeeklyReview | undefined {
  const thisWeek = weekStartFor(today, weekStartsOn);
  const r = { start: addDaysISO(thisWeek, -7), end: addDaysISO(thisWeek, -1) };
  const occ = occurrences(tasks, r, doneOn, entries);
  if (occ.length < MIN_POINTS) return undefined;
  const c = completionInsight(occ, buckets(r, 'day', weekStartsOn));
  const t = tagInsight(occ, tasks, tags);
  const wins: string[] = [`You finished ${plural(c.done, 'task')}.`];
  const doneByTag = t.tags.filter((x) => x.done > 0);
  if (doneByTag.length) wins.push(`Done by tag: ${doneByTag.map((x) => `${x.tag.name} ${x.done}`).join(' · ')}.`);
  const open = occ.filter((o) => !o.done);
  const moved = tasks.filter((x) => x.moveCount >= 2 && occ.some((o) => o.taskId === x.id));
  const slipped: string[] = [];
  if (open.length) slipped.push(`${plural(open.length, 'task')} stayed open. That's okay; they can wait or go.`);
  if (moved.length) slipped.push(`Kept moving: ${moved.slice(0, 2).map(titleOf).join(', ')}.`);
  const est = estimateInsight(occurrences(tasks, { start: addDaysISO(r.start, -21), end: r.end }, doneOn, entries));
  const over = overloadInsight(occ, availableMinutes);
  const suggestion = est.enough && est.percent > 10
    ? est.lines[1]
    : over.enough && over.days.length
      ? 'A lighter plan on busy days might leave room to breathe.'
      : open.length > c.done
        ? 'Picking just one or two must-dos per day can make a week feel calmer.'
        : 'Keep doing what works for you.';
  return { weekStart: r.start, wins, slipped, suggestion };
}
