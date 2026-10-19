// Stage 2: real store actions at the edges of a day, with the clock set
// (never the real date). IDs match docs/test-cases/date-time.md.
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));

import { useClock, restoreClock, resetAll, makeHabit, makeCheckIn, DST_2026 } from '../../test-utils';
import { todayISO, setCalendarWeekStart } from '../date';
import { useFeelingsStore } from '../../store/useFeelingsStore';
import { useHabitsStore, daysElapsed } from '../../store/useHabitsStore';
import { useDailyPlanningStore } from '../../store/useDailyPlanningStore';
import { useQuitHabitsStore, daysSinceTrackStart } from '../../store/useQuitHabitsStore';
import { carryOver } from '../dayView';
import { frequencyStreak } from '../habitFrequency';
import { completionTime } from '../habitTimeOfDay';
import { milestoneBar } from '../habitPattern';

beforeEach(async () => {
  await resetAll();
});
afterEach(() => {
  restoreClock();
  setCalendarWeekStart(1);
});

describe('DATE-E: logging at the edges of a day', () => {
  test('DATE-E-001 a feeling logged at 23:59 belongs to that day; one at 00:00 to the next', () => {
    const clock = useClock('2026-10-18T23:59');
    useFeelingsStore.getState().addEntry('calm', [], undefined, undefined);
    clock.advance(60_000);
    useFeelingsStore.getState().addEntry('tense', [], undefined, undefined);
    expect(useFeelingsStore.getState().entries.map((e) => [e.zone, e.date])).toEqual([
      ['calm', '2026-10-18'],
      ['tense', '2026-10-19'],
    ]);
  });

  test('DATE-E-002 a habit ticked off at 00:30 for "yesterday" keeps yesterday as its day, and counts for it', () => {
    useClock('2026-10-19T00:30');
    const h = useHabitsStore.getState().addHabit({ name: 'Read', targetDays: 30 } as never);
    useHabitsStore.getState().setCheckIn(h, '2026-10-18', true);
    const c = useHabitsStore.getState().checkIns[0];
    expect(c.date).toBe('2026-10-18');
    expect(completionTime(c)?.getHours()).toBe(0); // late-night: still yesterday's
    expect(frequencyStreak(useHabitsStore.getState().checkIns, h, undefined, '2026-10-19').current).toBe(1);
  });

  test('DATE-E-003 a task finished at 23:59 is done on its day; after midnight it isn\'t carried over', () => {
    const clock = useClock('2026-10-18T23:59');
    const id = useDailyPlanningStore.getState().addTask(todayISO(), 'Finish it')!;
    useDailyPlanningStore.getState().toggleTask(id, '2026-10-18');
    clock.advance(2 * 60_000);
    expect(todayISO()).toBe('2026-10-19');
    const done = (t: { completedDates: string[]; done: boolean; date: string }, d: string) => t.done && t.date === d;
    expect(carryOver(useDailyPlanningStore.getState().tasks, todayISO(), done as never)).toEqual([]);
  });

  test('DATE-E-004 an unfinished task from yesterday shows as "still open" once the day changes', () => {
    const clock = useClock('2026-10-18T22:00');
    useDailyPlanningStore.getState().addTask(todayISO(), 'Left open');
    clock.set('2026-10-19T00:05');
    const open = carryOver(useDailyPlanningStore.getState().tasks, todayISO(), ((t: { done: boolean }) => t.done) as never);
    expect(open.map((t) => t.title)).toEqual(['Left open']);
  });
});

describe('DATE-E: day counts and the clock', () => {
  test('DATE-E-010 a habit\'s day number goes up by one at midnight, DST night included', () => {
    const habit = makeHabit({ createdAt: '2026-03-01' });
    const clock = useClock('2026-03-07T23:59');
    const before = daysElapsed(habit, todayISO());
    clock.set(`${DST_2026.start}T00:01`);
    expect(daysElapsed(habit, todayISO())).toBe(before + 1);
    clock.set('2026-03-09T00:01'); // first full day after the change
    expect(daysElapsed(habit, todayISO())).toBe(before + 2);
  });

  test('DATE-E-011 a Quit track\'s day count and the autumn change (a 25-hour day)', () => {
    useClock(`${DST_2026.end}T23:30`);
    const t = { id: 't', quitHabitId: 'q', startDate: '2026-10-25', createdAt: '', status: 'active' } as const;
    expect(daysSinceTrackStart(t, todayISO())).toBe(8);
  });

  test('DATE-E-012 the milestone bar\'s day matches the habit\'s day number', () => {
    const habit = makeHabit({ createdAt: '2026-02-20', targetDays: 66 });
    for (const today of ['2026-03-07', DST_2026.start, '2026-03-09', '2026-04-20']) expect(milestoneBar(habit, today).day).toBe(daysElapsed(habit, today));
  });

  test('DATE-E-013 a backfilled past day counts for its own date, not today', () => {
    useClock('2026-10-18T10:00');
    const h = useHabitsStore.getState().addHabit({ name: 'Walk', targetDays: 30 } as never);
    for (const d of ['2026-10-15', '2026-10-16', '2026-10-17']) useHabitsStore.getState().setCheckIn(h, d, true);
    expect(useHabitsStore.getState().checkIns.map((c) => c.date).sort()).toEqual(['2026-10-15', '2026-10-16', '2026-10-17']);
    expect(frequencyStreak(useHabitsStore.getState().checkIns, h, undefined, '2026-10-18').current).toBe(3);
  });
});

describe('DATE-E: week start Sunday vs Monday', () => {
  // "3 times a week": done Sat, Sun, Mon, Tue. With Monday weeks that's
  // 2 + 2 (neither week met); with Sunday weeks, 1 + 3 (this week met).
  const days = ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20'];
  const list = days.map((date) => makeCheckIn({ habitId: 'h', date }));
  const freq = { kind: 'perWeek', count: 3 } as const;

  test('DATE-E-020 Monday weeks', () => {
    setCalendarWeekStart(1);
    expect(frequencyStreak(list, 'h', freq, '2026-10-20').current).toBe(0);
  });

  test('DATE-E-021 Sunday weeks', () => {
    setCalendarWeekStart(0);
    expect(frequencyStreak(list, 'h', freq, '2026-10-20').current).toBe(1);
  });
});

describe('DATE-E: year boundary and leap day', () => {
  test('DATE-E-030 a daily habit streak runs through New Year and through 29 February', () => {
    const run = (start: string, n: number) => Array.from({ length: n }, (_, i) => makeCheckIn({ habitId: 'h', date: new Date(Date.UTC(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8) + i)).toISOString().slice(0, 10) }));
    expect(frequencyStreak(run('2026-12-29', 6), 'h', undefined, '2027-01-03').current).toBe(6);
    expect(frequencyStreak(run('2028-02-27', 4), 'h', undefined, '2028-03-01').current).toBe(4);
  });

  test('DATE-E-031 a Quit track started on 29 February counts normally into March', () => {
    expect(daysSinceTrackStart({ id: 't', quitHabitId: 'q', startDate: '2028-02-29', createdAt: '', status: 'active' }, '2028-03-01')).toBe(2);
    expect(useQuitHabitsStore).toBeDefined();
  });
});
