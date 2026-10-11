// Analysis partition logic for Habits (both Build and Quit mode) — same
// honesty rules as Feelings Analysis (feelingsStats.ts): correlational only,
// gated by a minimum sample size, never diagnostic. Reuses feelingsStats'
// own threshold and zone helpers directly rather than re-deriving them.
import type { Habit, HabitCheckIn, HabitFrequency, FeelingCheckIn, FeelingZone, QuitFeelingEntry, QuitTrack } from '../types/sections';
import { completionRate, isScheduledDay, longestFrequencyStreak } from './habitFrequency';
import { ANALYSIS_MIN_TAG_COUNT, mostCommonZone } from './feelingsStats';
import { zoneMeta } from '../data/feelingsWheel';
import { addDaysISO } from './date';

// A local equivalent of useQuitHabitsStore's tracksForHabit — duplicated
// rather than imported so this stays a pure utility module with no zustand
// dependency (importing the store here would pull immer into every test
// that touches habitStats.ts, which jest can't transform).
function tracksForHabit(tracks: QuitTrack[], habitId: string): QuitTrack[] {
  return tracks.filter((t) => t.quitHabitId === habitId);
}

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// --- Build mode ---

export interface SkipWeekdayStat {
  weekday: string;
  count: number;
}

// The day of week most associated with a Missed check-in — "Skipped most
// often on Mondays," never framed as a reason, just an observed pattern.
export function mostSkippedWeekday(checkIns: HabitCheckIn[], habitId: string, minCount: number = ANALYSIS_MIN_TAG_COUNT): SkipWeekdayStat | undefined {
  const counts = new Array(7).fill(0);
  checkIns
    .filter((c) => c.habitId === habitId && !c.done)
    .forEach((c) => counts[new Date(`${c.date}T00:00:00`).getDay()] += 1);
  const max = Math.max(...counts);
  if (max < minCount) return undefined;
  return { weekday: WEEKDAY_LABELS[counts.indexOf(max)], count: max };
}

export interface SkipReasonStat {
  tag: string;
  count: number;
}

// The reason tag most associated with a Missed check-in.
export function mostSkippedReasonTag(checkIns: HabitCheckIn[], habitId: string, minCount: number = ANALYSIS_MIN_TAG_COUNT): SkipReasonStat | undefined {
  const counts = new Map<string, number>();
  checkIns
    .filter((c) => c.habitId === habitId && !c.done)
    .forEach((c) => (c.reasonTags ?? []).forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0 || sorted[0][1] < minCount) return undefined;
  return { tag: sorted[0][0], count: sorted[0][1] };
}

export interface CompletionFeelingStat {
  zone: FeelingZone;
  count: number;
  total: number;
}

// Which feeling zone most often follows a completed check-in for this habit
// — only ever looks at feelings logged against this specific habit (via
// FeelingCheckIn.source), reusing feelingsStats' own zone-counting logic.
export function completionFeelingZone(feelingEntries: FeelingCheckIn[], habitId: string, minCount: number = ANALYSIS_MIN_TAG_COUNT): CompletionFeelingStat | undefined {
  const matches = feelingEntries.filter((e) => e.source?.kind === 'habit' && e.source.refId === habitId);
  if (matches.length < minCount) return undefined;
  const stat = mostCommonZone(matches);
  return stat ? { zone: stat.zone, count: stat.count, total: matches.length } : undefined;
}

export type TimeOfDayBucket = 'before 9am' | '9am–6pm' | 'after 6pm';

function bucketForHour(hour: number): TimeOfDayBucket {
  if (hour < 9) return 'before 9am';
  if (hour < 18) return '9am–6pm';
  return 'after 6pm';
}

export interface TimeOfDayStat {
  bucket: TimeOfDayBucket;
  completionRate: number; // 0-100
  count: number;
}

