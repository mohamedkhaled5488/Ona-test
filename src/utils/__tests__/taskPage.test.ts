// Daily Planning v2, stage 2: the task page. Its working copy and rules
// (utils/taskForm.ts), what saving does for one-off, repeating and linked
// tasks, and checks on the page itself (labels, tap targets, keyboard).
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

const fs = require('fs') as { readFileSync: (p: string, e: string) => string };
const path = require('path') as { join: (...p: string[]) => string };

import {
  applyTemplate,
  durationBetween,
  emptyForm,
  endTimeOf,
  formFromTask,
  formToPatch,
  hasErrors,
  isDirty,
  moveItem,
  normalizeLink,
  reminderText,
  suggestTags,
  templateFieldsFromForm,
  validateForm,
} from '../taskForm';
import { normalizeTask } from '../taskMigration';
import { nextOccurrences } from '../taskRepeat';
import { useDailyPlanningStore, resolveTaskTitle, taskAppliesToDate } from '../../store/useDailyPlanningStore';
import { usePlanStore } from '../../store/usePlanStore';
import type { TaskTemplate } from '../../types/sections';

const store = () => useDailyPlanningStore.getState();
const task = (id: string) => store().tasks.find((t) => t.id === id)!;
let n = 0;
const ids = (prefix: string) => `${prefix}-${++n}`;

beforeEach(() => useDailyPlanningStore.setState({ tasks: [], tags: [], taskTemplates: [], hiddenStarterTemplates: [] }));

// Opens a task the way the page does: for a series, the date is the opened day.
const open = (id: string, day?: string) => {
  const t = task(id);
  return { ...formFromTask(t, resolveTaskTitle(t)), date: t.repeat === 'none' ? t.date : day ?? t.date };
};

describe('required fields and unsaved changes', () => {
  test('a title is required; spaces alone don\'t count', () => {
    expect(validateForm(emptyForm('2026-10-11')).title).toBeDefined();
    expect(validateForm({ ...emptyForm('2026-10-11'), title: '   ' }).title).toBeDefined();
    expect(hasErrors(validateForm({ ...emptyForm('2026-10-11'), title: 'Read' }))).toBe(false);
  });

  test('custom days needs at least one day', () => {
    const f = { ...emptyForm('2026-10-11'), title: 'Gym', repeat: 'customDays' as const };
    expect(validateForm(f).repeatDays).toBeDefined();
    expect(validateForm({ ...f, repeatDays: [2] }).repeatDays).toBeUndefined();
  });

  test('opening a task is not a change; typing and undoing is not a change', () => {
    const id = store().addTask('2026-10-11', 'Read', { notes: 'ch. 3' })!;
    const initial = open(id);
    expect(isDirty(open(id), initial)).toBe(false);
    expect(isDirty({ ...initial, title: 'Read more' }, initial)).toBe(true);
    expect(isDirty({ ...initial, title: 'Read ' }, initial)).toBe(false); // trailing space is trimmed on save
    expect(isDirty({ ...initial, priority: 'high' }, initial)).toBe(true);
  });

  test('a new task with a prefilled title counts as unsaved (leaving would lose it)', () => {
    expect(isDirty(emptyForm('2026-10-11', 'From quick add'), emptyForm('2026-10-11'))).toBe(true);
  });
});

describe('what gets saved', () => {
  test('no start time means no reminders and no end', () => {
    const p = formToPatch({ ...emptyForm('2026-10-11'), title: 'X', durationMinutes: 30, reminders: [{ id: 'r', minutesBefore: 5 }] });
    expect(p.reminders).toEqual([]);
    expect(p.durationMinutes).toBeUndefined();
  });

  test('all day drops the time', () => {
    const p = formToPatch({ ...emptyForm('2026-10-11'), title: 'X', allDay: true, scheduledTime: '09:00', reminders: [{ id: 'r', minutesBefore: 5 }] });
    expect(p).toMatchObject({ allDay: true, scheduledTime: undefined, reminders: [] });
  });

  test('empty text is "not set", blank subtasks are dropped, titles are trimmed', () => {
    const p = formToPatch({
      ...emptyForm('2026-10-11'),
      title: '  Essay  ',
      context: '  ',
      why: '',
      subtasks: [
        { id: 'a', title: ' Outline ', done: false },
        { id: 'b', title: '  ', done: false },
      ],
    });
    expect(p).toMatchObject({ title: 'Essay', context: undefined, why: undefined, notes: undefined });
    expect(p.subtasks).toEqual([{ id: 'a', title: 'Outline', done: false }]);
  });

  test('saving a new task from the page creates it with every field', () => {
    const tag = store().addTag('Study')!;
    const f = {
      ...emptyForm('2026-10-11'),
      title: 'Essay',
      scheduledTime: '09:00',
      durationMinutes: 90,
      tagIds: [tag],
      priority: 'medium' as const,
      energy: 'high' as const,
      estimateMinutes: 60,
      reminders: [{ id: 'r1', minutesBefore: 10 }],
      notes: 'Intro first',
      why: 'Pass the course',
      context: 'Library',
      attachments: [{ id: 'l', kind: 'link' as const, uri: 'https://example.com' }],
    };
    const id = store().addTask(f.date, f.title, formToPatch(f))!;
    expect(open(id)).toEqual(f);
  });
});

