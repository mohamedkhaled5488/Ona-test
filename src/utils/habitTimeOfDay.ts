// "Time of day" for a habit, without inventing a winner.
//
// Completion rates by time of day only mean something when there is a
// denominator: the time the habit was *planned* for. A "Missed" tap at 9pm
// says nothing about when it was meant to happen. So:
// - Check-ins that carry a planned time are grouped by that time, and rates
//   are compared only when two groups each have at least MIN_ATTEMPTS and
//   differ by at least MIN_GAP points. Otherwise: "both work for you".
// - Without planned times there's no "missed" to count, so the card shows
//   only when the habit is usually completed, with no rates and no "better".
// - Quit habits: when urges and slips happen, as counts, never a ranking.
// Wording stays correlational ("seem to", "tends to"); counts always shown.
import type { HabitCheckIn, QuitFeelingEntry, QuitTrack } from '../types/sections';
import { addDaysISO } from './date';

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';
export const DAY_PARTS: DayPart[] = ['morning', 'afternoon', 'evening', 'night'];
export const DAY_PART_LABEL: Record<DayPart, string> = { morning: 'Mornings', afternoon: 'Afternoons', evening: 'Evenings', night: 'Nights' };
const IN_PART: Record<DayPart, string> = { morning: 'in the morning', afternoon: 'in the afternoon', evening: 'in the evening', night: 'at night' };

export const MIN_ATTEMPTS = 5; // per group, before comparing
export const MIN_GAP = 15; // percentage points, before saying one works better
export const MIN_COMPLETIONS = 5; // before showing when it's usually done

export function dayPartForHour(hour: number): DayPart {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night'; // 9pm to 5am
}

const hourOfHHMM = (t: string) => Number(t.split(':')[0]);
const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// When a check-in was actually completed, if that's known and belongs to its
// day: on the day itself, or before 6am the next morning (a late-night
// session). A day filled in later from the calendar has no real time.
export function completionTime(c: HabitCheckIn): Date | undefined {
  if (!c.done) return undefined;
  const at = new Date(c.completedAt ?? c.createdAt);
  if (Number.isNaN(at.getTime())) return undefined;
  const day = localDate(at);
  if (day === c.date) return at;
  if (day === addDaysISO(c.date, 1) && at.getHours() < 6) return at;
  return undefined;
}

export interface PartCount {
  part: DayPart;
  count: number;
}
export interface PartRate {
  part: DayPart;
  done: number;
  attempts: number;
  rate: number; // 0-100
}

export type TimeOfDayInsight =
  | { kind: 'notEnough'; n: number; needed: number }
  // No planned times: when it's usually done (no rates, no "better").
  | { kind: 'whenDone'; parts: PartCount[]; n: number; lines: string[] }
  // Planned times: rates per group, ranked only if the difference is real.
  | { kind: 'rates'; parts: PartRate[]; n: number; clearer: boolean; lines: string[] };

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function habitTimeOfDay(checkIns: HabitCheckIn[], habitId: string): TimeOfDayInsight {
  const mine = checkIns.filter((c) => c.habitId === habitId);
  const planned = mine.filter((c) => c.plannedTime);

  // With planned times: rates by the time it was planned for.
  const groups = new Map<DayPart, { done: number; attempts: number }>();
  for (const c of planned) {
    const part = dayPartForHour(hourOfHHMM(c.plannedTime!));
    const g = groups.get(part) ?? { done: 0, attempts: 0 };
    g.attempts += 1;
    if (c.done) g.done += 1;
    groups.set(part, g);
  }
  const rates: PartRate[] = DAY_PARTS.filter((p) => groups.has(p)).map((part) => {
    const g = groups.get(part)!;
    return { part, done: g.done, attempts: g.attempts, rate: pct(g.done, g.attempts) };
  });
  const comparable = rates.filter((r) => r.attempts >= MIN_ATTEMPTS);
  if (comparable.length >= 2) {
    const sorted = [...comparable].sort((a, b) => b.rate - a.rate);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const clearer = best.rate - worst.rate >= MIN_GAP;
    const show = (r: PartRate) => `${DAY_PART_LABEL[r.part]}: ${r.rate}% done (${r.done} of ${r.attempts})`;
    const lines = clearer
      ? [`${show(best)}. ${show(worst)}.`, `${DAY_PART_LABEL[best.part]} seem to work better for this habit.`]
      : [
          `You complete this well ${comparable.map((r) => `${IN_PART[r.part]} (${r.rate}%)`).join(' and ')}.`,
          comparable.length === 2 ? 'Both times work for you.' : 'They all work for you.',
        ];
    return { kind: 'rates', parts: rates, n: planned.length, clearer, lines };
  }
  if (comparable.length === 1 && rates.length === 1) {
    const r = comparable[0];
    return {
      kind: 'rates',
      parts: rates,
      n: planned.length,
      clearer: false,
      lines: [`Planned ${IN_PART[r.part]}, you've done it ${r.done} of ${r.attempts} times (${r.rate}%).`],
    };
  }

  // Otherwise: when it's usually completed. No rates, no winner.
  const times = mine.map(completionTime).filter((t): t is Date => !!t);
  if (times.length < MIN_COMPLETIONS) return { kind: 'notEnough', n: times.length, needed: MIN_COMPLETIONS };
  const counts = new Map<DayPart, number>();
  for (const t of times) counts.set(dayPartForHour(t.getHours()), (counts.get(dayPartForHour(t.getHours())) ?? 0) + 1);
  const parts = DAY_PARTS.filter((p) => counts.has(p)).map((part) => ({ part, count: counts.get(part)! }));
  const top = [...parts].sort((a, b) => b.count - a.count)[0];
  const lines = [
    parts.length === 1
      ? `You usually complete it ${IN_PART[top.part]} (${plural(top.count, 'time')}).`
      : `When you complete it: ${parts.map((p) => `${IN_PART[p.part]} ${p.count}`).join(', ')}.`,
    'Add a planned time (the cue reminder) to see which time works best.',
  ];
  return { kind: 'whenDone', parts, n: times.length, lines };
}

// --- Quit: when urges and slips happen -----------------------------------------------
export interface QuitTiming {
  n: number;
  parts: PartCount[];
  lines: string[];
}

// Counts per time of day. Says "tend to" only when one time clearly holds
// most of them (at least 5, and 60% or more); never "worse" or "better".
export function quitTiming(feelingEntries: QuitFeelingEntry[], tracks: QuitTrack[], habitId: string): QuitTiming | undefined {
  const trackIds = new Set(tracks.filter((t) => t.quitHabitId === habitId).map((t) => t.id));
  const moments = feelingEntries.filter((e) => trackIds.has(e.trackId) && (e.isResistedUrge || e.isRelapseMoment));
  if (moments.length === 0) return undefined;
  const counts = new Map<DayPart, number>();
  for (const e of moments) {
    const part = dayPartForHour(new Date(e.createdAt).getHours());
    counts.set(part, (counts.get(part) ?? 0) + 1);
  }
  const parts = DAY_PARTS.filter((p) => counts.has(p)).map((part) => ({ part, count: counts.get(part)! }));
  const top = [...parts].sort((a, b) => b.count - a.count)[0];
  const lines =
    top.count >= MIN_ATTEMPTS && top.count / moments.length >= 0.6
      ? [`Urges tend to come ${IN_PART[top.part]} (${top.count} of ${moments.length}).`]
      : [`Urges logged: ${parts.map((p) => `${IN_PART[p.part]} ${p.count}`).join(', ')}.`];
  return { n: moments.length, parts, lines };
}
