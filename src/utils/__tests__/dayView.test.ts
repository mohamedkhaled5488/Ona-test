// Daily Planning v2, stage 3: the day view. Order of the day and drag,
// filters / sort / groups, search across all tasks, "Plan my day" and
// carry-over, plus a check that none of it shames.
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

const fs = require('fs') as { readFileSync: (p: string, e: string) => string };
const path = require('path') as { join: (...p: string[]) => string };

import type { DailyTask, TaskTag } from '../../types/sections';
import { normalizeTask } from '../taskMigration';
import {
  DEFAULT_DAY_VIEW,
  applyFilters,
  carryOver,
  dayLoad,
  dropIndex,
  filtersActive,
  groupTasks,
  moveInDay,
  searchTasks,
  sortForDay,
  sortTasks,
} from '../dayView';
import { useDailyPlanningStore, resolveTaskDone, resolveTaskTitle, taskAppliesToDate } from '../../store/useDailyPlanningStore';
import { withDefaults } from '../../store/useSettingsStore';

const T = (over: Partial<DailyTask> & { id: string }): DailyTask => normalizeTask({ date: '2026-10-11', title: over.id, repeat: 'none', ...over });
const doneOn = (t: DailyTask, d: string) => (t.repeat === 'none' ? t.done : t.completedDates.includes(d));
const ids = (list: DailyTask[]) => list.map((t) => t.id);
const store = () => useDailyPlanningStore.getState();

beforeEach(() => useDailyPlanningStore.setState({ tasks: [], tags: [], dayOrder: {} }));