// Whether this habit's completion rate differs by the time of day it's
// checked in — each bucket only reported once it clears the minimum sample.
export function completionByTimeOfDay(checkIns: HabitCheckIn[], habitId: string, minCount: number = ANALYSIS_MIN_TAG_COUNT): TimeOfDayStat[] {
  const byBucket = new Map<TimeOfDayBucket, { done: number; total: number }>();
  checkIns
    .filter((c) => c.habitId === habitId)
    .forEach((c) => {
      const bucket = bucketForHour(new Date(c.createdAt).getHours());
      const g = byBucket.get(bucket) ?? { done: 0, total: 0 };
      g.total += 1;
      if (c.done) g.done += 1;
      byBucket.set(bucket, g);
    });
  return Array.from(byBucket.entries())
    .filter(([, g]) => g.total >= minCount)
    .map(([bucket, g]) => ({ bucket, completionRate: Math.round((g.done / g.total) * 100), count: g.total }))
    .sort((a, b) => b.completionRate - a.completionRate);
}

// --- Quit mode ---

export interface RelapseTriggerStat {
  tag: string;
  count: number;
}

// Which reason tags are most associated with "I went back to it" moments for
// this habit — the same "biggest impact" ranking-by-count idea as Feelings
// Analysis's reason tags, applied to archived tracks' logged triggers.
export function relapseTriggerRanking(tracks: QuitTrack[], habitId: string, minCount: number = ANALYSIS_MIN_TAG_COUNT): RelapseTriggerStat[] {
  const counts = new Map<string, number>();
  tracksForHabit(tracks, habitId)
    .filter((t) => t.status === 'archived')
    .forEach((t) => (t.relapseReasonTags ?? []).forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .filter((r) => r.count >= minCount)
    .sort((a, b) => b.count - a.count);
}

export type DayPartBucket = 'morning' | 'afternoon' | 'evening' | 'night';

function dayPartForHour(hour: number): DayPartBucket {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night'; // 9pm-5am
}

export interface DayPartStat {
  bucket: DayPartBucket;
  count: number;
}

// When relapses and resisted urges actually tend to happen — "most cravings
// happen between 9pm and 11pm" territory, computed as the dominant quarter
// of the day across every documented craving/relapse moment for this habit.
export function urgeTimeOfDayPattern(
  feelingEntries: QuitFeelingEntry[],
  tracks: QuitTrack[],
  habitId: string,
  minCount: number = ANALYSIS_MIN_TAG_COUNT
): DayPartStat | undefined {
  const trackIds = new Set(tracksForHabit(tracks, habitId).map((t) => t.id));
  const counts: Record<DayPartBucket, number> = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  feelingEntries
    .filter((e) => trackIds.has(e.trackId) && (e.isRelapseMoment || e.isResistedUrge))
    .forEach((e) => { counts[dayPartForHour(new Date(e.createdAt).getHours())] += 1; });
  const sorted = (Object.entries(counts) as [DayPartBucket, number][]).sort((a, b) => b[1] - a[1]);
  if (sorted[0][1] < minCount) return undefined;
  return { bucket: sorted[0][0], count: sorted[0][1] };
}

// A local equivalent of useQuitHabitsStore's daysSinceTrackStart — see the
// note on tracksForHabit above for why this is duplicated, not imported.
function daysSinceTrackStart(track: QuitTrack, today: string): number {
  const start = new Date(`${track.startDate}T00:00:00`);
  const end = new Date(`${track.endDate ?? today}T00:00:00`);
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
}

// One short, plain-language paragraph summarizing a Build habit's last
// `windowDays` — the "headline" above the full chronological log, not a
// replacement for it. Undefined when there's nothing logged yet.
export function buildHabitAnalysisSummary(
  checkIns: HabitCheckIn[],
  feelingEntries: FeelingCheckIn[],
  habitId: string,
  today: string,
  windowDays = 30
): string | undefined {
  const windowStart = addDaysISO(today, -(windowDays - 1));
  const windowCheckIns = checkIns.filter((c) => c.habitId === habitId && c.date >= windowStart);
  if (windowCheckIns.length === 0) return undefined;
  const completedCount = windowCheckIns.filter((c) => c.done).length;
  const feelingStat = completionFeelingZone(feelingEntries.filter((e) => e.date >= windowStart), habitId);
  const skipWeekday = mostSkippedWeekday(windowCheckIns, habitId);

  let summary = `Over the past ${windowDays} days, you've completed this habit ${completedCount} time${completedCount === 1 ? '' : 's'}`;
  if (feelingStat) summary += `, most often feeling ${zoneMeta(feelingStat.zone).label} afterward`;
  if (skipWeekday) summary += `, and most often skipped it on ${skipWeekday.weekday}s`;
  return `${summary}.`;
}

// Same idea for a Quit habit — spans its whole history (every track), not
// just a trailing window, since "longest stretch" and "tracks so far" are
// inherently whole-journey facts.
export function quitAnalysisSummary(tracks: QuitTrack[], feelingEntries: QuitFeelingEntry[], habitId: string, today: string): string | undefined {
  const relevant = tracksForHabit(tracks, habitId);
  if (relevant.length === 0) return undefined;
  const longest = Math.max(...relevant.map((t) => daysSinceTrackStart(t, today)));
  const trackIds = new Set(relevant.map((t) => t.id));
  const resistedThisMonth = feelingEntries.filter(
    (e) => trackIds.has(e.trackId) && e.isResistedUrge && e.createdAt.slice(0, 10) >= addDaysISO(today, -29)
  ).length;
  const timeOfDay = urgeTimeOfDayPattern(feelingEntries, tracks, habitId);
  const triggers = relapseTriggerRanking(tracks, habitId);

  let summary = `Across ${relevant.length} track${relevant.length === 1 ? '' : 's'}, your longest stretch was ${longest} day${longest === 1 ? '' : 's'}.`;
  if (resistedThisMonth > 0) {
    summary += ` You've resisted ${resistedThisMonth} urge${resistedThisMonth === 1 ? '' : 's'} this month`;
    if (timeOfDay) summary += `, most often in the ${timeOfDay.bucket}`;
    if (triggers[0]) summary += `, most often linked to ${triggers[0].tag}`;
    summary += '.';
  }
  return summary;
}

export interface BestApproachStat {
  approach: string;
  passedCount: number;
  totalCount: number;
}

// Which craving-menu approach has actually worked best for this specific
// user — "Going for a walk has worked for you 4 of the last 5 times." Only
// surfaced once an approach has enough attempts to say something real about
// it; a single lucky or unlucky try never gets singled out.
export function bestApproachForHabit(feelingEntries: QuitFeelingEntry[], tracks: QuitTrack[], habitId: string, minCount: number = ANALYSIS_MIN_TAG_COUNT): BestApproachStat | undefined {
  const trackIds = new Set(tracksForHabit(tracks, habitId).map((t) => t.id));
  const byApproach = new Map<string, { passed: number; total: number }>();
  feelingEntries
    .filter((e) => trackIds.has(e.trackId) && e.isResistedUrge && e.approach)
    .forEach((e) => {
      const g = byApproach.get(e.approach!) ?? { passed: 0, total: 0 };
      g.total += 1;
      if (e.urgePassed) g.passed += 1;
      byApproach.set(e.approach!, g);
    });
  const candidates = Array.from(byApproach.entries())
    .filter(([, g]) => g.total >= minCount)
    .map(([approach, g]) => ({ approach, passedCount: g.passed, totalCount: g.total }))
    .sort((a, b) => b.passedCount / b.totalCount - a.passedCount / a.totalCount);
  return candidates[0];
}

// A rotating but always-true stat about this specific habit's journey —
// never a generic quote or manufactured praise, just whichever real fact is
// "due" today, so the Journey home view doesn't feel static. Rotates by
// day-of-year so it changes daily without needing any stored state.
export function rotatingJourneyStat(feelingEntries: QuitFeelingEntry[], tracks: QuitTrack[], habitId: string, today: string): string | undefined {
  const relevant = tracksForHabit(tracks, habitId);
  const trackIds = new Set(relevant.map((t) => t.id));
  const candidates: string[] = [];

  const longest = relevant.length > 0 ? Math.max(...relevant.map((t) => daysSinceTrackStart(t, today))) : 0;
  if (longest > 0) candidates.push(`Your longest stretch so far is ${longest} day${longest === 1 ? '' : 's'}.`);

  const resistedThisMonth = feelingEntries.filter(
    (e) => trackIds.has(e.trackId) && e.isResistedUrge && e.createdAt.slice(0, 10) >= addDaysISO(today, -29)
  ).length;
  if (resistedThisMonth > 0) candidates.push(`You've resisted ${resistedThisMonth} urge${resistedThisMonth === 1 ? '' : 's'} this month.`);

  const zoneCounts = new Map<FeelingZone, number>();
  feelingEntries
    .filter((e) => trackIds.has(e.trackId) && !e.isRelapseMoment)
    .forEach((e) => zoneCounts.set(e.zone, (zoneCounts.get(e.zone) ?? 0) + 1));
  const topZone = Array.from(zoneCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  if (topZone && topZone[1] >= 2) candidates.push(`You tend to feel ${zoneMeta(topZone[0]).label} most often when you check in.`);

  const bestApproach = bestApproachForHabit(feelingEntries, tracks, habitId, 2);
  if (bestApproach) candidates.push(`${bestApproach.approach} has worked for you ${bestApproach.passedCount} of the last ${bestApproach.totalCount} times.`);

  if (candidates.length === 0) return undefined;
  const dayOfYear = Math.floor((new Date(`${today}T00:00:00`).getTime() - new Date(`${today.slice(0, 4)}-01-01T00:00:00`).getTime()) / 86400000);
  return candidates[dayOfYear % candidates.length];
}

export interface ResistedUrgeTrend {
  currentRatio: number | null; // resisted / (resisted + relapses) over the last 30 days
  previousRatio: number | null; // the 30 days before that
  direction: 'more' | 'fewer' | 'same' | null; // resisting more/fewer/same, comparing the two ratios
}

// How the ratio of resisted urges to relapses is changing — "resisting more
// often than last month," purely factual.
export function resistedUrgeTrend(feelingEntries: QuitFeelingEntry[], tracks: QuitTrack[], habitId: string, today: string): ResistedUrgeTrend {
  const trackIds = new Set(tracksForHabit(tracks, habitId).map((t) => t.id));
  const relevant = feelingEntries.filter((e) => trackIds.has(e.trackId) && (e.isResistedUrge || e.isRelapseMoment));
  const cutoff = addDaysISO(today, -30);
  const prevCutoff = addDaysISO(today, -60);
  const ratioOf = (list: QuitFeelingEntry[]): number | null => {
    const resisted = list.filter((e) => e.isResistedUrge).length;
    const relapses = list.filter((e) => e.isRelapseMoment).length;
    return resisted + relapses > 0 ? resisted / (resisted + relapses) : null;
  };
  const currentRatio = ratioOf(relevant.filter((e) => e.createdAt.slice(0, 10) >= cutoff));
  const previousRatio = ratioOf(relevant.filter((e) => e.createdAt.slice(0, 10) >= prevCutoff && e.createdAt.slice(0, 10) < cutoff));
  let direction: ResistedUrgeTrend['direction'] = null;
  if (currentRatio != null && previousRatio != null) {
    direction = currentRatio > previousRatio ? 'more' : currentRatio < previousRatio ? 'fewer' : 'same';
  }
  return { currentRatio, previousRatio, direction };
}

// --- Long-gap re-entry and periodic review ---

export const REENTRY_GAP_DAYS = 14;
// Weekly, matching Recap's weekly rhythm.
export const REVIEW_INTERVAL_DAYS = 7;

function isActiveHabit(habit: Habit): boolean {
  return !habit.archivedAt && habit.graduationChoice !== 'formed';
}

// Days since anything last happened on this habit — a check-in (Done or
// Missed), a "resume as-is", or the habit's creation, whichever is latest.
export function daysSinceLastActivity(habit: Habit, checkIns: HabitCheckIn[], today: string): number {
  const latestCheckIn = checkIns.filter((c) => c.habitId === habit.id).reduce((max, c) => (c.date > max ? c.date : max), '');
  const last = [latestCheckIn, habit.reentryAcknowledgedAt ?? '', habit.createdAt].reduce((max, d) => (d > max ? d : max), '');
  return dayNumber(last, today) - 1;
}

// A habit untouched for two weeks or more gets a gentle re-entry screen
// instead of silently resuming as if nothing happened.
export function needsReentry(habit: Habit, checkIns: HabitCheckIn[], today: string): boolean {
  return isActiveHabit(habit) && daysSinceLastActivity(habit, checkIns, today) >= REENTRY_GAP_DAYS;
}

// The short "how's this habit going?" prompt comes due once a week — never
// while the re-entry screen is the more fitting thing to show.
export function isReviewDue(habit: Habit, checkIns: HabitCheckIn[], today: string): boolean {
  if (!isActiveHabit(habit) || needsReentry(habit, checkIns, today)) return false;
  return dayNumber(habit.lastReviewedAt ?? habit.createdAt, today) - 1 >= REVIEW_INTERVAL_DAYS;
}

// --- Habit chain (habit stacking) ---

export interface ChainStep {
  label: string;
  habitId?: string; // set when this step is itself one of the user's habits
}

// The cue-to-habit sequence ending at `habit`, earliest step first. When a
// cue matches another habit's name ("After I meditate…" where Meditate is a
// habit too), the walk keeps going back through that habit's own cue, so a
// stack reads as one chain: Wake up → Meditate → Journal.
export function habitChain(habits: Habit[], habit: Habit, maxSteps = 6): ChainStep[] {
  const steps: ChainStep[] = [{ label: habit.name, habitId: habit.id }];
  const visited = new Set([habit.id]);
  let current = habit;
  while (current.cueRoutine && steps.length < maxSteps) {
    const cue = current.cueRoutine.trim().toLowerCase();
    const previous = habits.find((h) => !visited.has(h.id) && !h.archivedAt && h.name.trim().toLowerCase() === cue);
    if (!previous) {
      steps.unshift({ label: current.cueRoutine });
      break;
    }
    steps.unshift({ label: previous.name, habitId: previous.id });
    visited.add(previous.id);
    current = previous;
  }
  return steps;
}

// --- Analysis dashboards (one per Build habit, one per Quit habit) ---

function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDaysISO(d, 1)) out.push(d);
  return out;
}