describe('start, end and duration', () => {
  test.each([
    ['09:00', 30, '09:30'],
    ['23:30', 60, '00:30'], // past midnight
    ['00:00', 1440, '00:00'],
  ])('%s + %i min ends at %s', (start, d, end) => expect(endTimeOf(start, d)).toBe(end));

  test('an end before the start is the next day; the same time is no duration', () => {
    expect(durationBetween('22:00', '06:00')).toBe(480);
    expect(durationBetween('09:00', '10:15')).toBe(75);
    expect(durationBetween('09:00', '09:00')).toBeUndefined();
  });

  test('reminder wording', () => {
    expect(reminderText(0)).toBe('At the start time');
    expect(reminderText(10)).toBe('10 min before');
    expect(reminderText(90)).toBe('1 h 30 min before');
    expect(reminderText(1440)).toBe('1 day before');
  });
});

describe('repeating tasks from the page', () => {
  const weekly = () =>
    store().addTask('2026-10-05', 'Water plants', { repeat: 'weekly', scheduledTime: '08:00' })!; // Mondays

  test('"all days" with the date untouched doesn\'t move the series', () => {
    const id = weekly();
    const f = { ...open(id, '2026-10-19'), scheduledTime: '09:00' };
    store().updateTask(id, formToPatch(f), 'all', '2026-10-19');
    expect(task(id)).toMatchObject({ date: '2026-10-05', scheduledTime: '09:00' });
  });

  test('moving the opened day with "all days" shifts the whole series', () => {
    const id = weekly();
    const f = { ...open(id, '2026-10-19'), date: '2026-10-20' }; // Monday -> Tuesday
    store().updateTask(id, formToPatch(f), 'all', '2026-10-19');
    expect(nextOccurrences(task(id), '2026-10-01', 3)).toEqual(['2026-10-06', '2026-10-13', '2026-10-20']);
  });

  test('"only this day" with a new date moves just that day', () => {
    const id = weekly();
    const f = { ...open(id, '2026-10-19'), date: '2026-10-21', title: 'Water plants (late)' };
    const copy = store().updateTask(id, formToPatch(f), 'this', '2026-10-19');
    expect(task(copy)).toMatchObject({ date: '2026-10-21', repeat: 'none', title: 'Water plants (late)' });
    expect(taskAppliesToDate(task(id), '2026-10-19')).toBe(false);
    expect(taskAppliesToDate(task(id), '2026-10-26')).toBe(true);
  });

  test('"this and later days" with a later date leaves the days between empty, never doubled', () => {
    const id = weekly();
    const f = { ...open(id, '2026-10-19'), date: '2026-10-21', repeat: 'weekly' as const };
    const next = store().updateTask(id, formToPatch(f), 'future', '2026-10-19');
    for (const d of ['2026-10-12', '2026-10-21', '2026-10-28']) expect(store().tasks.filter((t) => taskAppliesToDate(t, d))).toHaveLength(1);
    expect(store().tasks.filter((t) => taskAppliesToDate(t, '2026-10-19'))).toHaveLength(0);
    expect(task(next).date).toBe('2026-10-21');
  });

  test('"this and later days" with an earlier date ends the old series before it', () => {
    const id = weekly();
    const f = { ...open(id, '2026-10-19'), date: '2026-10-15', repeat: 'weekly' as const };
    store().updateTask(id, formToPatch(f), 'future', '2026-10-19');
    for (const d of ['2026-10-12', '2026-10-15', '2026-10-22']) expect(store().tasks.filter((t) => taskAppliesToDate(t, d))).toHaveLength(1);
    expect(store().tasks.filter((t) => taskAppliesToDate(t, '2026-10-19'))).toHaveLength(0);
  });
});

describe('Plan Builder link from the page', () => {
  const plan = () => usePlanStore.getState().plans[0];

  test('linking takes the step\'s title; unlinking keeps it as the task\'s own', () => {
    const id = store().addTask('2026-10-11', 'My own title')!;
    const p = plan();
    const step = p.steps[0];
    store().updateTask(id, { ...formToPatch(open(id)), linkedPlan: { planId: p.id, path: [step.id] }, title: step.title });
    expect(task(id).title).toBe('');
    expect(resolveTaskTitle(task(id))).toBe(step.title);
    // Unlink: the page sends the title it was showing.
    store().updateTask(id, { ...formToPatch(open(id)), linkedPlan: undefined });
    expect(task(id).linkedPlan).toBeUndefined();
    expect(task(id).title).toBe(step.title);
    // ...and the step itself wasn't renamed along the way.
    expect(usePlanStore.getState().plans[0].steps[0].title).toBe(step.title);
  });
});