describe('order of the day', () => {
  test('a dragged order comes first; tasks added later follow by their own order', () => {
    const tasks = [T({ id: 'a', order: 0 }), T({ id: 'b', order: 1 }), T({ id: 'c', order: 2 }), T({ id: 'new', order: 3 })];
    expect(ids(sortForDay(tasks, '2026-10-11', { '2026-10-11': ['c', 'a', 'b'] }))).toEqual(['c', 'a', 'b', 'new']);
    expect(ids(sortForDay(tasks, '2026-10-12', { '2026-10-11': ['c', 'a', 'b'] }))).toEqual(['a', 'b', 'c', 'new']);
  });

  test('moving within a day', () => {
    expect(moveInDay(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(moveInDay(['a', 'b', 'c'], 'a', 9)).toEqual(['b', 'c', 'a']);
    expect(moveInDay(['a', 'b'], 'zz', 0)).toEqual(['a', 'b']);
  });

  test.each([
    [0, 0, 0],
    [0, 40, 0], // less than half of the next row
    [0, 70, 1],
    [0, 260, 2], // two rows plus a little
    [0, 310, 3],
    [3, -70, 2],
    [3, -500, 0],
    [1, 9999, 3],
  ])('dragging row %i by %ipx lands at %i', (from, dy, to) => {
    expect(dropIndex([120, 120, 120, 120], from, dy)).toBe(to);
  });

  test('a repeating task can be reordered on any of its days, and only that day changes', () => {
    const daily = store().addTask('2026-10-01', 'Stretch', { repeat: 'daily' })!;
    const one = store().addTask('2026-10-11', 'Call mum')!;
    store().moveTaskInDay('2026-10-11', one, 0);
    const day = (d: string) => ids(sortForDay(store().tasks.filter((t) => taskAppliesToDate(t, d)), d, store().dayOrder));
    expect(day('2026-10-11')).toEqual([one, daily]);
    expect(day('2026-10-12')).toEqual([daily]);
    store().reorderTask('2026-10-11', daily, -1);
    expect(day('2026-10-11')).toEqual([daily, one]);
  });
});

describe('filters, sorting and groups', () => {
  const tags: TaskTag[] = [
    { id: 'study', name: 'Study', color: '#000', createdAt: '' },
    { id: 'home', name: 'Home', color: '#000', createdAt: '' },
  ];
  const tasks = [
    T({ id: 'essay', tagIds: ['study'], priority: 'high', energy: 'high', scheduledTime: '14:00' }),
    T({ id: 'dishes', tagIds: ['home'], priority: 'low', energy: 'low', done: true }),
    T({ id: 'both', tagIds: ['study', 'home'], priority: 'medium', scheduledTime: '09:00' }),
    T({ id: 'plain', allDay: true }),
  ];

  test('each filter, and filters together', () => {
    const f = DEFAULT_DAY_VIEW.filters;
    expect(ids(applyFilters(tasks, '2026-10-11', { ...f, tagIds: ['study'] }, doneOn))).toEqual(['essay', 'both']);
    expect(ids(applyFilters(tasks, '2026-10-11', { ...f, priorities: ['high', 'none'] }, doneOn))).toEqual(['essay', 'plain']);
    expect(ids(applyFilters(tasks, '2026-10-11', { ...f, energies: ['low'] }, doneOn))).toEqual(['dishes']);
    expect(ids(applyFilters(tasks, '2026-10-11', { ...f, status: 'open' }, doneOn))).toEqual(['essay', 'both', 'plain']);
    expect(ids(applyFilters(tasks, '2026-10-11', { ...f, status: 'done' }, doneOn))).toEqual(['dishes']);
    expect(ids(applyFilters(tasks, '2026-10-11', { ...f, tagIds: ['home'], status: 'open' }, doneOn))).toEqual(['both']);
    expect(filtersActive({ ...f, tagIds: ['home'], status: 'open' })).toBe(2);
    expect(filtersActive(f)).toBe(0);
  });

  test('sorting keeps the user\'s order for ties; all-day first and untimed last by time', () => {
    expect(ids(sortTasks(tasks, 'time'))).toEqual(['plain', 'both', 'essay', 'dishes']);
    expect(ids(sortTasks(tasks, 'priority'))).toEqual(['essay', 'both', 'dishes', 'plain']);
    expect(ids(sortTasks(tasks, 'energy'))).toEqual(['essay', 'dishes', 'both', 'plain']);
    expect(sortTasks(tasks, 'manual')).toBe(tasks);
  });

  test('groups: a task with two tags is in both; empty groups are left out', () => {
    const byTag = groupTasks(tasks, 'tag', '2026-10-11', tags, doneOn);
    expect(byTag.map((g) => [g.label, ids(g.tasks)])).toEqual([
      ['Home', ['dishes', 'both']],
      ['Study', ['essay', 'both']],
      ['No tag', ['plain']],
    ]);
    expect(groupTasks(tasks, 'status', '2026-10-11', tags, doneOn).map((g) => g.label)).toEqual(['To do', 'Done']);
    expect(groupTasks(tasks.slice(0, 1), 'priority', '2026-10-11', tags, doneOn).map((g) => g.label)).toEqual(['High priority']);
    expect(groupTasks(tasks, 'none', '2026-10-11', tags, doneOn)).toHaveLength(1);
  });

  test('the view choices are remembered (saved with settings) and survive missing keys', () => {
    const saved = withDefaults({ dailyViewPrefs: { groupBy: 'tag', sortBy: 'time', filters: { tagIds: ['x'], priorities: [], energies: [], status: 'open' } } });
    expect(saved.dailyViewPrefs.groupBy).toBe('tag');
    expect(saved.dailyViewPrefs.filters.status).toBe('open');
    expect(withDefaults({}).dailyViewPrefs).toEqual(DEFAULT_DAY_VIEW);
  });
});

describe('search across all tasks', () => {
  const all = [
    T({ id: 'a', title: 'Café meeting', date: '2026-09-01' }),
    T({ id: 'b', title: 'Groceries', notes: 'oat milk, coffee beans' }),
    T({ id: 'c', title: 'Trip', subtasks: [{ id: 's', title: 'Book the Coffee shop', done: false }], date: '2026-12-01' }),
    T({ id: 'd', title: 'Morning coffee walk', repeat: 'weekly', date: '2026-01-05' }), // Mondays
  ];

  test('matches titles, notes and subtasks on any day, ignoring case and accents; titles first', () => {
    const hits = searchTasks(all, 'COFFEE', (t) => t.title, '2026-10-11');
    expect(hits.map((h) => [h.task.id, h.where])).toEqual([
      ['d', 'title'],
      ['b', 'notes'],
      ['c', 'subtask'],
    ]);
    expect(searchTasks(all, 'cafe', (t) => t.title, '2026-10-11').map((h) => h.task.id)).toEqual(['a']);
  });

  test('a repeating task opens on its next day from today', () => {
    const hit = searchTasks(all, 'walk', (t) => t.title, '2026-10-11')[0];
    expect(hit.date).toBe('2026-10-12');
  });

  test('a linked task is found by its Plan Builder title; an empty search finds nothing', () => {
    expect(searchTasks(all, 'groc', () => 'From the plan', '2026-10-11')).toEqual([]);
    expect(searchTasks(all, 'from the plan', () => 'From the plan', '2026-10-11')).toHaveLength(4);
    expect(searchTasks(all, '   ', (t) => t.title, '2026-10-11')).toEqual([]);
  });
});

describe('plan my day', () => {
  test('estimates (or durations) add up; done tasks don\'t count as left', () => {
    const tasks = [T({ id: 'a', estimateMinutes: 60 }), T({ id: 'b', durationMinutes: 30 }), T({ id: 'c', estimateMinutes: 45, done: true }), T({ id: 'd' })];
    const load = dayLoad(tasks, '2026-10-11', 480, doneOn);
    expect(load).toMatchObject({ plannedMinutes: 135, remainingMinutes: 90, withoutEstimate: 1, overfull: false });
    expect(load.message).toMatch(/room to spare/);
  });

  test('an overfull day is a gentle question', () => {
    const tasks = [T({ id: 'a', estimateMinutes: 300 }), T({ id: 'b', estimateMinutes: 240 })];
    const load = dayLoad(tasks, '2026-10-11', 480, doneOn);
    expect(load.overfull).toBe(true);
    expect(load.message).toBe('This is about 9 hours of work, and you have about 8 hours. Move something?');
  });

  test('no tasks, no estimates, all done', () => {
    expect(dayLoad([], '2026-10-11', 480, doneOn).message).toMatch(/light day/);
    expect(dayLoad([T({ id: 'a' })], '2026-10-11', 480, doneOn).message).toMatch(/Add time estimates/);
    expect(dayLoad([T({ id: 'a', done: true, estimateMinutes: 20 })], '2026-10-11', 480, doneOn).message).toMatch(/done/);
  });
});

describe('carry-over and let go', () => {
  test('unfinished one-offs from earlier days, newest first; not done, let go, repeating, linked or future ones', () => {
    const tasks = [
      T({ id: 'old', date: '2026-10-05' }),
      T({ id: 'yesterday', date: '2026-10-10' }),
      T({ id: 'done', date: '2026-10-09', done: true }),
      T({ id: 'letgo', date: '2026-10-08', letGoDates: ['2026-10-08'] }),
      T({ id: 'repeat', date: '2026-10-01', repeat: 'daily' }),
      T({ id: 'linked', date: '2026-10-07', linkedPlan: { planId: 'p', path: ['s'] } }),
      T({ id: 'today', date: '2026-10-11' }),
      T({ id: 'ancient', date: '2026-01-01' }),
    ];
    expect(ids(carryOver(tasks, '2026-10-11', doneOn))).toEqual(['yesterday', 'old']);
  });

  test('bringing one to today counts a move; letting go removes it from carry-over without counting as done', () => {
    const a = store().addTask('2026-10-09', 'Fix bike')!;
    const b = store().addTask('2026-10-10', 'Old idea')!;
    store().rescheduleTask(a, '2026-10-09', '2026-10-11', undefined);
    store().letGo(b, '2026-10-10');
    const t = (id: string) => store().tasks.find((x) => x.id === id)!;
    expect(t(a)).toMatchObject({ date: '2026-10-11', moveCount: 1 });
    expect(carryOver(store().tasks, '2026-10-11', resolveTaskDone)).toEqual([]);
    expect(resolveTaskDone(t(b), '2026-10-10')).toBe(false);
    expect(resolveTaskTitle(t(b))).toBe('Old idea');
  });
});

describe('calm, never shaming', () => {
  const BANNED = /\b(fail(ed|ure)?|lazy|behind|overdue|should have|missed|bad|guilt|shame|wasted)\b/i;
  const messages = [
    dayLoad([], '2026-10-11', 480, doneOn).message,
    dayLoad([T({ id: 'a', estimateMinutes: 900 })], '2026-10-11', 480, doneOn).message,
    dayLoad([T({ id: 'a', estimateMinutes: 30 })], '2026-10-11', 480, doneOn).message,
    dayLoad([T({ id: 'a' })], '2026-10-11', 480, doneOn).message,
  ];
  test.each(messages)('"%s"', (m) => expect(m).not.toMatch(BANNED));

  test('the day view parts use no shaming words (except saying something is NOT missed)', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/screens/dailyPlanning/DayViewParts.tsx'), 'utf8');
    const screen = fs.readFileSync(path.join(process.cwd(), 'src/screens/DailyPlanningScreen.tsx'), 'utf8');
    const strings = (code: string) => (code.match(/(['"`])(?:(?!\1).){6,}\1/g) ?? []).filter((x) => /[a-z] [a-z]/i.test(x));
    for (const str of [...strings(src), ...strings(screen)]) {
      const cleaned = str.replace(/not missed|doesn't count as missed/gi, '');
      expect(cleaned).not.toMatch(BANNED);
    }
  });

  test('over capacity is never shown in red', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/screens/dailyPlanning/DayViewParts.tsx'), 'utf8');
    expect(src).not.toMatch(/#(?:F00|FF0000|E53935|D32F2F|C62828|C1554A)/i);
  });
});
