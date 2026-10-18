// Habits, Part A: time of day without an invented winner, the done/missed
// pattern over the whole period, the two-color milestone bar, and the log
// detail page's edits reaching everything else.
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import type { Habit, HabitCheckIn, QuitFeelingEntry, QuitTrack } from '../../types/sections';
import { completionTime, habitTimeOfDay, quitTiming, MIN_ATTEMPTS, MIN_GAP } from '../habitTimeOfDay';
import { buildDayStatuses, milestoneBar, patternRange, quitDayStatuses, weeklyCompletion } from '../habitPattern';
import { useHabitsStore, habitStreak } from '../../store/useHabitsStore';
import { completionRate } from '../habitFrequency';

const fs = require('fs') as { readFileSync: (p: string, e: string) => string };
const path = require('path') as { join: (...p: string[]) => string };
const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');

const H = 'habit-a';
let n = 0;
// A check-in on `date`, completed at a local hour (New York, as these tests run).
const ci = (date: string, done: boolean, opts: { hour?: number; planned?: string; minimum?: boolean; nextDayHour?: number } = {}): HabitCheckIn => {
  const [y, m, d] = date.split('-').map(Number);
  const at = opts.nextDayHour !== undefined ? new Date(y, m - 1, d + 1, opts.nextDayHour, 0) : new Date(y, m - 1, d, opts.hour ?? 9, 0);
  return {
    id: `c${++n}`,
    habitId: H,
    date,
    done,
    createdAt: at.toISOString(),
    ...(done ? { completedAt: at.toISOString() } : {}),
    ...(opts.planned ? { plannedTime: opts.planned } : {}),
    ...(opts.minimum ? { minimum: true } : {}),
  };
};
const days = (count: number, from = '2026-09-01') =>
  Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(2026, 8, 1 + i));
    return d.toISOString().slice(0, 10);
  }).map((x) => (from === '2026-09-01' ? x : x));

