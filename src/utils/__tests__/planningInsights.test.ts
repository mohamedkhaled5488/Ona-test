// Daily Planning v2, stage 5: Insights and the weekly review. Ranges that
// always cover the whole period (a past bug), the minimum of 5 data points,
// correct counts, the estimate maths, and wording that's correlational only.
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

const fs = require('fs') as { readFileSync: (p: string, e: string) => string };
const path = require('path') as { join: (...p: string[]) => string };

import type { DailyTask, FeelingCheckIn, FeelingZone, TaskTag } from '../../types/sections';
import { normalizeTask } from '../taskMigration';
import {
  MIN_POINTS,
  buckets,
  completionInsight,
  energyInsight,
  estimateInsight,
  feelGoodInsight,
  feelingsInsight,
  granularityFor,
  insightRange,
  movedOften,
  occurrences,
  overloadInsight,
  planningDays,
  planningStreak,
  previousRange,
  tagInsight,
  weeklyReview,
} from '../planningInsights';
import { addDaysISO, daysInMonthISO } from '../date';

const doneOn = (t: DailyTask, d: string) => (t.repeat === 'none' ? t.done : t.completedDates.includes(d));
const T = (over: Partial<DailyTask> & { id: string }) => normalizeTask({ title: over.id, repeat: 'none', ...over });
const study: TaskTag = { id: 'study', name: 'Study', color: '#000', createdAt: '' };
const home: TaskTag = { id: 'home', name: 'Home', color: '#000', createdAt: '' };
const R = { start: '2026-10-01', end: '2026-10-31' };

// n one-off tasks on consecutive days from `start`; `doneEvery`: 1 = all done.
function many(n: number, start: string, over: Partial<DailyTask> = {}, doneIf: (i: number) => boolean = () => true): DailyTask[] {
  return Array.from({ length: n }, (_, i) => {
    const date = addDaysISO(start, i);
    const done = doneIf(i);
    return T({ id: `${over.title ?? 't'}-${start}-${i}`, date, done, ...(done ? { completedAt: { [date]: `${date}T09:30:00` } } : {}), ...over });
  });
}

describe('ranges always cover the whole period', () => {
  test.each([
    ['2026-02-10', 28],
    ['2028-02-10', 29],
    ['2026-04-10', 30],
    ['2026-10-10', 31],
  ])('the month of %s has all %i days, empty ones included', (today, n) => {
    const r = insightRange('month', today, 1);
    const bs = buckets(r, granularityFor(r), 1);
    expect(bs).toHaveLength(n);
    expect(bs[0].start).toBe(`${today.slice(0, 7)}-01`);
    expect(bs[bs.length - 1].end).toBe(`${today.slice(0, 7)}-${n}`);
    for (const day of ['25', '27', '29', '30', '31']) {
      if (Number(day) <= daysInMonthISO(today)) expect(bs.map((b) => b.key)).toContain(`${today.slice(0, 7)}-${day}`);
    }
    // A month with no tasks at all still charts every day, at zero.
    const c = completionInsight([], bs);
    expect(c.series).toHaveLength(n);
    expect(c.series.every((s) => s.planned === 0)).toBe(true);
  });

  test('3 months is grouped by week, and the weeks still reach both ends', () => {
    const r = insightRange('quarter', '2026-10-11', 1);
    expect(r).toEqual({ start: '2026-08-01', end: '2026-10-31' });
    expect(granularityFor(r)).toBe('week');
    const bs = buckets(r, 'week', 1);
    expect(bs[0].start).toBe('2026-08-01');
    expect(bs[bs.length - 1].end).toBe('2026-10-31');
    // No gaps, no overlaps.
    for (let i = 1; i < bs.length; i++) expect(bs[i].start).toBe(addDaysISO(bs[i - 1].end, 1));
  });

  test('week, custom (even picked backwards) and the period before', () => {
    expect(insightRange('week', '2026-10-11', 1)).toEqual({ start: '2026-10-05', end: '2026-10-11' });
    expect(insightRange('week', '2026-10-11', 0)).toEqual({ start: '2026-10-11', end: '2026-10-17' });
    expect(insightRange('custom', '2026-10-11', 1, { start: '2026-10-20', end: '2026-10-02' })).toEqual({ start: '2026-10-02', end: '2026-10-20' });
    expect(previousRange({ start: '2026-10-01', end: '2026-10-31' })).toEqual({ start: '2026-08-31', end: '2026-09-30' });
  });

  test('tasks outside the range are left out; a range point lands on its own day', () => {
    const tasks = [T({ id: 'in', date: '2026-10-31', done: true }), T({ id: 'out', date: '2026-11-01', done: true })];
    const c = completionInsight(occurrences(tasks, R, doneOn, []), buckets(R, 'day', 1));
    expect(c.series.find((s) => s.key === '2026-10-31')).toMatchObject({ planned: 1, done: 1 });
    expect(c.planned).toBe(1);
  });
});

