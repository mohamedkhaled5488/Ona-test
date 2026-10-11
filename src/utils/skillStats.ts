// Analysis partition logic for Skills — same honesty rules as Feelings
// Analysis (feelingsStats.ts): correlational only, gated by a minimum
// sample size, never diagnostic.
import type { PracticeSession, FeelingCheckIn } from '../types/sections';
import { ANALYSIS_MIN_TAG_COUNT, mostCommonZone } from './feelingsStats';

// Which feeling most often follows a practice session for this skill — only
// looks at feelings logged against this specific skill (via
// FeelingCheckIn.source).
export function sessionFeelingZone(feelingEntries: FeelingCheckIn[], skillId: string, minCount: number = ANALYSIS_MIN_TAG_COUNT) {
  const matches = feelingEntries.filter((e) => e.source?.kind === 'skill' && e.source.refId === skillId);
  if (matches.length < minCount) return undefined;
  const stat = mostCommonZone(matches);
  return stat ? { zone: stat.zone, count: stat.count, total: matches.length } : undefined;
}

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface LeastPracticedWeekdayStat {
  weekday: string;
  count: number;
  averageOtherDays: number;
}

// The weekday with noticeably fewer logged sessions than the others — a
// proxy for "tends not to get practiced" since skills have no fixed
// schedule to compare against, only a pure distribution of when sessions
// actually happened.
export function leastPracticedWeekday(sessions: PracticeSession[], skillId: string, minCount: number = ANALYSIS_MIN_TAG_COUNT): LeastPracticedWeekdayStat | undefined {
  const matches = sessions.filter((s) => s.skillId === skillId);
  if (matches.length < minCount * 3) return undefined; // need real spread across days before calling one "least"
  const counts = new Array(7).fill(0);
  matches.forEach((s) => counts[new Date(`${s.date}T00:00:00`).getDay()] += 1);
  const min = Math.min(...counts);
  const minDay = counts.indexOf(min);
  const others = counts.filter((_, i) => i !== minDay);
  const averageOtherDays = others.reduce((a, b) => a + b, 0) / others.length;
  if (averageOtherDays <= 0 || min >= averageOtherDays * 0.5) return undefined; // not a real gap
  return { weekday: WEEKDAY_LABELS[minDay], count: min, averageOtherDays: Math.round(averageOtherDays * 10) / 10 };
}

export type TimeOfDayBucket = 'morning' | 'afternoon' | 'evening';

function bucketForHour(hour: number): TimeOfDayBucket {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

export interface TimeOfDayMinutesStat {
  bucket: TimeOfDayBucket;
  averageMinutes: number;
  count: number;
}

// Whether sessions logged at a certain time of day run longer than others —
// each bucket only reported once it clears the minimum sample.
export function minutesByTimeOfDay(sessions: PracticeSession[], skillId: string, minCount: number = ANALYSIS_MIN_TAG_COUNT): TimeOfDayMinutesStat[] {
  const byBucket = new Map<TimeOfDayBucket, { minutes: number; count: number }>();
  sessions
    .filter((s) => s.skillId === skillId)
    .forEach((s) => {
      const bucket = bucketForHour(new Date(s.createdAt).getHours());
      const g = byBucket.get(bucket) ?? { minutes: 0, count: 0 };
      g.minutes += s.minutes;
      g.count += 1;
      byBucket.set(bucket, g);
    });
  return Array.from(byBucket.entries())
    .filter(([, g]) => g.count >= minCount)
    .map(([bucket, g]) => ({ bucket, averageMinutes: Math.round(g.minutes / g.count), count: g.count }))
    .sort((a, b) => b.averageMinutes - a.averageMinutes);
}
