// Analysis partition logic for Habits (both Build and Quit mode) — same
// honesty rules as Feelings Analysis (feelingsStats.ts): correlational only,
// gated by a minimum sample size, never diagnostic, and never a ranking: a
// card shows the counts behind a pattern in a fixed order (week order,
// morning to night, the reason list's own order) for the user to read. Reuses feelingsStats'
// own threshold and zone helpers directly rather than re-deriving them.
import type { Habit, HabitCheckIn, HabitFrequency, FeelingCheckIn, FeelingZone, QuitFeelingEntry, QuitSlip, QuitTrack } from '../types/sections';
import { hardDayDates, localDateOf } from '../quit/journey';
import { completionRate, isScheduledDay, longestFrequencyStreak } from './habitFrequency';
import { ANALYSIS_MIN_TAG_COUNT, mostCommonZone } from './feelingsStats';
import { reasonTagOptions, zoneMeta } from '../data/feelingsWheel';
import { getCalendarWeekStart } from './date';
import { confidenceFor } from '../config/feelingsAnalysis';
import { addDaysISO, dayOfYear, daysBetweenISODates } from './date';

// A local equivalent of useQuitHabitsStore's tracksForHabit — duplicated
// rather than imported so this stays a pure utility module with no zustand
// dependency (importing the store here would pull immer into every test
// that touches habitStats.ts, which jest can't transform).
function tracksForHabit(tracks: QuitTrack[], habitId: string): QuitTrack[] {
  return tracks.filter((t) => t.quitHabitId === habitId);
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Reason tags in the reason list's own order, then any custom ones A to Z.
function inReasonOrder<T extends { tag: string }>(items: T[]): T[] {
  const order = reasonTagOptions as readonly string[];
  const rank = (t: string) => (order.includes(t) ? order.indexOf(t) : order.length);
  return [...items].sort((a, b) => rank(a.tag) - rank(b.tag) || a.tag.localeCompare(b.tag));
}

// --- Build mode ---

export interface WeekdayMisses {
  weekday: string; // "Mon"
  missed: number;
  logged: number; // check-ins logged on that weekday
}

// Missed and logged check-ins per weekday, in week order. Shown once there
// are at least `minCount` misses; never "most often skipped on".
export function missesByWeekday(checkIns: HabitCheckIn[], habitId: string, minCount: number = ANALYSIS_MIN_TAG_COUNT): WeekdayMisses[] | undefined {
  const missed = new Array(7).fill(0);
  const logged = new Array(7).fill(0);
  checkIns
    .filter((c) => c.habitId === habitId)
    .forEach((c) => {
      const d = new Date(`${c.date}T00:00:00`).getDay();
      logged[d] += 1;
      if (!c.done) missed[d] += 1;
    });
  if (missed.reduce((a, b) => a + b, 0) < minCount) return undefined;
  const ws = getCalendarWeekStart();
  return [0, 1, 2, 3, 4, 5, 6]
    .map((k) => (ws + k) % 7)
    .filter((d) => logged[d] > 0)
    .map((d) => ({ weekday: WEEKDAY_SHORT[d], missed: missed[d], logged: logged[d] }));
}

export interface SkipReasons {
  missedTotal: number; // missed check-ins considered
  tags: { tag: string; count: number }[]; // the reason list's order
}

// Reasons tagged on missed days, each with its count. Shown once reasons were
// tagged at least `minCount` times; never "the strongest link".
export function skipReasons(checkIns: HabitCheckIn[], habitId: string, minCount: number = ANALYSIS_MIN_TAG_COUNT): SkipReasons | undefined {
  const counts = new Map<string, number>();
  const missed = checkIns.filter((c) => c.habitId === habitId && !c.done);
  missed.forEach((c) => (c.reasonTags ?? []).forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total < minCount) return undefined;
  return { missedTotal: missed.length, tags: inReasonOrder([...counts.entries()].map(([tag, count]) => ({ tag, count }))) };
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

// --- Quit mode ---

export interface RelapseTriggerStat {
  tag: string;
  count: number;
}

// What was going on when tracks ended, each reason with its count, in the
// reason list's order (not ranked).
export function relapseReasonCounts(tracks: QuitTrack[], habitId: string, minCount: number = ANALYSIS_MIN_TAG_COUNT, slips: QuitSlip[] = []): RelapseTriggerStat[] {
  const counts = new Map<string, number>();
  const add = (tag: string) => counts.set(tag, (counts.get(tag) ?? 0) + 1);
  const mine = slips.filter((s) => s.quitHabitId === habitId);
  mine.forEach((s) => (s.reasonTags ?? []).forEach(add));
  // Chapters ended before slips were marked on their own (a chapter started
  // anew after a marked slip carries the same tags: counted once).
  tracksForHabit(tracks, habitId)
    .filter((t) => t.status === 'archived' && !mine.some((s) => s.trackId === t.id && s.date === t.endDate))
    .forEach((t) => (t.relapseReasonTags ?? []).forEach(add));
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total < minCount) return [];
  return inReasonOrder([...counts.entries()].map(([tag, count]) => ({ tag, count })));
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
  return Math.max(1, daysBetweenISODates(track.startDate, track.endDate ?? today) + 1);
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
  const missedCount = windowCheckIns.filter((c) => !c.done).length;
  const feelings = feelingEntries.filter((e) => e.date >= windowStart && e.source?.kind === 'habit' && e.source.refId === habitId).length;
  const times = (n: number) => `${n} time${n === 1 ? '' : 's'}`;

  const parts = [`completed this habit ${times(completedCount)}`];
  if (missedCount) parts.push(`marked it missed ${times(missedCount)}`);
  if (feelings) parts.push(`noted how you felt after it ${times(feelings)}`);
  const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Over the past ${windowDays} days, you've ${joined}.`;
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

  let summary = `Across ${relevant.length} track${relevant.length === 1 ? '' : 's'}, your longest stretch was ${longest} day${longest === 1 ? '' : 's'}.`;
  if (resistedThisMonth > 0) {
    summary += ` You've resisted ${resistedThisMonth} urge${resistedThisMonth === 1 ? '' : 's'} this month.`;
  }
  return summary;
}

export interface ApproachResult {
  approach: string;
  passedCount: number;
  totalCount: number;
}

// How each craving-menu approach went: how many times the urge passed, out of
// how many tries, A to Z. Shown once an approach has `minCount` tries; never
// "what works best".
export function approachResults(feelingEntries: QuitFeelingEntry[], tracks: QuitTrack[], habitId: string, minCount: number = ANALYSIS_MIN_TAG_COUNT): ApproachResult[] {
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
  return Array.from(byApproach.entries())
    .filter(([, g]) => g.total >= minCount)
    .map(([approach, g]) => ({ approach, passedCount: g.passed, totalCount: g.total }))
    .sort((a, b) => a.approach.localeCompare(b.approach));
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

  // The feelings noted when checking in, as counts in the zone order.
  const noted = feelingEntries.filter((e) => trackIds.has(e.trackId) && !e.isRelapseMoment && e.zone);
  if (confidenceFor(noted.length) !== 'facts') {
    const order: FeelingZone[] = ['lively', 'calm', 'tense', 'low', 'okay'];
    const mix = order.map((z) => [z, noted.filter((e) => e.zone === z).length] as const).filter(([, n]) => n > 0);
    candidates.push(`When you checked in (${noted.length}): ${mix.map(([z, n]) => `${zoneMeta(z).label} ${n}`).join(' · ')}.`);
  }

  if (candidates.length === 0) return undefined;
  return candidates[dayOfYear(today) % candidates.length];
}

export interface ResistedUrgeTrend {
  currentRatio: number | null; // resisted / (resisted + relapses) over the last 30 days
  previousRatio: number | null; // the 30 days before that
  direction: 'more' | 'fewer' | 'same' | null; // resisting more/fewer/same, comparing the two ratios
}

// How the ratio of resisted urges to relapses is changing — "resisting more
// often than last month," purely factual.
export function resistedUrgeTrend(feelingEntries: QuitFeelingEntry[], tracks: QuitTrack[], habitId: string, today: string, slips: QuitSlip[] = []): ResistedUrgeTrend {
  const trackIds = new Set(tracksForHabit(tracks, habitId).map((t) => t.id));
  // Urges ridden out against hard days (a slip marked, or an older chapter's
  // end), each on the phone's own calendar day.
  const resistedDays = feelingEntries.filter((e) => trackIds.has(e.trackId) && e.isResistedUrge).map((e) => localDateOf(e.createdAt));
  const hardDays = [...hardDayDates(tracks, slips, habitId)];
  const cutoff = addDaysISO(today, -30);
  const prevCutoff = addDaysISO(today, -60);
  const ratioIn = (from: string, to: string): number | null => {
    const resisted = resistedDays.filter((d) => d >= from && d < to).length;
    const hard = hardDays.filter((d) => d >= from && d < to).length;
    return resisted + hard > 0 ? resisted / (resisted + hard) : null;
  };
  const currentRatio = ratioIn(cutoff, addDaysISO(today, 1));
  const previousRatio = ratioIn(prevCutoff, cutoff);
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
  return daysBetweenISODates(start, date) + 1;
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
      const bucket = bucketForHour(new Date(c.completedAt ?? c.createdAt).getHours());
      const g = byBucket.get(bucket) ?? { minutes: 0, count: 0 };
      g.minutes += c.durationMinutes!;
      g.count += 1;
      byBucket.set(bucket, g);
    });
  const order: TimeOfDayBucket[] = ['before 9am', '9am–6pm', 'after 6pm'];
  return order
    .filter((b) => byBucket.has(b) && byBucket.get(b)!.count >= minCount)
    .map((bucket) => ({ bucket, averageMinutes: Math.round(byBucket.get(bucket)!.minutes / byBucket.get(bucket)!.count), count: byBucket.get(bucket)!.count }));
}

