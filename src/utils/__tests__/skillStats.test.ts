import { minutesByTimeOfDay } from '../skillStats';
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
    expect(stats.map((s) => s.bucket)).toEqual(['morning', 'evening']); // the order of the day, not by length
  });
});
