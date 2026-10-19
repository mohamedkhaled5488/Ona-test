// Regression: day counts across the spring daylight-saving change.
//
// Several counters subtracted two local midnights and rounded *down*. After the
// spring change a span is one hour short of whole days, so the count lost a
// day: a Quit track started on 1 March showed "Day 9" on 10 March, the habit's
// "Day N of 66" did the same, and daily/weekly rotations repeated a day. These
// run in America/New_York (DST on 8 March 2026).
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import { dayOfYear, addDaysISO } from '../date';
import { daysElapsed } from '../../store/useHabitsStore';
import { daysSinceTrackStart } from '../../store/useQuitHabitsStore';
import { quitHeaderStats } from '../habitStats';
import { weeklyResurfacedQuote } from '../../store/useReadingListStore';
import { DST_2026, makeHabit, makeTrack } from '../../test-utils';

describe('day counts across the spring DST change (HAB-DATE-001..004)', () => {
  test('a habit started before the change counts every day after it', () => {
    const habit = makeHabit({ createdAt: '2026-03-01' });
    expect(daysElapsed(habit, '2026-03-07')).toBe(7);
    expect(daysElapsed(habit, DST_2026.start)).toBe(8);
    expect(daysElapsed(habit, '2026-03-10')).toBe(10);
    expect(daysElapsed(habit, '2026-06-01')).toBe(93);
  });

  test('a Quit track started before the change: "Day 10" on the 10th, in the store and in Analysis', () => {
    const track = makeTrack({ id: 'tr', quitHabitId: 'q', startDate: '2026-03-01' });
    expect(daysSinceTrackStart(track, '2026-03-10')).toBe(10);
    expect(quitHeaderStats([track], [], 'q', '2026-03-10').currentDays).toBe(10);
  });

  test('a finished track spanning the change keeps its full length', () => {
    const track = makeTrack({ startDate: '2026-03-05', endDate: '2026-03-12', status: 'archived' });
    expect(daysSinceTrackStart(track, '2026-10-01')).toBe(8);
  });

  test('every date has its own day of the year (no repeats around DST)', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 365; i++) {
      const d = addDaysISO('2026-01-01', i);
      expect(dayOfYear(d)).toBe(i);
      seen.add(dayOfYear(d));
    }
    expect(seen.size).toBe(365);
  });

  test('the weekly quote changes exactly every 7 days all year, DST or not', () => {
    const quotes = Array.from({ length: 60 }, (_, i) => ({ id: `q${String(i).padStart(2, '0')}` }) as never);
    for (let i = 1; i < 365; i++) {
      const changed = weeklyResurfacedQuote(quotes, addDaysISO('2026-01-01', i)) !== weeklyResurfacedQuote(quotes, addDaysISO('2026-01-01', i - 1));
      expect({ day: i, changed }).toEqual({ day: i, changed: i % 7 === 0 });
    }
  });
});
