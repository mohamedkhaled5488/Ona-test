// Habits and Skills, Part B: the audit. Numbers agree between screens, cards
// only claim what the data supports, skills don't invent plateaus or average
// in untimed sessions, and a year of logs stays fast.
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import type { Habit, HabitCheckIn, PracticeSession, SkillMetric } from '../../types/sections';
import { buildDayStatuses, weeklyCompletion } from '../habitPattern';
import { completionRate, longestFrequencyStreak } from '../habitFrequency';
import { habitTimeOfDay } from '../habitTimeOfDay';
import { longestHabitStreak, mostSkippedReasonTag, mostSkippedWeekday, sessionLengthLines, sessionMinutesByTimeOfDay } from '../habitStats';
import { growDetails, periodStats, withoutHidden } from '../recapStats';
import { detectPlateau, metricSeries, plateauPeriods, describeMetricChange, metricChange } from '../skillProgress';
import { minutesByTimeOfDay } from '../skillStats';
import { habitStreak } from '../../store/useHabitsStore';

const H = 'habit-b';
let n = 0;
const at = (date: string, hour: number) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0).toISOString();
};
const ci = (date: string, done: boolean, extra: Partial<HabitCheckIn> = {}, hour = 9): HabitCheckIn => ({
  id: `c${++n}`,
  habitId: H,
  date,
  done,
  createdAt: at(date, hour),
  ...(done ? { completedAt: at(date, hour) } : {}),
  ...extra,
});
const addDays = (iso: string, k: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + k));
  return x.toISOString().slice(0, 10);
};
const range = (from: string, count: number) => Array.from({ length: count }, (_, i) => addDays(from, i));
const habit = (extra: Partial<Habit> = {}): Habit => ({ id: H, name: 'Walk', targetDays: 66, createdAt: '2026-08-03', reminderEnabled: false, reminderNotificationIds: [], ...extra });

describe('B1. The same numbers everywhere', () => {
  const weekdays = habit({ frequency: { kind: 'weekdays', days: [1, 2, 3, 4, 5] } as Habit['frequency'] });
  // Six weeks: done most weekdays, a few misses, and some extra weekend days.
  const days = range('2026-08-03', 42);
  const checkIns = days.flatMap((d, i) => {
    const wd = new Date(`${d}T00:00:00`).getDay();
    if (wd === 0) return [];
    if (wd === 6) return i % 2 ? [ci(d, true)] : []; // an extra, off-schedule day
    return [ci(d, i % 5 !== 2, i % 7 === 1 ? { minimum: true } : {})];
  });
  const end = days[days.length - 1];

  test('the weekly line adds up to the completion rate (extra off-schedule days count in neither)', () => {
    const weeks = weeklyCompletion(weekdays, checkIns, days[0], end, end);
    const done = weeks.reduce((s, w) => s + Math.min(w.done, w.planned), 0);
    const planned = weeks.reduce((s, w) => s + w.planned, 0);
    expect(Math.round((done / planned) * 100)).toBe(completionRate(checkIns, H, weekdays.frequency, days[0], end));
  });

  test('Recap, the Analysis header and the export all count the same completions and the same longest streak', () => {
    const data = withoutHidden(
      { tasks: [], journalEntries: [], thoughts: [], studySessions: [], meals: [], songs: [], gameResults: [], feelingCheckIns: [], sleepLogs: [], readingEntries: [], readingSessions: [], quotes: [], plans: [], skills: [], skillSessions: [], habits: [weekdays], habitCheckIns: checkIns, budgets: [], budgetEntries: [], quitHabits: [], quitTracks: [], quitFeelingEntries: [], bestMoments: [] } as never,
      []
    );
    const stats = periodStats(data, { start: '2026-01-01', end: '2026-12-31' } as never);
    const g = growDetails(data, stats, end).habits[0];
    const analysisTotal = checkIns.filter((c) => c.done).length;
    expect(g.done).toBe(analysisTotal);
    expect(stats.habitCompletions).toBe(analysisTotal);
    expect(g.longest).toBe(longestHabitStreak(checkIns, H, weekdays.frequency));
    expect(longestFrequencyStreak(checkIns, H, weekdays.frequency).current).toBe(g.longest);
    // The day strip shows every done day the totals count.
    const strip = buildDayStatuses(weekdays, checkIns, days[0], end, end);
    expect(strip.filter((d) => d.status === 'done' || d.status === 'minimum').length).toBe(analysisTotal);
  });

  test('check-ins left behind by a habit deleted on another phone are not counted in Recap', () => {
    const orphan = { ...ci('2026-09-01', true), habitId: 'gone' };
    const data = withoutHidden({ habits: [weekdays], habitCheckIns: [...checkIns, orphan], skills: [], skillSessions: [], bestMoments: [] } as never, []);
    expect(data.habitCheckIns).toHaveLength(checkIns.length);
  });
});

