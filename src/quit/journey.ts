// The Quit journey's numbers, in one place. A slip is a hard day marked on
// the journey; it doesn't end anything, and the journey's day count carries
// on. Chapters (tracks) are optional: older ones, ended by a slip before this
// change, stay exactly as they were and count the same way (their end date
// is a hard day). Nothing is stored for this: everything is read from the
// tracks and slips as they are, so no history is rewritten.
//
// - Day N of your journey: from the first chapter's start, today included.
// - Clean days: days inside a chapter that weren't hard days.
// - Current run: since the last hard day (or the chapter's start), today
//   included; 0 on a hard day itself, and when no chapter is running.
// - Longest run: the longest stretch of clean days in a row.
//
// All by calendar date on this phone (ISO dates), never by hours, so
// daylight saving and time zones can't add or lose a day.
import type { QuitCravingSession, QuitSlip, QuitTrack } from '../types/sections';
import { addDaysISO, daysBetweenISODates, toISODate } from '../utils/date';

export interface JourneyCounts {
  journeyDays: number; // 0 before it starts
  cleanDays: number;
  currentRun: number;
  longestRun: number;
  hardDays: number;
  running: boolean; // a chapter is going on
}

export const EMPTY_COUNTS: JourneyCounts = { journeyDays: 0, cleanDays: 0, currentRun: 0, longestRun: 0, hardDays: 0, running: false };

// The local calendar date of an ISO datetime (when something was logged).
export const localDateOf = (iso: string): string => toISODate(new Date(iso));

export function hardDayDates(tracks: QuitTrack[], slips: QuitSlip[], habitId: string): Set<string> {
  const days = new Set<string>();
  for (const s of slips) if (s.quitHabitId === habitId) days.add(s.date);
  // Chapters ended by a slip before slips were marked on their own.
  for (const t of tracks) if (t.quitHabitId === habitId && t.status === 'archived' && t.endDate) days.add(t.endDate);
  return days;
}

function coveredDates(tracks: QuitTrack[], habitId: string, today: string): Set<string> {
  const days = new Set<string>();
  for (const t of tracks) {
    if (t.quitHabitId !== habitId) continue;
    const end = t.endDate ?? today;
    for (let d = t.startDate; d <= end && d <= today; d = addDaysISO(d, 1)) days.add(d);
  }
  return days;
}

export function journeyCounts(tracks: QuitTrack[], slips: QuitSlip[], habitId: string, today: string): JourneyCounts {
  const mine = tracks.filter((t) => t.quitHabitId === habitId);
  if (mine.length === 0) return EMPTY_COUNTS;
  const start = mine.reduce((min, t) => (t.startDate < min ? t.startDate : min), mine[0].startDate);
  if (start > today) return EMPTY_COUNTS;
  const hard = hardDayDates(mine, slips, habitId);
  const covered = coveredDates(mine, habitId, today);
  let cleanDays = 0;
  let longestRun = 0;
  let run = 0;
  for (let d = start; d <= today; d = addDaysISO(d, 1)) {
    const clean = covered.has(d) && !hard.has(d);
    if (clean) cleanDays++;
    run = clean ? run + 1 : 0;
    longestRun = Math.max(longestRun, run);
  }
  const active = mine.find((t) => t.status === 'active');
  return {
    journeyDays: daysBetweenISODates(start, today) + 1,
    cleanDays,
    currentRun: active ? run : 0,
    longestRun,
    hardDays: [...hard].filter((d) => d >= start && d <= today).length,
    running: !!active,
  };
}

// Settings → Quit a Habit → "Main number" (default: the journey).
export type QuitPrimaryNumber = 'journey' | 'clean' | 'run';

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

export interface JourneyHeadline {
  headline: string;
  smaller: string[];
}

export function journeyHeadline(c: JourneyCounts, primary: QuitPrimaryNumber = 'journey'): JourneyHeadline {
  const journey = `Day ${c.journeyDays} of your journey`;
  const clean = `${c.cleanDays} ${c.cleanDays === 1 ? 'clean day' : 'clean days'}`;
  const run = `Current run: ${days(c.currentRun)}`;
  if (primary === 'clean') return { headline: clean, smaller: [journey, run] };
  if (primary === 'run') return { headline: run, smaller: [journey, clean] };
  return { headline: journey, smaller: [clean, run] };
}

// Craving sessions: how long, and with what.
export const sessionSeconds = (s: QuitCravingSession, now: number): number => Math.max(0, Math.round(((s.endedAt ? Date.parse(s.endedAt) : now) - Date.parse(s.startedAt)) / 1000));

export function formatRideTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