describe('templates, tags, links, subtasks on the page', () => {
  test('a template fills the form with fresh ids and only tags that still exist', () => {
    const tag = store().addTag('Health')!;
    const tpl: TaskTemplate = {
      id: 't',
      name: 'Gym',
      createdAt: '',
      fields: { title: '', tagIds: [tag, 'gone'], priority: 'low', subtaskTitles: ['Shoes'], reminders: [{ minutesBefore: 5 }] },
    };
    const f = applyTemplate(emptyForm('2026-10-11'), tpl, [tag], ids);
    expect(f.title).toBe('Gym');
    expect(f.tagIds).toEqual([tag]);
    expect(f.subtasks).toEqual([{ id: expect.stringMatching(/^subtask-/), title: 'Shoes', done: false }]);
    expect(f.reminders[0].id).toMatch(/^reminder-/);
    expect(f.date).toBe('2026-10-11');
  });

  test('a form saved as a template keeps what matters and nothing day-specific', () => {
    const fields = templateFieldsFromForm({ ...emptyForm('2026-10-11'), title: ' Run ', subtasks: [{ id: 'a', title: 'Stretch', done: true }], reminders: [{ id: 'r', minutesBefore: 5 }] });
    expect(fields).toMatchObject({ title: 'Run', subtaskTitles: ['Stretch'], reminders: [{ minutesBefore: 5 }] });
    expect(JSON.stringify(fields)).not.toContain('2026-10-11');
  });

  test('tag suggestions: most used first, then newest; chosen ones left out', () => {
    const tags = [
      { id: 'a', createdAt: '2026-01-01' },
      { id: 'b', createdAt: '2026-02-01' },
      { id: 'c', createdAt: '2026-03-01' },
    ];
    const tasks = [{ tagIds: ['a'] }, { tagIds: ['a', 'b'] }];
    expect(suggestTags(tags, tasks, []).map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(suggestTags(tags, tasks, ['a']).map((t) => t.id)).toEqual(['b', 'c']);
  });

  test.each([
    ['example.com', 'https://example.com'],
    ['https://ona.app/x?y=1', 'https://ona.app/x?y=1'],
    ['not a link', undefined],
    ['hello', undefined],
    ['', undefined],
  ])('link %p -> %p', (input, out) => expect(normalizeLink(input)).toBe(out));

  test('reordering subtasks', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, 5)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a'], 3, 0)).toEqual(['a']);
  });
});

describe('the page itself', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'src/screens/TaskEditorScreen.tsx'), 'utf8');

  test('every pressable has a screen reader role', () => {
    const blocks = src.split('<Pressable').slice(1).map((b) => b.slice(0, b.search(/[^=]>/) + 1)); // up to the tag's own '>', not an arrow's
    expect(blocks.length).toBeGreaterThan(10);
    for (const b of blocks) expect(b).toMatch(/accessibilityRole=/);
  });

  test('every text field has a label for screen readers', () => {
    const blocks = src.split('<TextInput').slice(1).map((b) => b.slice(0, b.indexOf('/>')));
    for (const b of blocks) expect(b).toMatch(/accessibilityLabel=/);
  });

  test('chips are at least 34pt tall with extra touch area, rows at least 36-44pt', () => {
    expect(src).toMatch(/chip: \{[^}]*minHeight: 34/);
    expect(src).toMatch(/hitSlop=\{4\}/);
    expect(src).toMatch(/moreToggle: \{[^}]*minHeight: 44/);
  });

  test('the page scrolls with the keyboard (the shared Screen keeps fields above it)', () => {
    expect(src).toMatch(/<Screen>/);
    expect(src).not.toMatch(/<Screen scroll=\{false\}/);
    const screen = fs.readFileSync(path.join(process.cwd(), 'src/components/Screen.tsx'), 'utf8');
    expect(screen).toMatch(/KeyboardAwareScrollView/);
  });

  test('leaving with changes asks first, and Save can be refused (blank title)', () => {
    expect(src).toMatch(/useBackHandler\(\{ dirty, onSave: save \}\)/);
    const hook = fs.readFileSync(path.join(process.cwd(), 'src/hooks/useBackHandler.ts'), 'utf8');
    expect(hook).toMatch(/'Keep editing'/);
    expect(hook).toMatch(/onSave\?\.\(\) === false/);
  });

  test('delete always asks, and offers undo', () => {
    expect(src).toMatch(/Delete this task\?/);
    expect(src).toMatch(/Delete a repeating task\?/);
    expect(src).toMatch(/actionLabel: 'Undo'/);
  });

  test('no red, alarm-style colors for priority', () => {
    expect(src).not.toMatch(/#(?:F00|FF0000|E53935|D32F2F|C62828)/i);
  });
});

// Reused by the migration test: a task straight from storage opens cleanly.
test('a migrated task opens on the page without changes', () => {
  const t = normalizeTask({ id: 'old', date: '2026-10-11', title: 'Old', done: false, repeat: 'none', reminderMinutesBefore: 10, scheduledTime: '08:00' });
  useDailyPlanningStore.setState({ tasks: [t] });
  const f = open('old');
  expect(f.reminders).toEqual([{ id: 'reminder-0', minutesBefore: 10 }]);
  expect(isDirty(f, open('old'))).toBe(false);
});
