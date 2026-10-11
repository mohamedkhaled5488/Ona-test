import type { HabitCheckIn, HabitFrequency } from '../types/sections';
import { addDaysISO, getCalendarWeekStart } from './date';

// How often a Build habit is meant to happen, and everything that has to
// count against that instead of against every calendar day: streaks, "remember
// why" resurfacing, success/completion rates. Pure, so it's unit-testable
// (the store module itself pulls in immer, which jest can't load).

const DAILY: HabitFrequency = { kind: 'daily' };
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function frequencyOf(freq: HabitFrequency | undefined): HabitFrequency {
  return freq ?? DAILY;
}

function weekday(date: string): number {
  return new Date(`${date}T00:00:00`).getDay();
}

// The first day of the week containing `date`, for "X times a week" and
// weekly totals. Follows Settings → Week starts on unless told otherwise.
export function weekStart(date: string, weekStartsOn: number = getCalendarWeekStart()): string {
  const back = (weekday(date) - weekStartsOn + 7) % 7;
  return addDaysISO(date, -back);
}

// Whether a date is one the habit is meant to happen on. "X times a week"
// leaves every day open — which days is the user's choice.
export function isScheduledDay(freq: HabitFrequency | undefined, date: string): boolean {
  const f = frequencyOf(freq);
  return f.kind !== 'weekdays' || f.days.includes(weekday(date));
}

export function frequencyLabel(freq: HabitFrequency | undefined): string {
  const f = frequencyOf(freq);
  if (f.kind === 'daily') return 'Every day';
  if (f.kind === 'perWeek') return `${f.count}× a week`;
  if (f.days.length === 7) return 'Every day';
  const order = [1, 2, 3, 4, 5, 6, 0]; // Mon-first reads more naturally
  return order.filter((d) => f.days.includes(d)).map((d) => SHORT_DAYS[d]).join(', ');
}

export type StreakUnit = 'day' | 'week';

export interface FrequencyStreak {
  current: number;
  paused: boolean; // a scheduled day (or a whole week) has gone by without a Done since the streak was earned
  unit: StreakUnit;
}

function doneDatesFor(checkIns: HabitCheckIn[], habitId: string): Set<string> {
  return new Set(checkIns.filter((c) => c.habitId === habitId && c.done).map((c) => c.date));
}

// "Streak pauses, not resets" — same semantics as before, generalized:
//  · daily / weekdays: consecutive *scheduled* days marked Done. A day off
//    the schedule never breaks it (and a bonus Done on one doesn't add to it).
//  · X times a week: consecutive weeks that hit the target. The current week
//    counts once it's hit; until then it's still in progress, not a miss.
export function frequencyStreak(checkIns: HabitCheckIn[], habitId: string, freq: HabitFrequency | undefined, today: string): FrequencyStreak {
  const f = frequencyOf(freq);
  const done = doneDatesFor(checkIns, habitId);
  if (f.kind === 'perWeek') return weeklyStreak(done, f.count, today);

  const scheduled = (d: string) => isScheduledDay(f, d);
  // Most recent scheduled Done day, scanning back up to two years.
  let lastDone: string | undefined;
  for (let d = today, i = 0; i < 730; d = addDaysISO(d, -1), i++) {
    if (scheduled(d) && done.has(d)) { lastDone = d; break; }
  }
  if (!lastDone) return { current: 0, paused: false, unit: 'day' };

  let current = 0;
  for (let d = lastDone, i = 0; i < 730; d = addDaysISO(d, -1), i++) {
    if (!scheduled(d)) continue;
    if (!done.has(d)) break;
    current += 1;
  }
  // Paused when a scheduled day after the last Done has already arrived
  // without one — including today, matching the original daily behaviour.
  let paused = false;
  for (let d = addDaysISO(lastDone, 1); d <= today; d = addDaysISO(d, 1)) {
    if (scheduled(d)) { paused = true; break; }
  }
  return { current, paused, unit: 'day' };
}

function weeklyStreak(done: Set<string>, target: number, today: string): FrequencyStreak {
  const countInWeek = (start: string) => {
    let n = 0;
    for (let i = 0; i < 7; i++) if (done.has(addDaysISO(start, i))) n += 1;
    return n;
  };
  const thisWeek = weekStart(today);
  const thisWeekMet = countInWeek(thisWeek) >= target;
  // Start from this week if it's already met, otherwise from last week
  // (this week is still in progress, so it can't break anything yet).
  let cursor = thisWeekMet ? thisWeek : addDaysISO(thisWeek, -7);
  // Find the most recent met week (up to two years back).
  let scanned = 0;
  while (countInWeek(cursor) < target && scanned < 104) {
    cursor = addDaysISO(cursor, -7);
    scanned += 1;
  }
  if (scanned >= 104) return { current: 0, paused: false, unit: 'week' };
  const paused = cursor < addDaysISO(thisWeek, -7); // a whole finished week since went unmet
  let current = 0;
  while (countInWeek(cursor) >= target && current < 104) {
    current += 1;
    cursor = addDaysISO(cursor, -7);
  }
  return { current, paused, unit: 'week' };
}