describe('below the minimum, no insight', () => {
  const few = many(MIN_POINTS - 1, '2026-10-01', { tagIds: ['study'], estimateMinutes: 30, actualMinutes: {}, energy: 'high' });
  const occ = occurrences(few, R, doneOn, []);
  test.each([
    ['completion', completionInsight(occ, buckets(R, 'day', 1))],
    ['by tag', tagInsight(occ, few, [study])],
    ['estimate', estimateInsight(occ)],
    ['energy', energyInsight(occ)],
    ['feelings', feelingsInsight(occ, [study])],
    ['feel good', feelGoodInsight(occ, [study])],
    ['overload', overloadInsight(occ, 480)],
  ])('%s: not enough, no lines, and it says how many there are', (_name, insight) => {
    expect(insight.enough).toBe(false);
    expect(insight.lines).toEqual([]);
    expect(insight.n).toBeLessThan(MIN_POINTS);
    expect(insight.needed).toBe(MIN_POINTS);
  });

  test('exactly the minimum is enough', () => {
    const five = many(MIN_POINTS, '2026-10-01');
    expect(completionInsight(occurrences(five, R, doneOn, []), buckets(R, 'day', 1)).enough).toBe(true);
  });
});

describe('counts and maths', () => {
  test('completion, best weekday and time of day', () => {
    // Mondays all done, other days half.
    const tasks = many(28, '2026-10-01', {}, (i) => addDaysISO('2026-10-01', i) === '2026-10-05' || ['2026-10-12', '2026-10-19', '2026-10-26'].includes(addDaysISO('2026-10-01', i)) || i % 2 === 0);
    const c = completionInsight(occurrences(tasks, R, doneOn, []), buckets(R, 'day', 1));
    expect(c.planned).toBe(28);
    expect(c.bestWeekday?.name).toBe('Mondays');
    expect(c.bestTime?.time).toBe('morning');
    expect(c.lines[0]).toBe(`You finished ${c.done} of 28 tasks (${c.rate}%).`);
  });

  test('per tag: planned, done, time timed, moves; quiet tags', () => {
    const tasks = [
      ...many(6, '2026-10-01', { title: 's', tagIds: ['study'], actualMinutes: {} }, (i) => i < 4),
      ...many(3, '2026-10-10', { title: 'h', tagIds: ['home'], moveCount: 1 }, () => false),
    ];
    tasks[0].actualMinutes = { [tasks[0].date]: 25 };
    tasks[1].moveCount = 3;
    const occ = occurrences(tasks, R, doneOn, []);
    const t = tagInsight(occ, tasks, [study, home]);
    expect(t.tags.map((s) => [s.tag.name, s.planned, s.done, s.minutes, s.moved])).toEqual([['Study', 6, 4, 25, 3]]);
    expect(t.quiet.map((q) => q.name)).toEqual(['Home']); // 3 planned, none done
    expect(t.lines[0]).toBe('Study: 4 of 6 done (67%), 25 min timed.');
    expect(t.lines.join(' ')).toMatch(/Only if you want them to/);
  });

  test('a tag filter narrows every insight', () => {
    const tasks = [...many(5, '2026-10-01', { title: 's', tagIds: ['study'] }), ...many(7, '2026-10-01', { title: 'x' })];
    expect(occurrences(tasks, R, doneOn, [], ['study'])).toHaveLength(5);
    expect(occurrences(tasks, R, doneOn, [])).toHaveLength(12);
  });

  test.each([
    [[30, 38, 39, 41, 60], 30, /about 30% longer/], // median 39 of 30
    [[30, 31, 29, 30, 32], 30, /close to how long/],
    [[20, 20, 22, 18, 21], 30, /about 33% less time/],
  ])('estimate accuracy uses the median: took %j for %i-minute estimates', (actuals, est, re) => {
    const tasks = actuals.map((a, i) => T({ id: `e${i}`, date: addDaysISO('2026-10-01', i), done: true, estimateMinutes: est, actualMinutes: { [addDaysISO('2026-10-01', i)]: a } }));
    const e = estimateInsight(occurrences(tasks, R, doneOn, []));
    expect(e.enough).toBe(true);
    expect(e.lines[0]).toMatch(re);
  });

  test('only tasks with both an estimate and a timer count toward accuracy', () => {
    const tasks = [...many(10, '2026-10-01', { estimateMinutes: 30 }), T({ id: 'timed', date: '2026-10-20', done: true, estimateMinutes: 30, actualMinutes: { '2026-10-20': 45 } })];
    expect(estimateInsight(occurrences(tasks, R, doneOn, [])).n).toBe(1);
  });

  test('energy match: high-energy tasks finished in the best time of day', () => {
    const morning = many(6, '2026-10-01', { title: 'm' });
    const highEvening = many(5, '2026-10-10', { title: 'h', energy: 'high' }).map((t) => ({ ...t, completedAt: { [t.date]: `${t.date}T19:00:00` } }));
    const e = energyInsight(occurrences([...morning, ...highEvening], R, doneOn, []));
    expect(e.bestTime).toBe('morning');
    expect(e.inBest).toBe(0);
    expect(e.lines).toEqual([
      '0 of 5 high-energy tasks were finished in the morning, when you tend to finish the most.',
      'Planning high-energy tasks for the morning might suit you.',
    ]);
  });

  const withFeelings = (tag: string, zones: FeelingZone[], difficulty?: 'harder') => {
    const tasks: DailyTask[] = [];
    const entries: FeelingCheckIn[] = [];
    zones.forEach((zone, i) => {
      const date = addDaysISO('2026-10-01', i);
      const id = `${tag}-f${i}`;
      entries.push({ id: `e-${id}`, zone, feelingIds: [], date, createdAt: `${date}T10:00:00Z`, source: { kind: 'task', refId: id, date, phase: 'after' } });
      tasks.push(T({ id, date, done: true, tagIds: [tag], feelingLinks: { [date]: { after: `e-${id}` } }, completionNotes: difficulty ? { [date]: { difficulty } } : {} }));
    });
    return { tasks, entries };
  };

  test('feelings after tasks, by tag, and "harder than expected"', () => {
    const a = withFeelings('study', ['calm', 'calm', 'calm', 'tense', 'lively', 'calm'], 'harder');
    const occ = occurrences(a.tasks, R, doneOn, a.entries);
    const f = feelingsInsight(occ, [study]);
    expect(f.mix).toEqual({ lively: 1, calm: 4, tense: 1, low: 0, okay: 0 });
    expect(f.lines).toEqual([
      'After tasks, you most often felt Calm (4 of 6).',
      'After tasks tagged Study, you most often felt Calm (4 of 6).',
      'Tasks tagged Study were often harder than expected (6 of 6).',
    ]);
  });

  test('tasks you feel good after, and the other kind framed as information', () => {
    const good = withFeelings('study', ['calm', 'lively', 'calm', 'calm', 'okay']);
    const heavy = withFeelings('home', ['tense', 'low', 'tense', 'calm', 'okay']);
    const occ = occurrences([...good.tasks, ...heavy.tasks], R, doneOn, [...good.entries, ...heavy.entries]);
    const g = feelGoodInsight(occ, [study, home]);
    expect(g.good).toEqual([{ tag: study, n: 5, count: 4 }]);
    expect(g.heavy).toEqual([{ tag: home, n: 5, count: 3 }]);
    expect(g.lines[1]).toMatch(/Worth knowing, not something to fix\.$/);
  });

  test('busy days: planned well over the usual time, and how those days went', () => {
    const busy = [0, 1].flatMap((d) => many(3, addDaysISO('2026-10-01', d * 0), { title: `b${d}`, estimateMinutes: 240 }, (i) => i === 0).map((t, i) => ({ ...t, date: addDaysISO('2026-10-01', d), id: `b${d}-${i}` })));
    const calm = many(4, '2026-10-05', { title: 'c', estimateMinutes: 60 });
    const o = overloadInsight(occurrences([...busy, ...calm], R, doneOn, []), 480);
    expect(o.enough).toBe(true);
    expect(o.days.map((d) => d.date)).toEqual(['2026-10-01', '2026-10-02']);
    expect(o.overRate).toBe(33);
    expect(o.otherRate).toBe(100);
    expect(o.lines[1]).toBe('On those days you finished 33% of tasks; on other days, 100%.');
  });

  test('moved 3+ times, still open', () => {
    const tasks = [T({ id: 'a', date: '2026-10-01', moveCount: 4 }), T({ id: 'b', date: '2026-10-01', moveCount: 2 }), T({ id: 'c', date: '2026-10-01', moveCount: 5, done: true }), T({ id: 'd', date: '2026-10-01', moveCount: 3, letGoDates: ['2026-10-01'] })];
    expect(movedOften(tasks, doneOn).map((t) => t.id)).toEqual(['a']);
  });
});

