import type { FeelingCheckIn, FeelingZone } from '../types/sections';
import { safeguardFeelingIds, reasonTagOptions, zoneMeta, findFeeling } from '../data/feelingsWheel';
import { addDaysISO, addMonthsISO, daysBetweenISODates, getMonthGrid, weekdayOfISO } from './date';

// Calendar days from a to b (the same rule as date.ts).
export function daysBetweenISO(a: string, b: string): number {
  return daysBetweenISODates(a, b);
}

// Consecutive days (ending today or yesterday) with at least one check-in.
export function checkInStreak(entries: FeelingCheckIn[], today: string): number {
  const days = new Set(entries.map((e) => e.date));
  let cursor = days.has(today) ? today : addDaysISO(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDaysISO(cursor, -1);
  }
  return streak;
}

// The extended safeguard: specific heavy words (Numb, Helpless, Miserable,
// Depressed, Flat, Drained, Unmotivated) recurring on most days over about
// two weeks — never a whole zone, since e.g. Tense also holds much milder
// words like Restless. "Most days" = at least 8 of the last 14.
export function hasSustainedSafeguardPattern(entries: FeelingCheckIn[], today: string, windowDays = 14, minDays = 8): boolean {
  const sinceDate = addDaysISO(today, -(windowDays - 1));
  const daysWithSafeguardWord = new Set(
    entries.filter((e) => e.date >= sinceDate && e.feelingIds.some((id) => safeguardFeelingIds.includes(id))).map((e) => e.date)
  );
  return daysWithSafeguardWord.size >= minDays;
}

export function zoneCounts(entries: FeelingCheckIn[]): Record<FeelingZone, number> {
  const counts: Record<FeelingZone, number> = { lively: 0, calm: 0, tense: 0, low: 0, okay: 0 };
  entries.forEach((e) => {
    counts[e.zone] += 1;
  });
  return counts;
}

// --- Patterns tab helpers ---

export interface ZoneStat {
  zone: FeelingZone;
  count: number;
}

