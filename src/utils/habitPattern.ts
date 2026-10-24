// The habit graph (done / missed pattern) and the milestone bar. Pure.
//
// The x-axis always spans the whole selected period: every day from the
// range's start to its end is present, even with nothing logged (a past bug
// cut the chart off after day 21).
import type { Habit, HabitCheckIn, QuitFeelingEntry, QuitTrack, QuitSlip } from '../types/sections';
import { addDaysISO, daysBetweenISODates, daysInMonthISO } from './date';
import { isScheduledDay, weekStart } from './habitFrequency';

export type PatternRange = 'month' | 'quarter' | 'all';

export function patternRange(kind: PatternRange, today: string, habitStart: string): { start: string; end: string } {
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthEnd = `${today.slice(0, 8)}${String(daysInMonthISO(today)).padStart(2, '0')}`;
  if (kind === 'month') return { start: monthStart, end: monthEnd };
  if (kind === 'quarter') {
    const [y, m] = today.split('-').map(Number);
    const startMonth = new Date(Date.UTC(y, m - 3, 1));
    return { start: `${startMonth.getUTCFullYear()}-${String(startMonth.getUTCMonth() + 1).padStart(2, '0')}-01`, end: monthEnd };
  }
  return { start: habitStart < today ? habitStart : today, end: today };
}

export const daysOf = (start: string, end: string): string[] => {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDaysISO(d, 1)) out.push(d);
  return out;
};

// --- Build habits ----------------------------------------------------------------------
// 'none' = a scheduled day that's gone by with no check-in (not the same as
// a Missed tap). 'off' = not on the schedule. 'future' = not happened yet.
// 'before' = before the habit started.
export type BuildDayStatus = 'done' | 'minimum' | 'missed' | 'none' | 'off' | 'future' | 'before';

export function buildDayStatuses(habit: Pick<Habit, 'id' | 'createdAt' | 'frequency'>, checkIns: HabitCheckIn[], start: string, end: string, today: string): { date: string; status: BuildDayStatus }[] {
  const byDate = new Map(checkIns.filter((c) => c.habitId === habit.id).map((c) => [c.date, c]));
  const first = [...byDate.keys()].reduce((min, d) => (d < min ? d : min), habit.createdAt);
  return daysOf(start, end).map((date) => {
    const c = byDate.get(date);
    if (c) return { date, status: c.done ? (c.minimum ? 'minimum' : 'done') : 'missed' };
    if (date > today) return { date, status: 'future' };
    if (date < first) return { date, status: 'before' };
    // "Per week" habits have no fixed days: any day can be the day.
    if (habit.frequency?.kind !== 'perWeek' && !isScheduledDay(habit.frequency, date)) return { date, status: 'off' };
    return { date, status: 'none' };
  });
}

export interface WeekRate {
  weekStart: string;
  done: number; // done + minimum
  planned: number; // scheduled days so far (or the weekly target)
  rate: number | null; // null = nothing planned that week yet
}

// One point per week across the range: the share of planned days done.
export function weeklyCompletion(habit: Pick<Habit, 'id' | 'createdAt' | 'frequency'>, checkIns: HabitCheckIn[], start: string, end: string, today: string): WeekRate[] {
  const days = buildDayStatuses(habit, checkIns, start, end, today);
  const weeks = new Map<string, { done: number; planned: number }>();
  for (const { date, status } of days) {
    const w = weekStart(date);
    const g = weeks.get(w) ?? { done: 0, planned: 0 };
    const perWeek = habit.frequency?.kind === 'perWeek';
    // Same rule as completionRate: an extra day done off the schedule doesn't
    // count, so the weekly line and the rate always agree.
    const scheduled = perWeek || isScheduledDay(habit.frequency, date);
    if (scheduled && (status === 'done' || status === 'minimum')) g.done += 1;
    if (!perWeek && scheduled && (status === 'done' || status === 'minimum' || status === 'missed' || status === 'none')) g.planned += 1;
    weeks.set(w, g);
  }
  const out: WeekRate[] = [];
  for (const [w, g] of weeks) {
    const planned = habit.frequency?.kind === 'perWeek' ? (w <= today && w >= weekStart(habit.createdAt) ? habit.frequency.count : 0) : g.planned;
    const done = Math.min(g.done, planned || g.done);
    out.push({ weekStart: w, done: g.done, planned, rate: planned ? Math.round((done / planned) * 100) : null });
  }
  return out;
}

