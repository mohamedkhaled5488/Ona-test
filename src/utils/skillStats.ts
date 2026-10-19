// Analysis partition logic for Skills — same honesty rules as Feelings
// Analysis (feelingsStats.ts): correlational only, gated by a minimum
// sample size, never diagnostic.
import type { PracticeSession } from '../types/sections';
import { ANALYSIS_MIN_TAG_COUNT } from './feelingsStats';

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

// The average session length for each time of day — each bucket only
// reported once it clears the minimum sample.
export function minutesByTimeOfDay(sessions: PracticeSession[], skillId: string, minCount: number = ANALYSIS_MIN_TAG_COUNT): TimeOfDayMinutesStat[] {
  const byBucket = new Map<TimeOfDayBucket, { minutes: number; count: number }>();
  sessions
    // Sessions logged without the timer have 0 minutes: leave them out, or
    // they'd drag the average down. Bucketed by when the session started.
    .filter((s) => s.skillId === skillId && s.minutes > 0)
    .forEach((s) => {
      const bucket = bucketForHour(new Date(s.startedAt ?? s.createdAt).getHours());
      const g = byBucket.get(bucket) ?? { minutes: 0, count: 0 };
      g.minutes += s.minutes;
      g.count += 1;
      byBucket.set(bucket, g);
    });
  // Morning to evening, never sorted by length.
  const order: TimeOfDayBucket[] = ['morning', 'afternoon', 'evening'];
  return order
    .filter((b) => byBucket.has(b) && byBucket.get(b)!.count >= minCount)
    .map((bucket) => ({ bucket, averageMinutes: Math.round(byBucket.get(bucket)!.minutes / byBucket.get(bucket)!.count), count: byBucket.get(bucket)!.count }));
}
