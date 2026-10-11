import {
  isScheduledDay,
  frequencyLabel,
  frequencyStreak,
  expectedCompletions,
  completionRate,
  shouldResurfaceWhyFor,
  weekStart,
  nextScheduledDates,
} from '../habitFrequency';
import type { HabitCheckIn, HabitFrequency } from '../../types/sections';

const H = 'h1';
const done = (date: string, isDone = true): HabitCheckIn => ({ id: `${date}-${Math.random()}`, habitId: H, date, done: isDone, createdAt: `${date}T12:00:00` });

// 2026-09-28 is a Monday.
const MWF: HabitFrequency = { kind: 'weekdays', days: [1, 3, 5] };
const THREE_A_WEEK: HabitFrequency = { kind: 'perWeek', count: 3 };

describe('schedule basics', () => {
  it('weekdays only schedules the chosen days; daily and X-a-week leave every day open', () => {
    expect(isScheduledDay(MWF, '2026-09-28')).toBe(true); // Mon
    expect(isScheduledDay(MWF, '2026-09-29')).toBe(false); // Tue
    expect(isScheduledDay(undefined, '2026-09-29')).toBe(true);
    expect(isScheduledDay(THREE_A_WEEK, '2026-09-29')).toBe(true);
  });

  it('labels read naturally, Monday first', () => {
    expect(frequencyLabel(undefined)).toBe('Every day');
    expect(frequencyLabel({ kind: 'weekdays', days: [5, 1, 3] })).toBe('Mon, Wed, Fri');
    expect(frequencyLabel({ kind: 'weekdays', days: [0, 6] })).toBe('Sat, Sun');
    expect(frequencyLabel(THREE_A_WEEK)).toBe('3× a week');
  });

  it('weeks start on Monday', () => {
    expect(weekStart('2026-10-04')).toBe('2026-09-28'); // Sunday belongs to the week that began Monday
    expect(weekStart('2026-09-28')).toBe('2026-09-28');
  });
});

describe('frequencyStreak', () => {
  it('daily keeps the original behaviour', () => {
    const c = [done('2026-09-28'), done('2026-09-29'), done('2026-09-30')];
    expect(frequencyStreak(c, H, undefined, '2026-09-30')).toEqual({ current: 3, paused: false, unit: 'day' });
    expect(frequencyStreak(c, H, undefined, '2026-10-01')).toEqual({ current: 3, paused: true, unit: 'day' });
  });

  it('weekdays: off-schedule days never break or pause the streak', () => {
    // Mon, Wed, Fri done; today is Saturday (off-schedule)
    const c = [done('2026-09-28'), done('2026-09-30'), done('2026-10-02')];
    expect(frequencyStreak(c, H, MWF, '2026-10-03')).toEqual({ current: 3, paused: false, unit: 'day' });
  });

  it('weekdays: a missed scheduled day ends the run', () => {
    const c = [done('2026-09-28'), done('2026-10-02')]; // Wed 09-30 not done
    expect(frequencyStreak(c, H, MWF, '2026-10-02').current).toBe(1);
  });

  it('weekdays: pauses once the next scheduled day arrives undone', () => {
    const c = [done('2026-09-28'), done('2026-09-30'), done('2026-10-02')];
    expect(frequencyStreak(c, H, MWF, '2026-10-05').paused).toBe(true); // Monday came, not done yet
  });

  it('weekdays: a bonus Done on an off day does not add to the count', () => {
    const c = [done('2026-09-28'), done('2026-09-29'), done('2026-09-30')]; // Tue is a bonus
    expect(frequencyStreak(c, H, MWF, '2026-09-30').current).toBe(2);
  });

  it('X a week: counts consecutive weeks that hit the target; the current week is in progress, not a miss', () => {
    const c = [
      // week of 09-14: 3 ✓
      done('2026-09-14'), done('2026-09-16'), done('2026-09-18'),
      // week of 09-21: 3 ✓
      done('2026-09-21'), done('2026-09-22'), done('2026-09-25'),
      // week of 09-28 (current): 1 so far
      done('2026-09-29'),
    ];
    expect(frequencyStreak(c, H, THREE_A_WEEK, '2026-09-30')).toEqual({ current: 2, paused: false, unit: 'week' });
  });

  it('X a week: the current week counts once it hits the target', () => {
    const c = [done('2026-09-21'), done('2026-09-22'), done('2026-09-25'), done('2026-09-28'), done('2026-09-29'), done('2026-09-30')];
    expect(frequencyStreak(c, H, THREE_A_WEEK, '2026-09-30')).toEqual({ current: 2, paused: false, unit: 'week' });
  });

  it('X a week: pauses after a whole finished week falls short', () => {
    const c = [done('2026-09-14'), done('2026-09-15'), done('2026-09-16')]; // met two weeks ago, last week 0
    expect(frequencyStreak(c, H, THREE_A_WEEK, '2026-09-30')).toEqual({ current: 1, paused: true, unit: 'week' });
  });
});

describe('rates', () => {
  it('expected completions follow the schedule', () => {
    expect(expectedCompletions(undefined, '2026-09-28', '2026-10-04')).toBe(7);
    expect(expectedCompletions(MWF, '2026-09-28', '2026-10-04')).toBe(3);
    expect(expectedCompletions(THREE_A_WEEK, '2026-09-28', '2026-10-04')).toBe(3);
  });

  it('a weekdays habit done on every scheduled day is 100%, not 43%', () => {
    const c = [done('2026-09-28'), done('2026-09-30'), done('2026-10-02')];
    expect(completionRate(c, H, MWF, '2026-09-28', '2026-10-04')).toBe(100);
    expect(completionRate(c, H, undefined, '2026-09-28', '2026-10-04')).toBe(43); // same check-ins, judged daily
  });

  it('doing it more often than planned caps at 100%', () => {
    const c = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'].map((d) => done(d));
    expect(completionRate(c, H, THREE_A_WEEK, '2026-09-28', '2026-10-04')).toBe(100);
  });

  it('is null when nothing was planned in the range', () => {
    expect(completionRate([], H, MWF, '2026-09-29', '2026-09-29')).toBeNull(); // a lone Tuesday
  });
});

describe('shouldResurfaceWhyFor', () => {
  it('weekdays: looks at the last two scheduled days, not the last two calendar days', () => {
    // Today Sat 10-03; last two scheduled days are Wed 09-30 and Fri 10-02
    expect(shouldResurfaceWhyFor([], H, MWF, '2026-10-03')).toBe(true);
    expect(shouldResurfaceWhyFor([done('2026-10-02')], H, MWF, '2026-10-03')).toBe(false);
  });

  it('X a week: only when there are no longer enough days left to reach the target', () => {
    // Fri 10-02 with 1 done this week: 2 needed, 3 days left (Fri, Sat, Sun) — still on track
    expect(shouldResurfaceWhyFor([done('2026-09-29')], H, THREE_A_WEEK, '2026-10-02')).toBe(false);
    // Sat 10-03 with 1 done: 2 needed, 2 days left — behind pace
    expect(shouldResurfaceWhyFor([done('2026-09-29')], H, THREE_A_WEEK, '2026-10-03')).toBe(true);
  });
});

describe('nextScheduledDates', () => {
  it('returns the next date for each chosen weekday, including today', () => {
    expect(nextScheduledDates(MWF, '2026-09-30').sort()).toEqual(['2026-09-30', '2026-10-02', '2026-10-05']);
  });
});