// The Session length card: the average for each time of day, in the order
// given (morning to evening). No "longest".
export function sessionLengthLines(stats: { bucket: string; averageMinutes: number; count: number }[]): { headline: string; evidence: string } | undefined {
  if (stats.length === 0) return undefined;
  const n = stats.reduce((s, t) => s + t.count, 0);
  const evidence = `Each number is the average length of the sessions started at that time. Based on ${n} timed sessions.`;
  if (stats.length === 1) return { headline: `Sessions ${stats[0].bucket}: ${stats[0].averageMinutes} min on average (${stats[0].count}).`, evidence };
  return { headline: `Average session length: ${stats.map((t) => `${t.bucket} ${t.averageMinutes} min (${t.count})`).join(' · ')}.`, evidence };
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
  hardDay: boolean; // a hard day (a slip) was marked, or an older chapter ended, on this date
}

// One entry per day across the whole journey, not just the current track —
// the day count climbs within each track and drops when a new one starts,
// so the whole journey's shape reads at a glance. Days between an archived
// track and the next one starting are simply absent (a gap, not a zero).
export function quitJourneySeries(tracks: QuitTrack[], feelingEntries: QuitFeelingEntry[], habitId: string, today: string, slips: QuitSlip[] = []): QuitJourneyDay[] {
  const ordered = [...tracksForHabit(tracks, habitId)].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (ordered.length === 0) return [];
  const trackIds = new Set(ordered.map((t) => t.id));
  const resistedByDate = new Map<string, number>();
  feelingEntries
    .filter((e) => trackIds.has(e.trackId) && e.isResistedUrge)
    .forEach((e) => {
      const d = localDateOf(e.createdAt); // the phone's day, not UTC's
      resistedByDate.set(d, (resistedByDate.get(d) ?? 0) + 1);
    });
  const hardDates = hardDayDates(ordered, slips, habitId);
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
      hardDay: hardDates.has(date),
    });
  });
  return days;
}