// --- Quit habits ---------------------------------------------------------------------
// clean = a day on a track; resisted = a day an urge was ridden out; slip =
// the day a track ended (kept as part of the journey, never a reset);
// between = after a slip, before the next start.
export type QuitDayStatus = 'clean' | 'resisted' | 'slip' | 'between' | 'future' | 'before';

export function quitDayStatuses(habitId: string, tracks: QuitTrack[], entries: QuitFeelingEntry[], start: string, end: string, today: string, slips: QuitSlip[] = []): { date: string; status: QuitDayStatus }[] {
  const mine = tracks.filter((t) => t.quitHabitId === habitId).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const ids = new Set(mine.map((t) => t.id));
  const resistedDays = new Set(entries.filter((e) => ids.has(e.trackId) && e.isResistedUrge).map((e) => localDay(e.createdAt)));
  const slipDays = new Set([...mine.filter((t) => t.endDate).map((t) => t.endDate!), ...entries.filter((e) => ids.has(e.trackId) && e.isRelapseMoment).map((e) => localDay(e.createdAt)), ...slips.filter((s) => s.quitHabitId === habitId).map((s) => s.date)]);
  const first = mine[0]?.startDate;
  return daysOf(start, end).map((date) => {
    if (date > today) return { date, status: 'future' };
    if (!first || date < first) return { date, status: 'before' };
    if (slipDays.has(date)) return { date, status: 'slip' };
    const onTrack = mine.some((t) => date >= t.startDate && date <= (t.endDate ?? today));
    if (!onTrack) return { date, status: 'between' };
    return { date, status: resistedDays.has(date) ? 'resisted' : 'clean' };
  });
}

function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// --- Milestone bar ----------------------------------------------------------------------
export interface MilestoneMarker {
  day: number;
  label: string;
  position: number; // 0-1 along the bar
  reached: boolean;
  justReached: boolean; // reached today: the one moment for a little celebration
}
export interface MilestoneBar {
  markers: MilestoneMarker[];
  progress: number; // 0-1: where the user is now
  day: number; // today's day number (1 = the first day)
  next?: { label: string; daysLeft: number };
}

const CANDIDATES: [number, string][] = [
  [1, 'Day 1'],
  [7, '1 week'],
  [14, '2 weeks'],
  [21, '3 weeks'],
  [30, '1 month'],
  [60, '2 months'],
  [90, '3 months'],
  [180, '6 months'],
  [365, '1 year'],
];

// Measured in calendar days since the start, so it only ever moves forward:
// a paused streak or a missed day never moves the bar back.
export function milestoneBar(habit: Pick<Habit, 'createdAt' | 'targetDays'>, today: string): MilestoneBar {
  const target = Math.max(1, habit.targetDays);
  const day = Math.max(0, daysBetweenISODates(habit.createdAt, today) + 1);
  const picked = CANDIDATES.filter(([d]) => d < target);
  // Keep the bar readable: at most five markers before the target.
  const thinned = picked.length > 5 ? picked.filter((_, i) => i === 0 || i % Math.ceil(picked.length / 5) === 0) : picked;
  const list: [number, string][] = [...thinned, [target, CANDIDATES.find(([d]) => d === target)?.[1] ?? `${target} days`]];
  const markers = list.map(([d, label]) => ({
    day: d,
    label,
    position: target === 1 ? 1 : (d - 1) / (target - 1),
    reached: day >= d,
    justReached: day === d,
  }));
  const progress = day <= 0 ? 0 : target === 1 ? 1 : Math.min(1, (day - 1) / (target - 1));
  const upcoming = markers.find((m) => !m.reached);
  return { markers, progress, day, next: upcoming ? { label: upcoming.label, daysLeft: upcoming.day - day } : undefined };
}