function dayNumber(start: string, date: string): number {
  return Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86400000) + 1;
}

// The longest run this habit has ever had — consecutive scheduled days, or
// consecutive weeks for an "X times a week" habit (see habitFrequency.ts).
export function longestHabitStreak(checkIns: HabitCheckIn[], habitId: string, frequency?: HabitFrequency): number {
  return longestFrequencyStreak(checkIns, habitId, frequency).current;
}

export interface CompletionDay {
  date: string;
  rate: number | null; // 0-100: share of what was planned in the trailing window that got done; null if nothing was planned yet
  status: 'done' | 'missed' | 'none' | 'off'; // 'off' = not on the schedule and nothing logged
}

// One point per day from the habit's start to today. A planned day with no
// check-in counts as not done (that's what completion means), but the window
// never reaches back before the habit existed, and only counts days the
// habit's frequency actually planned for.
export function completionSeries(
  checkIns: HabitCheckIn[],
  habitId: string,
  start: string,
  end: string,
  windowDays = 7,
  frequency?: HabitFrequency
): CompletionDay[] {
  const byDate = new Map(checkIns.filter((c) => c.habitId === habitId).map((c) => [c.date, c]));
  return datesBetween(start, end).map((date) => {
    const reach = addDaysISO(date, -(windowDays - 1));
    const entry = byDate.get(date);
    return {
      date,
      rate: completionRate(checkIns, habitId, frequency, reach < start ? start : reach, date),
      status: entry ? (entry.done ? 'done' : 'missed') : isScheduledDay(frequency, date) ? 'none' : 'off',
    };
  });
}