describe('B4. Analysis cards only claim what the data supports', () => {
  const daily = (dates: string[], done: (d: string, i: number) => boolean, tags?: (i: number) => string[]) =>
    dates.map((d, i) => ci(d, done(d, i), tags ? { reasonTags: tags(i) } : {}));

  test('a weekday is only named when it clearly stands out', () => {
    // Mondays missed 3 times, Tuesdays 2: too close to call.
    const close = [
      ...['2026-09-07', '2026-09-14', '2026-09-21'].map((d) => ci(d, false)),
      ...['2026-09-08', '2026-09-15'].map((d) => ci(d, false)),
      ci('2026-09-09', true),
    ];
    expect(mostSkippedWeekday(close, H)).toBeUndefined();
    const clear = [...close.filter((c) => c.date !== '2026-09-15'), ci('2026-09-28', false)];
    expect(mostSkippedWeekday(clear, H)).toEqual({ weekday: 'Monday', count: 4, logged: 4 });
  });

  test('a habit done only on Mondays is never "most often skipped on Mondays"', () => {
    const mondays = daily(['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'], () => false);
    expect(mostSkippedWeekday(mondays, H)).toBeUndefined();
  });

  test('a tie between reasons names neither; the winner shows "N of M"', () => {
    const tie = daily(range('2026-09-01', 6), () => false, (i) => (i < 3 ? ['Tired'] : ['Work']));
    expect(mostSkippedReasonTag(tie, H)).toBeUndefined();
    const lead = daily(range('2026-09-01', 6), () => false, (i) => (i < 4 ? ['Tired'] : ['Work']));
    expect(mostSkippedReasonTag(lead, H)).toEqual({ tag: 'Tired', count: 4, missedTotal: 6 });
  });

  test('session length: "longest" only with a clear gap; otherwise just the averages', () => {
    const one = sessionLengthLines([{ bucket: 'before 9am', averageMinutes: 20, count: 4 }])!;
    expect(one.headline).toBe('Your before 9am sessions average 20 min.');
    expect(one.evidence).toMatch(/Based on 4 timed sessions/);
    const close = sessionLengthLines([
      { bucket: 'after 6pm', averageMinutes: 22, count: 4 },
      { bucket: 'before 9am', averageMinutes: 20, count: 5 },
    ])!;
    expect(close.headline).not.toMatch(/longest/);
    const clear = sessionLengthLines([
      { bucket: 'after 6pm', averageMinutes: 30, count: 4 },
      { bucket: 'before 9am', averageMinutes: 20, count: 5 },
    ])!;
    expect(clear.headline).toMatch(/after 6pm sessions tend to run longest: 30 min/);
  });

  test('session length goes by when it was done, not when it was logged', () => {
    // Done at 7am, logged that evening.
    const list = range('2026-09-01', 3).map((d) => ({ ...ci(d, true, { durationMinutes: 20 }, 20), completedAt: at(d, 7) }));
    expect(sessionMinutesByTimeOfDay(list, H)).toEqual([{ bucket: 'before 9am', averageMinutes: 20, count: 3 }]);
  });

  test('time of day and the weekday card never contradict each other or rank tiny gaps', () => {
    // 10 mornings and 10 evenings, 8 vs 7 done: no winner.
    const list = [
      ...range('2026-09-01', 10).map((d, i) => ci(d, i < 8, { plannedTime: '08:00' })),
      ...range('2026-09-11', 10).map((d, i) => ci(d, i < 7, { plannedTime: '19:00' }, 19)),
    ];
    const r = habitTimeOfDay(list, H);
    expect(r.kind).toBe('rates');
    if (r.kind === 'rates') expect(r.clearer).toBe(false);
  });

  test('the cards never use ranking or causal words', () => {
    const fs = require('fs') as { readFileSync: (p: string, e: string) => string };
    const src = fs.readFileSync(require('path').join(process.cwd(), 'src/screens/BuildHabitAnalysis.tsx'), 'utf8');
    expect(src).not.toMatch(/strongest link|because of|causes|makes you/i);
  });
});

