import { sessionFeelingZone, leastPracticedWeekday, minutesByTimeOfDay } from '../skillStats';
import type { PracticeSession, FeelingCheckIn } from '../../types/sections';

const SKILL_ID = 'skill-1';

function session(date: string, minutes: number, hour = 12): PracticeSession {
  return {
    id: `s-${date}-${Math.random()}`,
    skillId: SKILL_ID,
    date,
    minutes,
    hasVoiceMemo: false,
    createdAt: `${date}T${String(hour).padStart(2, '0')}:00:00`, // local time — see habitStats.test.ts's note
  };
}

function feelingCheckIn(date: string, zone: FeelingCheckIn['zone']): FeelingCheckIn {
  return {
    id: `f-${date}-${Math.random()}`,
    zone,
    feelingIds: ['okay-okay'],
    date,
    createdAt: `${date}T12:00:00Z`,
    source: { kind: 'skill', refId: SKILL_ID },
  };
}

describe('sessionFeelingZone', () => {
  it('finds the zone most associated with feelings logged after practicing this skill', () => {
    const entries = [feelingCheckIn('2026-09-01', 'lively'), feelingCheckIn('2026-09-02', 'lively'), feelingCheckIn('2026-09-03', 'calm')];
    expect(sessionFeelingZone(entries, SKILL_ID)).toEqual({ zone: 'lively', count: 2, total: 3 });
  });

  it('ignores feelings logged against a different skill', () => {
    const entries: FeelingCheckIn[] = [
      { id: 'a', zone: 'calm', feelingIds: ['okay-okay'], date: '2026-09-01', createdAt: '2026-09-01T12:00:00Z', source: { kind: 'skill', refId: 'other-skill' } },
    ];
    expect(sessionFeelingZone(entries, SKILL_ID)).toBeUndefined();
  });
});

describe('leastPracticedWeekday', () => {
  it('names a weekday with a real gap below the other days once there is enough spread', () => {
    // Mondays: 2026-09-07, 14, 21, 28 — zero sessions logged
    // every other weekday gets 2 sessions across the same 4 weeks
    const sessions: PracticeSession[] = [];
    const dates = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'];
    dates.forEach((d) => {
      sessions.push(session(d, 20));
      sessions.push(session(d, 20));
    });
    const result = leastPracticedWeekday(sessions, SKILL_ID);
    expect(result?.weekday).toBe('Monday');
    expect(result?.count).toBe(0);
  });

  it('stays undefined without enough sessions to judge a real gap', () => {
    const sessions = [session('2026-09-01', 20), session('2026-09-02', 20)];
    expect(leastPracticedWeekday(sessions, SKILL_ID)).toBeUndefined();
  });
});

describe('minutesByTimeOfDay', () => {
  it('reports average minutes per time-of-day bucket once each clears the minimum', () => {
    const sessions = [
      session('2026-09-01', 10, 8),
      session('2026-09-02', 20, 9),
      session('2026-09-03', 30, 9),
      session('2026-09-04', 60, 20),
      session('2026-09-05', 60, 21),
      session('2026-09-06', 60, 22),
    ];
    const stats = minutesByTimeOfDay(sessions, SKILL_ID);
    expect(stats.find((s) => s.bucket === 'morning')).toEqual({ bucket: 'morning', averageMinutes: 20, count: 3 });
    expect(stats.find((s) => s.bucket === 'evening')).toEqual({ bucket: 'evening', averageMinutes: 60, count: 3 });
  });
});