export interface HabitMilestone {
  day: number;
  label: string;
  date: string; // the calendar date this milestone falls (or fell) on
  reached: boolean;
}

// Day 1, one week, halfway, the target — plus graduation if it happened.
export function habitMilestones(habit: Habit, today: string): HabitMilestone[] {
  const half = Math.round(habit.targetDays / 2);
  const candidates: [number, string][] = [
    [1, 'Day 1'],
    [7, 'One week'],
    [half, 'Halfway'],
    [habit.targetDays, 'Target'],
  ];
  const byDay = new Map<number, string>();
  candidates.forEach(([day, label]) => {
    if (day >= 1 && day <= habit.targetDays && !byDay.has(day)) byDay.set(day, label);
  });
  const milestones: HabitMilestone[] = Array.from(byDay.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([day, label]) => {
      const date = addDaysISO(habit.createdAt, day - 1);
      return { day, label, date, reached: date <= today };
    });
  if (habit.graduatedAt && habit.graduationChoice) {
    milestones.push({
      day: dayNumber(habit.createdAt, habit.graduatedAt),
      label: habit.graduationChoice === 'formed' ? 'Formed' : habit.graduationChoice === 'maintenance' ? 'Maintenance' : 'Extended',
      date: habit.graduatedAt,
      reached: true,
    });
  }
  return milestones;
}