describe('A1. Time of day', () => {
  const BANNED = /\bbetter than\b|\bworse\b|\bcauses?\b|\bmakes you\b|\bbecause of\b/i;

  test('equal rates: no winner, said positively', () => {
    const list = [
      ...days(10).map((d, i) => ci(d, i !== 0, { planned: '08:00' })), // 9 of 10 mornings
      ...days(10).map((d, i) => ci(d, i !== 0, { planned: '19:00' })), // 9 of 10 evenings
    ].map((c, i) => ({ ...c, date: `2026-09-${String(1 + i).padStart(2, '0')}` }));
    const r = habitTimeOfDay(list, H);
    expect(r.kind).toBe('rates');
    if (r.kind !== 'rates') return;
    expect(r.clearer).toBe(false);
    expect(r.lines.join(' ')).toMatch(/You complete this well in the morning \(90%\) and in the evening \(90%\)\. Both times work for you\./);
    for (const l of r.lines) expect(l).not.toMatch(/seem to work better|BANNED/);
  });

  test(`a clear difference (at least ${MIN_GAP} points, ${MIN_ATTEMPTS}+ each): counts shown, wording correlational`, () => {
    const morning = Array.from({ length: 20 }, (_, i) => ci(`2026-0${i < 10 ? 7 : 8}-${String((i % 10) + 1).padStart(2, '0')}`, i < 18, { planned: '07:30' }));
    const evening = Array.from({ length: 20 }, (_, i) => ci(`2026-0${i < 10 ? 7 : 8}-${String((i % 10) + 11).padStart(2, '0')}`, i < 11, { planned: '20:00' }));
    const r = habitTimeOfDay([...morning, ...evening], H);
    expect(r.kind === 'rates' && r.clearer).toBe(true);
    expect(r.kind !== 'notEnough' && r.lines).toEqual(['Mornings: 90% done (18 of 20). Evenings: 55% done (11 of 20).', 'Mornings seem to work better for this habit.']);
  });

  test('a small difference is not ranked', () => {
    const a = Array.from({ length: 10 }, (_, i) => ci(`2026-07-${String(i + 1).padStart(2, '0')}`, i < 8, { planned: '08:00' })); // 80%
    const b = Array.from({ length: 10 }, (_, i) => ci(`2026-08-${String(i + 1).padStart(2, '0')}`, i < 7, { planned: '13:00' })); // 70%
    const r = habitTimeOfDay([...a, ...b], H);
    expect(r.kind === 'rates' && !r.clearer).toBe(true);
    expect(r.kind !== 'notEnough' && r.lines.join(' ')).not.toMatch(/better/);
  });

  test('tiny samples: no comparison', () => {
    const list = [...Array.from({ length: 4 }, (_, i) => ci(`2026-07-${String(i + 1).padStart(2, '0')}`, true, { planned: '08:00' })), ...Array.from({ length: 4 }, (_, i) => ci(`2026-08-${String(i + 1).padStart(2, '0')}`, false, { planned: '20:00' }))];
    const r = habitTimeOfDay(list, H);
    expect(r.kind).not.toBe('rates');
  });

  test('one empty bucket: only that time, no ranking', () => {
    const list = Array.from({ length: 6 }, (_, i) => ci(`2026-07-${String(i + 1).padStart(2, '0')}`, i < 5, { planned: '08:00' }));
    const r = habitTimeOfDay(list, H);
    expect(r.kind === 'rates' && r.lines).toEqual(['Planned in the morning, you\'ve done it 5 of 6 times (83%).']);
  });

  test('no planned time: when it\'s usually done, no rates, no "better", and a hint', () => {
    const list = [...Array.from({ length: 4 }, (_, i) => ci(`2026-07-${String(i + 1).padStart(2, '0')}`, true, { hour: 7 })), ci('2026-07-10', true, { hour: 19 }), ci('2026-07-11', false, { hour: 22 })];
    const r = habitTimeOfDay(list, H);
    expect(r.kind).toBe('whenDone');
    const text = r.kind === 'whenDone' ? r.lines.join(' ') : '';
    expect(text).toBe('When you complete it: in the morning 4, in the evening 1. Add a planned time (the cue reminder) to see which time works best.');
    expect(text).not.toMatch(/%|better/);
  });

  test('too few known times: not enough yet', () => {
    expect(habitTimeOfDay([ci('2026-07-01', true)], H)).toEqual({ kind: 'notEnough', n: 1, needed: 5 });
  });

  test('a late-night completion belongs to its day; a day filled in later has no time', () => {
    expect(completionTime(ci('2026-07-01', true, { nextDayHour: 0 }))?.getHours()).toBe(0); // 00:00 the next morning: night, still that day
    const backfilled = { ...ci('2026-07-01', true), completedAt: new Date(2026, 6, 5, 10).toISOString() };
    expect(completionTime(backfilled)).toBeUndefined();
    expect(completionTime(ci('2026-07-01', false))).toBeUndefined();
  });

  test('a time zone change: the local time on the day is what counts', () => {
    // Completed while travelling: 03:30 UTC on the 5th is 23:30 the 4th in New York.
    const c: HabitCheckIn = { id: 'tz', habitId: H, date: '2026-10-04', done: true, createdAt: '2026-10-05T03:30:00Z', completedAt: '2026-10-05T03:30:00Z' };
    expect(completionTime(c)?.getHours()).toBe(23);
  });

  test('Quit: when urges come, as counts; "tend to" only when one time clearly holds most', () => {
    const tracks: QuitTrack[] = [{ id: 't', quitHabitId: 'q', startDate: '2026-09-01', createdAt: '', status: 'active' }];
    const urge = (hour: number, i: number): QuitFeelingEntry => ({ id: `u${i}`, trackId: 't', feelingId: 'x', zone: 'tense', isRelapseMoment: false, isResistedUrge: true, createdAt: new Date(2026, 8, 2 + i, hour).toISOString() });
    expect(quitTiming([20, 8, 13].map(urge), tracks, 'q')!.lines).toEqual(['Urges logged: in the morning 1, in the afternoon 1, in the evening 1.']);
    expect(quitTiming([18, 19, 20, 18, 19, 8].map(urge), tracks, 'q')!.lines).toEqual(['Urges tend to come in the evening (5 of 6).']);
    expect(quitTiming([], tracks, 'q')).toBeUndefined();
  });

  test('no line ever says "better than", "worse" or anything causal', () => {
    // The strings people read, not the comments explaining the rule.
    const src = read('src/utils/habitTimeOfDay.ts')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    for (const s of src.match(/`[^`]*`|'[^']*'/g) ?? []) expect(s).not.toMatch(BANNED);
  });
});

describe('A2. Done/missed pattern', () => {
  const habit: Pick<Habit, 'id' | 'createdAt' | 'frequency'> = { id: H, createdAt: '2026-10-01', frequency: { kind: 'daily' } };

  test.each([
    ['2026-10-20', 31],
    ['2026-02-10', 28],
    ['2028-02-10', 29],
    ['2026-04-10', 30],
  ])('a month around %s covers all %i days (25, 27, 29 and the last day included)', (today, count) => {
    const r = patternRange('month', today, '2026-01-01');
    const list = buildDayStatuses({ ...habit, createdAt: '2026-01-01' }, [], r.start, r.end, today);
    expect(list).toHaveLength(count);
    const dates = list.map((d) => d.date);
    for (const day of ['25', '27', String(count)]) expect(dates).toContain(`${today.slice(0, 8)}${day}`);
    if (count >= 29) expect(dates).toContain(`${today.slice(0, 8)}29`);
  });

  test('each day: done, minimum, missed, no check-in, before the start, not yet', () => {
    const checks = [ci('2026-10-01', true), ci('2026-10-02', true, { minimum: true }), ci('2026-10-03', false)];
    const s = buildDayStatuses(habit, checks, '2026-09-29', '2026-10-06', '2026-10-05');
    expect(s.map((d) => d.status)).toEqual(['before', 'before', 'done', 'minimum', 'missed', 'none', 'none', 'future']);
  });

  test('weekdays-only habits mark the days off', () => {
    const s = buildDayStatuses({ ...habit, frequency: { kind: 'weekdays', days: [1, 3, 5] } }, [], '2026-10-05', '2026-10-11', '2026-10-11');
    expect(s.map((d) => d.status)).toEqual(['none', 'off', 'none', 'off', 'none', 'off', 'off']);
  });

  test('weekly completion counts minimum-version days as done', () => {
    const checks = [ci('2026-10-05', true), ci('2026-10-06', true, { minimum: true }), ci('2026-10-07', false)];
    const w = weeklyCompletion({ ...habit, createdAt: '2026-10-05' }, checks, '2026-10-05', '2026-10-11', '2026-10-11');
    expect(w.find((x) => x.weekStart <= '2026-10-05' && x.done === 2)?.rate).toBeGreaterThan(0);
  });

  test('Quit: a slip is one day; the days before it stay clean (no reset), then "between tries"', () => {
    const tracks: QuitTrack[] = [
      { id: 't1', quitHabitId: 'q', startDate: '2026-10-01', createdAt: '', endDate: '2026-10-04', status: 'archived' },
      { id: 't2', quitHabitId: 'q', startDate: '2026-10-07', createdAt: '', status: 'active' },
    ];
    const resisted: QuitFeelingEntry = { id: 'r', trackId: 't2', feelingId: 'x', zone: 'tense', isRelapseMoment: false, isResistedUrge: true, createdAt: new Date(2026, 9, 8, 21).toISOString() };
    const s = quitDayStatuses('q', tracks, [resisted], '2026-09-30', '2026-10-10', '2026-10-09');
    expect(s.map((d) => d.status)).toEqual(['before', 'clean', 'clean', 'clean', 'slip', 'between', 'between', 'clean', 'resisted', 'clean', 'future']);
  });

  test('the habit graph has no pleasantness or energy, and no alarming red', () => {
    const src = read('src/screens/BuildHabitAnalysis.tsx');
    expect(src).not.toMatch(/Pleasantness|'energy'|Feeling overlay|overlay/);
    for (const f of ['src/screens/BuildHabitAnalysis.tsx', 'src/screens/QuitHabitAnalysis.tsx', 'src/screens/HabitBuilderScreen.tsx', 'src/screens/habits/HabitPattern.tsx']) {
      expect(read(f)).not.toMatch(/#B3413A/i);
    }
    expect(read('src/screens/HabitBuilderScreen.tsx')).not.toMatch(/don't break the chain/i);
  });
});

describe('A3. Milestone bar', () => {
  const h = (createdAt: string, targetDays = 30) => ({ createdAt, targetDays });

  test('the first day: Day 1 reached (a small celebration), the bar at the start', () => {
    const b = milestoneBar(h('2026-10-10'), '2026-10-10');
    expect(b.day).toBe(1);
    expect(b.progress).toBe(0);
    expect(b.markers[0]).toMatchObject({ label: 'Day 1', reached: true, justReached: true });
    expect(b.next).toEqual({ label: '1 week', daysLeft: 6 });
  });

  test('between two milestones, the bar shows where you are', () => {
    const b = milestoneBar(h('2026-10-01'), '2026-10-05'); // day 5 of 30
    expect(b.next).toEqual({ label: '1 week', daysLeft: 2 });
    expect(b.progress).toBeCloseTo(4 / 29);
    expect(b.markers.map((m) => m.label)).toEqual(['Day 1', '1 week', '2 weeks', '3 weeks', '1 month']);
  });

  test('it never moves back: it measures days since the start, not the streak', () => {
    const before = milestoneBar(h('2026-10-01'), '2026-10-12');
    // Missed days, a paused streak or a resumed one don't enter into it at all.
    expect(milestoneBar(h('2026-10-01'), '2026-10-12')).toEqual(before);
    expect(milestoneBar(h('2026-10-01'), '2026-10-13').progress).toBeGreaterThan(before.progress);
  });

  test('target reached: no "next", full bar; a long target keeps the bar readable', () => {
    expect(milestoneBar(h('2026-09-01'), '2026-10-12')).toMatchObject({ progress: 1, next: undefined });
    expect(milestoneBar(h('2026-01-01', 365), '2026-10-12').markers.length).toBeLessThanOrEqual(7);
    expect(milestoneBar(h('2026-10-20'), '2026-10-12')).toMatchObject({ progress: 0, day: 0 });
  });

  test('two colors only (filled and the line color); amber only for a milestone reached today', () => {
    const src = read('src/screens/habits/HabitPattern.tsx');
    const view = src.slice(src.indexOf('export function MilestoneBarView'), src.indexOf('const CELL'));
    expect(view).toMatch(/m\.justReached \? colors\.amber : color/);
    expect(view).not.toMatch(/Day \{m\.day\}|formatDisplayDate\(m\.date\)/); // the old day counts and dates are gone
  });
});

describe('A4. The log detail page', () => {
  beforeEach(() => {
    useHabitsStore.setState({
      habits: [{ id: H, name: 'Read', targetDays: 30, createdAt: '2026-10-01', reminderEnabled: true, reminderTime: '20:00', reminderNotificationIds: [], frequency: { kind: 'daily' }, minimumVersion: 'One page' }],
      checkIns: [],
    });
  });
  const s = () => useHabitsStore.getState();

  test('checking in records the planned time, when it was done, and the minimum version', () => {
    s().setCheckIn(H, '2026-10-05', true, 'Two chapters', undefined, undefined, undefined, true);
    const c = s().checkIns[0];
    expect(c).toMatchObject({ done: true, minimum: true, plannedTime: '20:00', note: 'Two chapters' });
    expect(c.completedAt).toBeDefined();
    s().setCheckIn(H, '2026-10-05', false);
    expect(s().checkIns[0].minimum).toBeUndefined();
    expect(s().checkIns[0].completedAt).toBeUndefined();
  });

  test('edits and deletes on the page update the streak, rate, pattern and analysis at once', () => {
    for (const d of ['2026-10-01', '2026-10-02', '2026-10-03']) s().setCheckIn(H, d, true);
    const today = '2026-10-03';
    expect(habitStreak(s().checkIns, H, today, { kind: 'daily' }).current).toBe(3);
    const middle = s().checkIns.find((c) => c.date === '2026-10-02')!;
    s().updateCheckIn(middle.id, { done: false });
    expect(habitStreak(s().checkIns, H, today, { kind: 'daily' }).current).toBe(1);
    expect(completionRate(s().checkIns, H, { kind: 'daily' }, '2026-10-01', today)).toBe(67);
    expect(buildDayStatuses({ id: H, createdAt: '2026-10-01', frequency: { kind: 'daily' } }, s().checkIns, '2026-10-01', today, today).map((d) => d.status)).toEqual(['done', 'missed', 'done']);
    s().updateCheckIn(middle.id, { done: true, minimum: true, note: '  one page  ' });
    expect(s().checkIns.find((c) => c.id === middle.id)).toMatchObject({ done: true, minimum: true, note: 'one page' });
    const removed = s().deleteCheckIn(middle.id)!;
    expect(habitStreak(s().checkIns, H, today, { kind: 'daily' }).current).toBe(1);
    s().restoreCheckIn(removed);
    expect(habitStreak(s().checkIns, H, today, { kind: 'daily' }).current).toBe(3);
  });

  test('the page asks before deleting, offers undo, and guards unsaved comment edits', () => {
    const src = read('src/screens/habits/HabitLogDetail.tsx');
    expect(src).toMatch(/title: 'Delete this day\?'/);
    expect(src).toMatch(/actionLabel: 'Undo', onAction: \(\) => useHabitsStore\.getState\(\)\.restoreCheckIn\(removed\)/);
    expect(src).toMatch(/setGuard\(dirty \? \{ dirty, save \} : null\)/);
    const screen = read('src/screens/HabitBuilderScreen.tsx');
    expect(screen).toMatch(/useBackHandler\(\{ stepBack: stack\.length > 1 \? stepBack : undefined, dirty: !!guard\?\.dirty, onSave: \(\) => guard\?\.save\(\) \}\)/);
    // Coming back to the logs lands at the same place.
    expect(screen).toMatch(/saved\.current\[stack\.length\] = scrollY\.current/);
  });

  test('logs with a comment show an indicator, and every log opens its page', () => {
    const src = read('src/screens/BuildHabitAnalysis.tsx');
    expect(src).toMatch(/c\.note \? <Ionicons name="chatbubble-ellipses-outline"/);
    expect(src).toMatch(/onPress=\{\(\) => onOpenLog\(c\.date\)\}/);
  });
});