export type QuitLogEvent =
  | { kind: 'trackStart'; at: string; date: string; trackNumber: number }
  | { kind: 'trackEnd'; at: string; date: string; trackNumber: number; days: number; reflection?: string; reasonTags?: string[]; afterHardDay?: boolean }
  | { kind: 'hardDay'; at: string; date: string; trackNumber: number; reflection?: string; reasonTags?: string[] }
  | { kind: 'feeling'; at: string; date: string; trackNumber: number; entry: QuitFeelingEntry };

// Everything that ever happened on this habit's journey, newest first —
// every track starting and ending, every relapse, resisted urge, feeling and
// note — merged into one list instead of split per track.
export function quitJourneyLog(tracks: QuitTrack[], feelingEntries: QuitFeelingEntry[], habitId: string, slips: QuitSlip[] = []): QuitLogEvent[] {
  const ordered = [...tracksForHabit(tracks, habitId)].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const numberOf = new Map(ordered.map((t, i) => [t.id, i + 1]));
  const events: QuitLogEvent[] = [];
  ordered.forEach((t, i) => {
    events.push({ kind: 'trackStart', at: t.createdAt, date: t.startDate, trackNumber: i + 1 });
    if (t.status === 'archived' && t.endDate) {
      // Ended after a hard day marked on its own: that day says the rest.
      const marked = slips.some((s) => s.trackId === t.id && s.date === t.endDate);
      events.push({
        kind: 'trackEnd',
        afterHardDay: marked,
        at: `${t.endDate}T23:59:59`,
        date: t.endDate,
        trackNumber: i + 1,
        days: daysSinceTrackStart(t, t.endDate),
        reflection: marked ? undefined : t.relapseReflection,
        reasonTags: marked ? undefined : t.relapseReasonTags,
      });
    }
  });
  slips
    .filter((s) => numberOf.has(s.trackId))
    .forEach((s) => events.push({ kind: 'hardDay', at: s.createdAt, date: s.date, trackNumber: numberOf.get(s.trackId)!, reflection: s.reflection, reasonTags: s.reasonTags }));
  feelingEntries
    .filter((e) => numberOf.has(e.trackId))
    .forEach((e) => events.push({ kind: 'feeling', at: e.createdAt, date: localDateOf(e.createdAt), trackNumber: numberOf.get(e.trackId)!, entry: e }));
  return events.sort((a, b) => b.at.localeCompare(a.at));
}