export interface SessionMinutesStat {
  bucket: TimeOfDayBucket;
  averageMinutes: number;
  count: number;
}

// For habits that use the optional timed session: does session length
// differ by time of day?
export function sessionMinutesByTimeOfDay(checkIns: HabitCheckIn[], habitId: string, minCount: number = ANALYSIS_MIN_TAG_COUNT): SessionMinutesStat[] {
  const byBucket = new Map<TimeOfDayBucket, { minutes: number; count: number }>();
  checkIns
    .filter((c) => c.habitId === habitId && c.durationMinutes)
    .forEach((c) => {
      const bucket = bucketForHour(new Date(c.createdAt).getHours());
      const g = byBucket.get(bucket) ?? { minutes: 0, count: 0 };
      g.minutes += c.durationMinutes!;
      g.count += 1;
      byBucket.set(bucket, g);
    });
  return Array.from(byBucket.entries())
    .filter(([, g]) => g.count >= minCount)
    .map(([bucket, g]) => ({ bucket, averageMinutes: Math.round(g.minutes / g.count), count: g.count }))
    .sort((a, b) => b.averageMinutes - a.averageMinutes);
}

export interface QuitHeaderStats {
  currentDays: number; // 0 when there's no active track
  resistedTotal: number;
  longestDays: number;
  trackCount: number;
}