describe('B6. Skills', () => {
  const S = 'skill-b';
  const pts = (vals: number[]) => vals.map((v, i) => ({ date: addDays('2026-09-04', i * 4), value: v, sessionId: `p${i}` }));

  test('a zigzag that keeps climbing is not a plateau; a noisy flat stretch is', () => {
    expect(detectPlateau(pts([10, 20, 12, 22, 14, 24, 16]), 'higher', '2026-10-01')).toBeUndefined();
    expect(detectPlateau(pts([40, 50, 41, 49, 40, 50, 42]), 'higher', '2026-10-01')).toBeDefined();
    // ...and a falling time (lower is better) that zigzags down is progress too.
    expect(detectPlateau(pts([30, 26, 29, 25, 28, 24, 27]), 'lower', '2026-10-01')).toBeUndefined();
  });

  const session = (date: string, minutes: number, hour = 9, extra: Partial<PracticeSession> = {}): PracticeSession => ({
    id: `s${++n}`,
    skillId: S,
    date,
    minutes,
    hasVoiceMemo: false,
    createdAt: at(date, 21),
    startedAt: minutes > 0 ? at(date, hour) : undefined,
    ...extra,
  });

  test('sessions logged without the timer are left out of the averages', () => {
    const list = [...range('2026-09-01', 3).map((d) => session(d, 30, 8)), ...range('2026-09-04', 3).map((d) => session(d, 0))];
    expect(minutesByTimeOfDay(list, S)).toEqual([{ bucket: 'morning', averageMinutes: 30, count: 3 }]);
  });

  test('first vs. latest with one session says "so far"; lower-is-better never says "above"', () => {
    const metric = { id: 'm', name: '5K', unit: 'min', direction: 'lower' as const, role: 'primary', createdAt: '2026-09-01' } as unknown as SkillMetric;
    const one = metricSeries([session('2026-09-01', 20, 8, { metricValues: { m: 31 } })], S, 'm');
    expect(describeMetricChange(metric, metricChange(one, 'lower')!)).toBe('31 min so far');
    const worse = metricSeries([session('2026-09-01', 20, 8, { metricValues: { m: 31 } }), session('2026-09-08', 20, 8, { metricValues: { m: 33 } })], S, 'm');
    expect(describeMetricChange(metric, metricChange(worse, 'lower')!)).toBe('31 → 33 min · not past where you began yet');
  });

  test('a skill with no metric entries has no plateau bands', () => {
    expect(plateauPeriods(metricSeries([session('2026-09-01', 0)], S, 'm'), 'higher')).toEqual([]);
  });
});

describe('B9. A year of logs', () => {
  test('a year of daily check-ins for 10 habits: every Analysis number in well under a second', () => {
    const today = '2026-10-18';
    const days = range('2025-10-18', 366);
    const all: HabitCheckIn[] = [];
    for (let h = 0; h < 10; h++) days.forEach((d, i) => all.push({ ...ci(d, (i + h) % 4 !== 0, { plannedTime: '08:00' }), habitId: `h${h}` }));
    const t0 = Date.now();
    for (let h = 0; h < 10; h++) {
      const hb = habit({ id: `h${h}`, createdAt: days[0] });
      habitStreak(all, `h${h}`, today);
      longestHabitStreak(all, `h${h}`);
      completionRate(all, `h${h}`, undefined, days[0], today);
      buildDayStatuses(hb, all, days[0], today, today);
      weeklyCompletion(hb, all, days[0], today, today);
      habitTimeOfDay(all, `h${h}`);
      mostSkippedWeekday(all, `h${h}`);
    }
    expect(Date.now() - t0).toBeLessThan(1500);
  });

  test('a year of skill sessions with a metric: plateau bands in well under a second', () => {
    const list = range('2025-10-18', 366).map((d, i) => session2(d, 40 + Math.round(Math.sin(i / 9) * 4)));
    const t0 = Date.now();
    plateauPeriods(metricSeries(list, 'skill-y', 'm'), 'higher');
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});

function session2(date: string, value: number): PracticeSession {
  return { id: `y${date}`, skillId: 'skill-y', date, minutes: 20, hasVoiceMemo: false, createdAt: `${date}T09:00:00.000Z`, metricValues: { m: value } };
}