// The best run this habit has ever had, in the same units as the current
// streak: consecutive scheduled days, or consecutive weeks that hit the target.
export function longestFrequencyStreak(checkIns: HabitCheckIn[], habitId: string, freq: HabitFrequency | undefined): FrequencyStreak {
  const f = frequencyOf(freq);
  const doneSorted = Array.from(doneDatesFor(checkIns, habitId)).sort();
  if (doneSorted.length === 0) return { current: 0, paused: false, unit: f.kind === 'perWeek' ? 'week' : 'day' };
  const first = doneSorted[0];
  const last = doneSorted[doneSorted.length - 1];
  const done = new Set(doneSorted);
  let best = 0;
  let run = 0;
  if (f.kind === 'perWeek') {
    for (let w = weekStart(first); w <= last; w = addDaysISO(w, 7)) {
      let n = 0;
      for (let i = 0; i < 7; i++) if (done.has(addDaysISO(w, i))) n += 1;
      run = n >= f.count ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return { current: best, paused: false, unit: 'week' };
  }
  for (let d = first; d <= last; d = addDaysISO(d, 1)) {
    if (!isScheduledDay(f, d)) continue;
    run = done.has(d) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { current: best, paused: false, unit: 'day' };
}

// How many check-ins the habit "expected" between two dates (inclusive) —
// the denominator for success and completion rates.
export function expectedCompletions(freq: HabitFrequency | undefined, start: string, end: string): number {
  const f = frequencyOf(freq);
  if (end < start) return 0;
  let days = 0;
  let scheduledDays = 0;
  for (let d = start; d <= end; d = addDaysISO(d, 1)) {
    days += 1;
    if (isScheduledDay(f, d)) scheduledDays += 1;
  }
  if (f.kind === 'perWeek') return (f.count * days) / 7;
  return scheduledDays;
}

// Done check-ins that count toward the schedule — for the weekdays kind, a
// bonus Done on an off day doesn't inflate the rate past what was planned.
export function countedCompletions(checkIns: HabitCheckIn[], habitId: string, freq: HabitFrequency | undefined, start: string, end: string): number {
  return checkIns.filter((c) => c.habitId === habitId && c.done && c.date >= start && c.date <= end && isScheduledDay(freq, c.date)).length;
}

// Share of what was planned that actually got done, 0–100 (capped — doing it
// more often than planned is still 100%, not 140%). Null when nothing was
// planned in the range (e.g. a window containing no scheduled weekdays).
export function completionRate(checkIns: HabitCheckIn[], habitId: string, freq: HabitFrequency | undefined, start: string, end: string): number | null {
  const expected = expectedCompletions(freq, start, end);
  if (expected <= 0) return null;
  return Math.min(100, Math.round((countedCompletions(checkIns, habitId, freq, start, end) / expected) * 100));
}

// "Remember why you started" — resurfaced when it looks like the habit is
// slipping, judged against the schedule rather than raw calendar days.
export function shouldResurfaceWhyFor(checkIns: HabitCheckIn[], habitId: string, freq: HabitFrequency | undefined, today: string): boolean {
  const f = frequencyOf(freq);
  const done = doneDatesFor(checkIns, habitId);
  if (done.has(today)) return false;
  if (f.kind === 'perWeek') {
    // Behind pace: not enough days left this week to reach the target.
    const start = weekStart(today);
    let doneThisWeek = 0;
    for (let i = 0; i < 7; i++) if (done.has(addDaysISO(start, i))) doneThisWeek += 1;
    const daysLeft = 7 - ((weekday(today) + 6) % 7); // including today
    return doneThisWeek < f.count && f.count - doneThisWeek >= daysLeft;
  }
  // The last two scheduled days before today both went undone.
  const previous: string[] = [];
  for (let d = addDaysISO(today, -1), i = 0; previous.length < 2 && i < 14; d = addDaysISO(d, -1), i++) {
    if (isScheduledDay(f, d)) previous.push(d);
  }
  return previous.length === 2 && previous.every((d) => !done.has(d));
}

// The dates of the next occurrence of each scheduled weekday (for weekly
// reminders on a weekdays habit), starting from today.
export function nextScheduledDates(freq: HabitFrequency | undefined, today: string): string[] {
  const f = frequencyOf(freq);
  if (f.kind !== 'weekdays') return [today];
  return f.days.map((day) => addDaysISO(today, (day - weekday(today) + 7) % 7));
}