export function quitHeaderStats(tracks: QuitTrack[], feelingEntries: QuitFeelingEntry[], habitId: string, today: string): QuitHeaderStats {
  const relevant = tracksForHabit(tracks, habitId);
  const trackIds = new Set(relevant.map((t) => t.id));
  const active = relevant.find((t) => t.status === 'active');
  return {
    currentDays: active ? daysSinceTrackStart(active, today) : 0,
    resistedTotal: feelingEntries.filter((e) => trackIds.has(e.trackId) && e.isResistedUrge).length,
    longestDays: relevant.length > 0 ? Math.max(...relevant.map((t) => daysSinceTrackStart(t, today))) : 0,
    trackCount: relevant.length,
  };
}

export interface QuitJourneyDay {
  date: string;
  trackNumber: number; // 1-based, in the order tracks were started
  dayCount: number; // which day of that track this date was
  resistedCount: number;
  relapse: boolean; // a track ended (went back to it) on this date
}

// One entry per day across the whole journey, not just the current track —
// the day count climbs within each track and drops when a new one starts,
// so the whole journey's shape reads at a glance. Days between an archived
// track and the next one starting are simply absent (a gap, not a zero).
export function quitJourneySeries(tracks: QuitTrack[], feelingEntries: QuitFeelingEntry[], habitId: string, today: string): QuitJourneyDay[] {
  const ordered = [...tracksForHabit(tracks, habitId)].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (ordered.length === 0) return [];
  const trackIds = new Set(ordered.map((t) => t.id));
  const resistedByDate = new Map<string, number>();
  feelingEntries
    .filter((e) => trackIds.has(e.trackId) && e.isResistedUrge)
    .forEach((e) => {
      const d = e.createdAt.slice(0, 10);
      resistedByDate.set(d, (resistedByDate.get(d) ?? 0) + 1);
    });
  const relapseDates = new Set(ordered.filter((t) => t.status === 'archived' && t.endDate).map((t) => t.endDate!));
  const journeyStart = ordered.reduce((min, t) => (t.startDate < min ? t.startDate : min), ordered[0].startDate);

  const days: QuitJourneyDay[] = [];
  datesBetween(journeyStart, today).forEach((date) => {
    // The most recently started track covering this date wins, so a relapse
    // and a same-day fresh start read as the drop back to day 1.
    let covering: { track: QuitTrack; number: number } | undefined;
    ordered.forEach((track, i) => {
      if (track.startDate <= date && (track.endDate ?? today) >= date) covering = { track, number: i + 1 };
    });
    if (!covering) return;
    days.push({
      date,
      trackNumber: covering.number,
      dayCount: dayNumber(covering.track.startDate, date),
      resistedCount: resistedByDate.get(date) ?? 0,
      relapse: relapseDates.has(date),
    });
  });
  return days;
}