// The zone with the most check-ins in a set of entries (a day, week, month...).
export function mostCommonZone(entries: FeelingCheckIn[]): ZoneStat | undefined {
  const counts = zoneCounts(entries);
  const sorted = (Object.entries(counts) as [FeelingZone, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  return sorted.length > 0 ? { zone: sorted[0][0], count: sorted[0][1] } : undefined;
}

// Every distinct zone logged on a given date — 1 entry normally, 2 if the day
// had check-ins in different zones (used for the Patterns chart's split
// cells; a single check-in with 2 blended feelings is still one zone, so
// that case never splits — only two different check-ins on the same day do).
export function zonesOnDate(entries: FeelingCheckIn[], date: string): FeelingZone[] {
  const zones = new Set(entries.filter((e) => e.date === date).map((e) => e.zone));
  return Array.from(zones);
}

// The longest run of consecutive days that all included at least one
// check-in in the same zone — "Longest streak in one zone: 5 days (Tense)".
export function longestZoneStreak(entries: FeelingCheckIn[]): { zone: FeelingZone; days: number } | undefined {
  const datesByZone = new Map<FeelingZone, Set<string>>();
  entries.forEach((e) => {
    if (!datesByZone.has(e.zone)) datesByZone.set(e.zone, new Set());
    datesByZone.get(e.zone)!.add(e.date);
  });

  let best: { zone: FeelingZone; days: number } | undefined;
  for (const [zone, dates] of datesByZone) {
    const sortedDates = Array.from(dates).sort();
    let run = 1;
    let longest = 1;
    for (let i = 1; i < sortedDates.length; i++) {
      longest = Math.max(longest, (run = addDaysISO(sortedDates[i - 1], 1) === sortedDates[i] ? run + 1 : 1));
    }
    if (!best || longest > best.days) best = { zone, days: longest };
  }
  return best && best.days > 1 ? best : undefined;
}

// Compares two periods' zone counts and names the zone that shifted the most
// — "more Lively days" / "fewer Tense days" than the period before.
export function compareZonePeriods(
  current: FeelingCheckIn[],
  previous: FeelingCheckIn[]
): { zone: FeelingZone; direction: 'more' | 'fewer' } | undefined {
  const a = zoneCounts(current);
  const b = zoneCounts(previous);
  const deltas = (Object.keys(a) as FeelingZone[]).map((zone) => ({ zone, delta: a[zone] - b[zone] }));
  const biggest = deltas.reduce((max, d) => (Math.abs(d.delta) > Math.abs(max.delta) ? d : max), deltas[0]);
  if (!biggest || biggest.delta === 0) return undefined;
  return { zone: biggest.zone, direction: biggest.delta > 0 ? 'more' : 'fewer' };
}

export interface ReasonStat {
  tag: string;
  count: number;
}

// "Tagged alongside," never "caused by" — ranked counts of the reason-tag
// chips across a set of entries, optionally narrowed to one zone or feeling.
export function topReasonTags(entries: FeelingCheckIn[], opts?: { zone?: FeelingZone; feelingId?: string }, limit = 5): ReasonStat[] {
  const filtered = entries.filter(
    (e) => (!opts?.zone || e.zone === opts.zone) && (!opts?.feelingId || e.feelingIds.includes(opts.feelingId))
  );
  const counts = new Map<string, number>();
  filtered.forEach((e) => (e.reasonTags ?? []).forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function isReasonTag(value: string): value is (typeof reasonTagOptions)[number] {
  return (reasonTagOptions as readonly string[]).includes(value);
}

export interface FeelingReasonGroup {
  feelingId: string;
  total: number; // check-ins with this feeling in the period, tagged or not
  lastDate: string;
  reasons: ReasonStat[]; // this feeling's own reason tags, most-used first
}

// The full "every word, every reason" breakdown for the Patterns tab —
// unlike topReasonTags (a flat, truncated ranking), this groups by feeling
// word first so every word the user logged shows up, each with its own
// reason tags underneath (both counts, never "caused by").
export function reasonBreakdownByFeeling(entries: FeelingCheckIn[]): FeelingReasonGroup[] {
  const byFeeling = new Map<string, { total: number; lastDate: string; reasonCounts: Map<string, number> }>();
  entries.forEach((e) => {
    e.feelingIds.forEach((feelingId) => {
      if (!byFeeling.has(feelingId)) byFeeling.set(feelingId, { total: 0, lastDate: e.date, reasonCounts: new Map() });
      const group = byFeeling.get(feelingId)!;
      group.total += 1;
      if (e.date > group.lastDate) group.lastDate = e.date;
      (e.reasonTags ?? []).forEach((tag) => group.reasonCounts.set(tag, (group.reasonCounts.get(tag) ?? 0) + 1));
    });
  });
  return Array.from(byFeeling.entries()).map(([feelingId, group]) => ({
    feelingId,
    total: group.total,
    lastDate: group.lastDate,
    reasons: Array.from(group.reasonCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count),
  }));
}

// --- Trend line chart (v3, extended in v4) ---

export type TrendDimension = 'pleasantness' | 'energy';

// Two scores per zone, one per dimension of the circumplex the zone system
// is built on — how good it feels, and how much energy it carries. Both are
// on the same -2..2 scale so the graph reads consistently either way.
export const zoneScore: Record<FeelingZone, number> = { lively: 2, calm: 1, okay: 0, tense: -1, low: -2 };
export const energyScore: Record<FeelingZone, number> = { lively: 2, tense: 1, okay: 0, calm: -1, low: -2 };

function scoreMapFor(dimension: TrendDimension): Record<FeelingZone, number> {
  return dimension === 'energy' ? energyScore : zoneScore;
}

// Colors a point by the zone whose score is closest to it, on whichever
// dimension is currently graphed — used when a point's score is itself an
// average across zones (a day with more than one check-in), so the dot
// still reads as a real zone rather than an in-between hue.
export function nearestZoneForScore(score: number, dimension: TrendDimension = 'pleasantness'): FeelingZone {
  const map = scoreMapFor(dimension);
  let best: FeelingZone = 'okay';
  let bestDiff = Infinity;
  (Object.keys(map) as FeelingZone[]).forEach((zone) => {
    const diff = Math.abs(map[zone] - score);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = zone;
    }
  });
  return best;
}

export interface TrendPoint {
  key: string; // stable id for the point (a date, or a year-month)
  date: string; // the ISO date to open when tapped (a day, or the 1st of a month)
  score: number;
  zone: FeelingZone;
}

// One point per day that has at least one check-in (days with none are
// skipped, leaving a gap in the line rather than a false flat value).
export function dailyTrendPoints(entries: FeelingCheckIn[], dates: string[], dimension: TrendDimension = 'pleasantness'): TrendPoint[] {
  const map = scoreMapFor(dimension);
  const points: TrendPoint[] = [];
  dates.forEach((date) => {
    const dayEntries = entries.filter((e) => e.date === date);
    if (dayEntries.length === 0) return;
    const score = dayEntries.reduce((sum, e) => sum + map[e.zone], 0) / dayEntries.length;
    points.push({ key: date, date, score, zone: nearestZoneForScore(score, dimension) });
  });
  return points;
}

// One averaged point per month across a year, for the Year view.
export function monthlyTrendPoints(entries: FeelingCheckIn[], year: string, dimension: TrendDimension = 'pleasantness'): TrendPoint[] {
  const map = scoreMapFor(dimension);
  const points: TrendPoint[] = [];
  for (let m = 0; m < 12; m++) {
    const monthKey = `${year}-${String(m + 1).padStart(2, '0')}`;
    const monthEntries = entries.filter((e) => e.date.slice(0, 7) === monthKey);
    if (monthEntries.length === 0) continue;
    const score = monthEntries.reduce((sum, e) => sum + map[e.zone], 0) / monthEntries.length;
    points.push({ key: monthKey, date: `${monthKey}-01`, score, zone: nearestZoneForScore(score, dimension) });
  }
  return points;
}

// One averaged point per month across an arbitrary month range (inclusive,
// "YYYY-MM" keys) — the Year view is really the special case start=Jan,
// end=Dec of one year; this generalizes it for zooming out across years or
// for a long Custom range.
export function monthlyTrendPointsInRange(
  entries: FeelingCheckIn[],
  startMonth: string,
  endMonth: string,
  dimension: TrendDimension = 'pleasantness'
): TrendPoint[] {
  const map = scoreMapFor(dimension);
  const points: TrendPoint[] = [];
  let cursor = `${startMonth}-01`;
  const end = `${endMonth}-01`;
  while (cursor <= end) {
    const monthKey = cursor.slice(0, 7);
    const monthEntries = entries.filter((e) => e.date.slice(0, 7) === monthKey);
    if (monthEntries.length > 0) {
      const score = monthEntries.reduce((sum, e) => sum + map[e.zone], 0) / monthEntries.length;
      points.push({ key: monthKey, date: `${monthKey}-01`, score, zone: nearestZoneForScore(score, dimension) });
    }
    cursor = addMonthsISO(cursor, 1);
  }
  return points;
}

// Every date from start to end inclusive — the daily granularity used by a
// Custom range (and, at short enough spans, by pinch-zooming into a Week or
// Month view).
export function datesInRange(start: string, end: string): string[] {
  const out: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    out.push(cursor);
    cursor = addDaysISO(cursor, 1);
  }
  return out;
}

export type PatternsView = 'week' | 'month' | 'year' | 'custom';
export interface PatternsRange {
  start: string;
  end: string;
  granularity: 'day' | 'month';
}

// The Patterns tab's date range for a given view — pulled out of the screen
// component so it's a pure function and can be unit tested directly (see
// feelingsStats.test.ts). `today` is passed in rather than read internally
// so a test can pin it to any date without touching the system clock.
//
// Month and Year always span the FULL calendar month/year (day 1 through
// the real last day, e.g. the 30th for September, Dec 31 for a year) —
// including days after today when viewing the current month/year. Those
// later days simply have no check-in yet and show as a gap; the axis
// itself never stops early. (An earlier fix attempt capped the end date at
// today for the current period — that turned out not to be the actual bug;
// see the domain-based x-axis positioning in MoodCheckScreen's TrendChart
// for the real fix, which is a rendering issue, not a date-range one.)
export function patternsNaturalRange(view: PatternsView, month: string, customRange: { start: string; end: string }, today: string): PatternsRange {
  const year = month.slice(0, 4);
  if (view === 'week') return { start: addDaysISO(today, -6), end: today, granularity: 'day' };
  if (view === 'month') {
    const days = getMonthGrid(month).filter((d): d is string => !!d);
    return { start: days[0], end: days[days.length - 1], granularity: 'day' };
  }
  if (view === 'year') {
    return { start: `${year}-01-01`, end: `${year}-12-31`, granularity: 'month' };
  }
  const span = daysBetweenISO(customRange.start, customRange.end);
  return { start: customRange.start, end: customRange.end, granularity: span <= 45 ? 'day' : 'month' };
}

// --- Recap periods ---
// Recap reads its date ranges from this same utility rather than doing its
// own date math. The one difference from Patterns is the Week view: Recap's
// week is the calendar week containing the anchor day, starting on the
// user's "week starts on" day (0 = Sunday, 1 = Monday, 6 = Saturday), so
// it lines up with how people talk about "this week".
export type RecapPeriod = 'today' | PatternsView;

export function weekStartFor(date: string, weekStartsOn: number): string {
  const weekday = weekdayOfISO(date);
  return addDaysISO(date, -((weekday - weekStartsOn + 7) % 7));
}

export function periodRange(
  period: RecapPeriod,
  anchor: string,
  customRange: { start: string; end: string },
  weekStartsOn: number
): PatternsRange {
  if (period === 'today') return { start: anchor, end: anchor, granularity: 'day' };
  if (period === 'week') {
    const start = weekStartFor(anchor, weekStartsOn);
    return { start, end: addDaysISO(start, 6), granularity: 'day' };
  }
  return patternsNaturalRange(period, anchor, customRange, anchor);
}

// The period just before `range`, of the same kind — for the neutral
// "+3 vs last week" comparison.
export function previousPeriodRange(period: RecapPeriod, range: PatternsRange, weekStartsOn: number): PatternsRange {
  if (period === 'today') return periodRange('today', addDaysISO(range.start, -1), range, weekStartsOn);
  if (period === 'week') return periodRange('week', addDaysISO(range.start, -7), range, weekStartsOn);
  if (period === 'month') return periodRange('month', addMonthsISO(range.start, -1), range, weekStartsOn);
  if (period === 'year') return periodRange('year', addMonthsISO(range.start, -12), range, weekStartsOn);
  const span = daysBetweenISO(range.start, range.end);
  const end = addDaysISO(range.start, -1);
  return patternsNaturalRange('custom', end, { start: addDaysISO(end, -span), end }, end);
}

// Moves the anchor one period back (-1) or forward (+1).
export function shiftPeriodAnchor(period: RecapPeriod, anchor: string, direction: -1 | 1): string {
  if (period === 'today') return addDaysISO(anchor, direction);
  if (period === 'week') return addDaysISO(anchor, 7 * direction);
  if (period === 'month') return addMonthsISO(anchor, direction);
  if (period === 'year') return addMonthsISO(anchor, 12 * direction);
  return anchor;
}

// A trailing rolling average over the existing points — smooths day-to-day
// noise without inventing values for days that had no check-in (the window
// only ever averages points that actually exist, so gaps don't skew it).
// Each smoothed point keeps its original date/key so taps and the tooltip
// still resolve to the real day; only score/zone change.
export function rollingAverageTrend(points: TrendPoint[], window: number, dimension: TrendDimension = 'pleasantness'): TrendPoint[] {
  if (window <= 1) return points;
  return points.map((p, i) => {
    const slice = points.slice(Math.max(0, i - window + 1), i + 1);
    const score = slice.reduce((sum, s) => sum + s.score, 0) / slice.length;
    return { ...p, score, zone: nearestZoneForScore(score, dimension) };
  });
}

// --- Trend chart x-axis domain (fixes the "graph stops early" bug) ---
//
// The chart's x position for a point must never be derived from "which
// index is this point in the array of points that happen to have data" —
// that stretches whatever points exist to fill the full width, so the last
// *logged* day always lands at the far-right edge regardless of its real
// date, making any gap (which is the normal case — nobody logs every single
// day) look exactly like the axis stopped early. Instead, every point's x
// position comes from its fixed position in the full period's day (or
// month) range, independent of how many other points exist.

// A point's fixed slot in the domain, e.g. day 29 of a month starting on
// day 1 is domain index 28 (0-based) regardless of what other days have data.
export function domainIndexForDate(rangeStart: string, date: string, granularity: 'day' | 'month'): number {
  return granularity === 'day' ? daysBetweenISO(rangeStart, date) : monthsBetweenISO(rangeStart, date);
}

// The number of slots in the domain — e.g. 30 for September regardless of
// how many days actually have a check-in.
export function domainSlotCount(start: string, end: string, granularity: 'day' | 'month'): number {
  return granularity === 'day' ? daysBetweenISO(start, end) + 1 : monthsBetweenISO(start, end) + 1;
}

export function monthsBetweenISO(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00`);
  const db = new Date(`${b}T00:00:00`);
  return (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth());
}

// One label per domain slot (not per data point), so the x-axis reflects
// the full period even where there's a gap in the data.
export function domainLabels(start: string, slotCount: number, granularity: 'day' | 'month'): string[] {
  const slotDates = Array.from({ length: slotCount }, (_, i) => (granularity === 'month' ? addMonthsISO(`${start.slice(0, 7)}-01`, i) : addDaysISO(start, i)));
  if (granularity === 'month') {
    return slotDates.map((d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short' }));
  }
  if (slotCount <= 7) {
    return slotDates.map((d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2));
  }
  const showEvery = slotCount <= 31 ? 5 : Math.ceil(slotCount / 8);
  return slotDates.map((d, i) => (i === 0 || i === slotCount - 1 || i % showEvery === 0 ? String(Number(d.slice(-2))) : ''));
}

// --- Analysis partition (v5): reason-tag insight, built on the same
// reasonTags data the Patterns tab's "top reasons" list already uses, but
// answering "what does this tag tend to mean for you" rather than "how
// often was it used." Everything here stays correlational — "associated
// with," never "causes" — and every ranking is gated by a minimum sample
// size so a single unusual day never reads as a pattern.

export const ANALYSIS_MIN_TAG_COUNT = 3;

// A flat minimum of 3 repeats, regardless of window length — Week, Month,
// Custom, and All. Three is enough to call something a pattern rather than
// a single unusual day, without being so high it's unreachable in a 7-day
// window.
export function analysisMinCount(_spanDays: number): number {
  return ANALYSIS_MIN_TAG_COUNT;
}

// On the Lively +2 ... Low -2 scale: below this, a tag's days are about the same as usual.
export const MIN_IMPACT_DELTA = 0.25;

export interface TagImpact {
  tag: string;
  count: number;
  avgScore: number;
  baselineScore: number;
  delta: number; // avgScore - baselineScore; sign shows the direction, magnitude the size
}

// Ranked by the SIZE of the shift from the user's own overall average, not
// by how often the tag was used — a rare tag with a real effect is more
// worth surfacing than a common one with none. Always the Pleasantness
// score specifically (Lively +2 ... Low -2), regardless of which dimension
// the Patterns graph happens to be showing, since "impact" is inherently a
// good/bad-days question.
export function tagImpactRanking(entries: FeelingCheckIn[], minCount: number = ANALYSIS_MIN_TAG_COUNT): TagImpact[] {
  if (entries.length === 0) return [];
  const baselineScore = entries.reduce((sum, e) => sum + zoneScore[e.zone], 0) / entries.length;
  const byTag = new Map<string, { sum: number; count: number }>();
  entries.forEach((e) => {
    (e.reasonTags ?? []).forEach((tag) => {
      const g = byTag.get(tag) ?? { sum: 0, count: 0 };
      g.sum += zoneScore[e.zone];
      g.count += 1;
      byTag.set(tag, g);
    });
  });
  return Array.from(byTag.entries())
    .filter(([, g]) => g.count >= minCount)
    .map(([tag, g]) => {
      const avgScore = g.sum / g.count;
      return { tag, count: g.count, avgScore, baselineScore, delta: avgScore - baselineScore };
    })
    // A tiny difference isn't worth ranking (or calling "higher").
    .filter((t) => Math.abs(t.delta) >= MIN_IMPACT_DELTA)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

// A short, honest, correlational sentence for one impact row — never
// "causes" or "makes you feel," and "noticeably" only once the shift is
// large enough to actually be worth calling out.
export function describeTagImpact(impact: TagImpact): string {
  const magnitude = Math.abs(impact.delta) >= 0.5 ? 'noticeably' : 'somewhat';
  const direction = impact.delta < 0 ? 'lower' : 'higher';
  return `${impact.tag} days average ${magnitude} ${direction} than your typical day.`;
}

export interface TagZoneDistribution {
  tag: string;
  count: number;
  percentages: Record<FeelingZone, number>;
}

// The zone mix behind one tag's average — a tag can average out to
// "neutral" while actually being a 50/50 split of two opposite zones, which
// a single number would hide entirely.
export function tagZoneDistribution(entries: FeelingCheckIn[], tag: string): TagZoneDistribution | undefined {
  const matches = entries.filter((e) => (e.reasonTags ?? []).includes(tag));
  if (matches.length === 0) return undefined;
  const counts = zoneCounts(matches);
  const percentages = Object.fromEntries(
    (Object.keys(counts) as FeelingZone[]).map((zone) => [zone, Math.round((counts[zone] / matches.length) * 100)])
  ) as Record<FeelingZone, number>;
  return { tag, count: matches.length, percentages };
}

export interface TagFeelingBreakdown {
  feeling: string; // display name, e.g. "Calm"
  count: number;
  percentage: number; // of tagged check-ins that included this specific feeling
  notes: string[]; // any one-line "why" notes left on a check-in that included this feeling, newest first
}

// The specific feeling words behind one tag, not just its broad zone — e.g.
// tagging "Work" might turn out to mean "Stressed" most of the time, but
// sometimes "Calm." A check-in can carry up to two blended feelings, so a
// single check-in can contribute to more than one row here; percentages are
// out of the number of tagged check-ins, not the number of feeling words.
// Notes are carried along too, since a short "why" is often the most useful
// part of the breakdown — the count says how often, the note says what it
// was actually about.
export function tagFeelingBreakdown(entries: FeelingCheckIn[], tag: string): TagFeelingBreakdown[] {
  const matches = entries
    .filter((e) => (e.reasonTags ?? []).includes(tag))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (matches.length === 0) return [];
  const counts = new Map<string, number>();
  const notes = new Map<string, string[]>();
  matches.forEach((e) => {
    const seen = new Set<string>(); // don't double-count if the same feeling somehow appears twice in one check-in
    e.feelingIds.forEach((id) => {
      const name = findFeeling(id)?.name;
      if (!name || seen.has(name)) return;
      seen.add(name);
      counts.set(name, (counts.get(name) ?? 0) + 1);
      if (e.note) {
        notes.set(name, [...(notes.get(name) ?? []), e.note]);
      }
    });
  });
  return Array.from(counts.entries())
    .map(([feeling, count]) => ({
      feeling,
      count,
      percentage: Math.round((count / matches.length) * 100),
      notes: notes.get(feeling) ?? [],
    }))
    .sort((a, b) => a.feeling.localeCompare(b.feeling)); // A to Z, not ranked
}

export interface TagPrimaryZone {
  tag: string;
  zone: FeelingZone;
  recentCount: number; // how many of the most recent `recentOf` tagged check-ins landed in `zone`
  recentOf: number;
}

// The single zone a tag is most associated with, plus a concrete, recent
// count to back it up ("Tense on 8 of the last 10 Work days") — a plain
// number reads as more honest than a bare percentage, and doesn't require
// dividing by a baseline that can be near zero.
export function tagPrimaryZone(entries: FeelingCheckIn[], tag: string, recentWindow = 10): TagPrimaryZone | undefined {
  const dist = tagZoneDistribution(entries, tag);
  if (!dist) return undefined;
  const zone = (Object.keys(dist.percentages) as FeelingZone[]).reduce((best, z) =>
    dist.percentages[z] > dist.percentages[best] ? z : best
  );
  const recent = entries
    .filter((e) => (e.reasonTags ?? []).includes(tag))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, recentWindow);
  const recentCount = recent.filter((e) => e.zone === zone).length;
  return { tag, zone, recentCount, recentOf: recent.length };
}

export interface TagTrend {
  tag: string;
  currentCount: number;
  previousCount: number;
  percentChange: number | null; // null when there's no previous-period baseline to compare against
  direction: 'more' | 'fewer' | 'same';
}

// How often a tag showed up this period vs. the equivalent previous one —
// factual only ("tagged 30% more often"), never framed as improvement or
// decline.
export function tagTrend(currentEntries: FeelingCheckIn[], previousEntries: FeelingCheckIn[], tag: string): TagTrend {
  const currentCount = currentEntries.filter((e) => (e.reasonTags ?? []).includes(tag)).length;
  const previousCount = previousEntries.filter((e) => (e.reasonTags ?? []).includes(tag)).length;
  const percentChange = previousCount > 0 ? Math.round(((currentCount - previousCount) / previousCount) * 100) : null;
  const direction = currentCount === previousCount ? 'same' : currentCount > previousCount ? 'more' : 'fewer';
  return { tag, currentCount, previousCount, percentChange, direction };
}

export interface TagCooccurrence {
  tagA: string;
  tagB: string;
  count: number;
  lift: number; // how much more often the pair appears together than chance alone would predict
}

// "Often tagged together" — a pair counts only once it clears both the
// minimum sample size and a real lift over chance (>1.3x), so two common
// tags that just both happen to be common don't get flagged as related.
export function tagCooccurrences(entries: FeelingCheckIn[], minCount: number = ANALYSIS_MIN_TAG_COUNT): TagCooccurrence[] {
  const tagCounts = new Map<string, number>();
  const pairCounts = new Map<string, number>();
  entries.forEach((e) => {
    const tags = Array.from(new Set(e.reasonTags ?? []));
    tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1));
    for (let i = 0; i < tags.length; i++) {
      for (let j = i + 1; j < tags.length; j++) {
        const key = [tags[i], tags[j]].sort().join('||');
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  });
  const n = entries.length || 1;
  const result: TagCooccurrence[] = [];
  pairCounts.forEach((count, key) => {
    if (count < minCount) return;
    const [tagA, tagB] = key.split('||');
    const pA = (tagCounts.get(tagA) ?? 0) / n;
    const pB = (tagCounts.get(tagB) ?? 0) / n;
    const pAB = count / n;
    const lift = pA > 0 && pB > 0 ? pAB / (pA * pB) : 0;
    if (lift > 1.3) result.push({ tagA, tagB, count, lift });
  });
  return result.sort((a, b) => b.lift - a.lift);
}

export interface FeelingRepeat {
  feelingId: string;
  count: number;
}

// Feelings landed on 2+ times within the window — the "I've landed on Lonely
// three times this month" pattern, computed from the real log, not a score.
export function topRepeatedFeelings(entries: FeelingCheckIn[], sinceDate: string, limit = 5): FeelingRepeat[] {
  const counts = new Map<string, number>();
  entries
    .filter((e) => e.date >= sinceDate)
    .forEach((e) => e.feelingIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1)));
  return Array.from(counts.entries())
    .map(([feelingId, count]) => ({ feelingId, count }))
    .filter((r) => r.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