describe('planning days: pauses, never resets', () => {
  const days = (list: string[]) => new Set(list);
  test('consecutive days count up', () => {
    expect(planningStreak(days(['2026-10-09', '2026-10-10', '2026-10-11']), '2026-10-11')).toMatchObject({ current: 3, paused: false, best: 3 });
  });
  test('a day or two off pauses it (still counting when you come back)', () => {
    const s = days(['2026-10-05', '2026-10-06', '2026-10-09']);
    expect(planningStreak(s, '2026-10-09')).toMatchObject({ current: 3, paused: false });
    expect(planningStreak(s, '2026-10-10')).toMatchObject({ current: 3, paused: true });
  });
  test('a longer break starts a new run, and the best run is kept', () => {
    const s = days(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-10-10', '2026-10-11']);
    expect(planningStreak(s, '2026-10-11')).toMatchObject({ current: 2, best: 4, total: 6 });
  });
  test('planning days are days with a one-off task or something ticked off', () => {
    const tasks = [T({ id: 'a', date: '2026-10-01' }), normalizeTask({ id: 'r', date: '2026-09-01', repeat: 'daily', completedDates: ['2026-10-03'], completedAt: { '2026-10-03': '2026-10-03T08:00:00' } })];
    expect([...planningDays(tasks, '2026-09-15', '2026-10-11')].sort()).toEqual(['2026-10-01', '2026-10-03']);
  });
});

describe('weekly review', () => {
  test('too little last week: nothing to show', () => {
    expect(weeklyReview(many(3, '2026-10-05'), [], '2026-10-12', 1, doneOn, [], 480, (t) => t.title)).toBeUndefined();
  });

  test('wins, what slipped (gently), one suggestion', () => {
    const tasks = [...many(5, '2026-10-05', { title: 'w', tagIds: ['study'] }, (i) => i !== 2), T({ id: 'moved', title: 'Clean the attic', date: '2026-10-07', moveCount: 3 })];
    const r = weeklyReview(tasks, [study], '2026-10-12', 1, doneOn, [], 480, (t) => t.title)!;
    expect(r.weekStart).toBe('2026-10-05');
    expect(r.wins[0]).toBe('You finished 4 tasks.');
    expect(r.wins).toContain('Most done: Study (4).');
    expect(r.slipped[0]).toBe("2 tasks stayed open. That's okay; they can wait or go.");
    expect(r.slipped[1]).toBe('Kept moving: Clean the attic.');
    expect(r.suggestion.length).toBeGreaterThan(0);
  });
});

describe('correlational, never causal, never guilt', () => {
  const CAUSAL = /\b(causes?|caused|makes you|made you|because of|leads? to|results? in|due to|triggers?|so that you)\b/i;
  const GUILT = /\b(fail(ed|ure)?|lazy|behind|should have|overdue|bad|shame|guilt|wasted|missed)\b/i;

  test('every line a rich data set produces', () => {
    const feel = (() => {
      const tasks: DailyTask[] = [];
      const entries: FeelingCheckIn[] = [];
      (['calm', 'tense', 'low', 'tense', 'lively', 'calm', 'tense'] as FeelingZone[]).forEach((zone, i) => {
        const date = addDaysISO('2026-10-01', i);
        entries.push({ id: `e${i}`, zone, feelingIds: [], date, createdAt: '', source: { kind: 'task', refId: `f${i}`, date, phase: 'after' } });
        tasks.push(T({ id: `f${i}`, date, done: i % 3 !== 0, tagIds: ['home'], energy: 'high', estimateMinutes: 300, actualMinutes: { [date]: 420 }, moveCount: i, feelingLinks: { [date]: { after: `e${i}` } }, completionNotes: { [date]: { difficulty: 'harder' } }, completedAt: { [date]: `${date}T20:00:00` } }));
      });
      return { tasks, entries };
    })();
    const tasks = [...feel.tasks, ...many(10, '2026-10-01', { title: 'm', tagIds: ['study'], estimateMinutes: 20 }, (i) => i % 2 === 0)];
    const occ = occurrences(tasks, R, doneOn, feel.entries);
    const lines = [
      ...completionInsight(occ, buckets(R, 'day', 1)).lines,
      ...tagInsight(occ, tasks, [study, home]).lines,
      ...estimateInsight(occ).lines,
      ...energyInsight(occ).lines,
      ...feelingsInsight(occ, [study, home]).lines,
      ...feelGoodInsight(occ, [study, home]).lines,
      ...overloadInsight(occ, 480).lines,
      ...Object.values(weeklyReview(tasks, [study, home], '2026-10-12', 1, doneOn, feel.entries, 480, (t) => t.title) ?? {}).flat(),
    ].filter((l): l is string => typeof l === 'string');
    expect(lines.length).toBeGreaterThan(10);
    for (const l of lines) {
      expect(l).not.toMatch(CAUSAL);
      expect(l).not.toMatch(GUILT);
    }
  });

  test.each(['src/utils/planningInsights.ts', 'src/screens/PlanningInsightsScreen.tsx', 'src/screens/dailyPlanning/WeeklyReviewCard.tsx'])('no causal or guilt wording anywhere in %s', (file) => {
    const src = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    const strings = (src.match(/(['"`])(?:(?!\1).){6,}\1/g) ?? []).filter((x) => /[a-z] [a-z]/i.test(x));
    for (const s of strings) {
      expect(s).not.toMatch(CAUSAL);
      expect(s).not.toMatch(GUILT);
    }
  });

  test('every insight says how many points it is based on', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/screens/PlanningInsightsScreen.tsx'), 'utf8');
    expect(src).toMatch(/Based on \{gate\.n\} \{gate\.unit\}/);
    expect(src).toMatch(/These are patterns, not causes\./);
  });
});