export type QuitLogEvent =
  | { kind: 'trackStart'; at: string; date: string; trackNumber: number }
  | { kind: 'trackEnd'; at: string; date: string; trackNumber: number; days: number; reflection?: string; reasonTags?: string[] }
  | { kind: 'feeling'; at: string; date: string; trackNumber: number; entry: QuitFeelingEntry };

// Everything that ever happened on this habit's journey, newest first —
// every track starting and ending, every relapse, resisted urge, feeling and
// note — merged into one list instead of split per track.
export function quitJourneyLog(tracks: QuitTrack[], feelingEntries: QuitFeelingEntry[], habitId: string): QuitLogEvent[] {
  const ordered = [...tracksForHabit(tracks, habitId)].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const numberOf = new Map(ordered.map((t, i) => [t.id, i + 1]));
  const events: QuitLogEvent[] = [];
  ordered.forEach((t, i) => {
    events.push({ kind: 'trackStart', at: t.createdAt, date: t.startDate, trackNumber: i + 1 });
    if (t.status === 'archived' && t.endDate) {
      events.push({
        kind: 'trackEnd',
        at: `${t.endDate}T23:59:59`,
        date: t.endDate,
        trackNumber: i + 1,
        days: daysSinceTrackStart(t, t.endDate),
        reflection: t.relapseReflection,
        reasonTags: t.relapseReasonTags,
      });
    }
  });
  feelingEntries
    .filter((e) => numberOf.has(e.trackId))
    .forEach((e) => events.push({ kind: 'feeling', at: e.createdAt, date: e.createdAt.slice(0, 10), trackNumber: numberOf.get(e.trackId)!, entry: e }));
  return events.sort((a, b) => b.at.localeCompare(a.at));
}
