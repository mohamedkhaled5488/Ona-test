// Daily Planning v2, stage 1: the task model, repeat rules, migration of
// tasks saved by earlier versions, and the date logic underneath (midnight,
// daylight saving, time zones, week start, month ends, leap days).
const mockScheduled: { date: string; scheduledTime: string; minutesBefore: number; repeat: string; soundId?: string }[] = [];
jest.mock('../notifications', () => ({
  cancelReminders: jest.fn(async () => {}),
  scheduleReminder: jest.fn(async (input: { date: string; scheduledTime: string; minutesBefore: number; repeat: string; soundId?: string }) => {
    mockScheduled.push(input);
    return [`n${mockScheduled.length}`];
  }),
}));

// Node modules, typed by hand (the app's tsconfig has no Node types).
const fs = require('fs') as {
  mkdirSync: (p: string, o: { recursive: true }) => void;
  readFileSync: (p: string, e: string) => string;
  writeFileSync: (p: string, data: string) => void;
  rmSync: (p: string, o: { recursive: true; force: true }) => void;
};
const os = require('os') as { tmpdir: () => string };
const path = require('path') as { join: (...p: string[]) => string };
const { spawnSync } = require('child_process') as {
  spawnSync: (cmd: string, args: string[], o: { env: Record<string, string | undefined>; encoding: 'utf8' }) => { status: number | null; stdout: string; stderr: string };
};
const babel = require('@babel/core') as { transformSync: (code: string, opts: Record<string, unknown>) => { code?: string | null } | null };
const resolveModule = (require as unknown as { resolve: (id: string) => string }).resolve;
import type { DailyTask } from '../../types/sections';
import { addDaysISO, daysInMonthISO, weekdayOfISO } from '../date';
import { datesInRange, weekStartFor } from '../feelingsStats';
import { allSubtasksDone, letGoArchive, nextOccurrences, occursOn, reminderSlots } from '../taskRepeat';
import { normalizeTask, normalizeTasks, normalizeTags, normalizeTemplates, type LegacyDailyTask } from '../taskMigration';
import { normalizeField } from '../localData';
import { hydrateLocalData, storageKey } from '../localPersistence';
import { fromRecords, toRecords } from '../../sync/records';
import { useDailyPlanningStore, resolveTaskDone, taskAppliesToDate } from '../../store/useDailyPlanningStore';
import { usePlanStore } from '../../store/usePlanStore';
import { STARTER_TASK_TEMPLATES } from '../../data/taskTemplates';

const store = () => useDailyPlanningStore.getState();
const task = (id: string) => store().tasks.find((t) => t.id === id)!;

// Jest workers ignore TZ changes made inside a test (on Windows at least; see
// jest.globalSetup.js), so checks that must hold in every time zone run the
// real date.ts and taskRepeat.ts in a child Node process with TZ set.
const zoneDir = path.join(os.tmpdir(), `ona-tz-${process.pid}`);
function compileForZones() {
  fs.mkdirSync(zoneDir, { recursive: true });
  for (const name of ['date', 'taskRepeat']) {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/utils', `${name}.ts`), 'utf8');
    const out = babel.transformSync(src, {
      filename: `${name}.ts`,
      babelrc: false,
      configFile: false,
      presets: [resolveModule('@babel/preset-typescript')],
      plugins: [resolveModule('@babel/plugin-transform-modules-commonjs')],
    })!.code!;
    fs.writeFileSync(path.join(zoneDir, `${name}.js`), out);
  }
}

// Runs `body` (which can use `d` = date.ts and `r` = taskRepeat.ts and must
// return JSON-able data) in time zone `tz`.
function inZone(tz: string, body: string): unknown {
  const script = `const d = require(${JSON.stringify(path.join(zoneDir, 'date.js'))}); const r = require(${JSON.stringify(path.join(zoneDir, 'taskRepeat.js'))}); process.stdout.write(JSON.stringify((() => { ${body} })()));`;
  const res = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(res.stderr);
  return JSON.parse(res.stdout);
}

const legacy = (over: Partial<LegacyDailyTask> = {}): LegacyDailyTask => ({
  id: 'old-1',
  date: '2026-03-02',
  title: 'Water plants',
  done: false,
  notificationIds: ['n-old'],
  completionNotes: { '2026-03-02': { comment: 'fine', evaluation: 'well' } },
  subtasks: [{ id: 's1', title: 'Balcony', done: true }],
  repeat: 'weekly',
  completedDates: ['2026-03-02'],
  skippedDates: ['2026-03-09'],
  order: 3,
  scheduledTime: '08:00',
  reminderMinutesBefore: 10,
  alarmSound: 'chime',
  ...over,
});

beforeEach(() => {
  mockScheduled.length = 0;
  useDailyPlanningStore.setState({ tasks: [], tags: [], taskTemplates: [], hiddenStarterTemplates: [] });
});

// Lets fire-and-forget reminder scheduling finish.
const settle = () => store().resyncAllReminders();

// ---------------------------------------------------------------------------
describe('date and time', () => {
  // Zones with a daylight-saving change, including one that changes at midnight.
  const ZONES = ['America/New_York', 'Europe/London', 'Pacific/Auckland', 'America/Santiago', 'Asia/Kolkata', 'UTC'];

  beforeAll(compileForZones);
  afterAll(() => fs.rmSync(zoneDir, { recursive: true, force: true }));

  test('the child processes really run in the zone they are given', () => {
    expect(inZone('America/New_York', 'return new Date(2026, 0, 1).getTimezoneOffset();')).toBe(300);
    expect(inZone('Asia/Kolkata', 'return new Date(2026, 0, 1).getTimezoneOffset();')).toBe(-330);
  });

  test.each(ZONES)('adding days never skips or repeats a date across DST changes (%s)', (tz) => {
    const out = inZone(
      tz,
      `const all = []; let c = '2026-01-01'; while (c <= '2026-12-31') { all.push(c); c = d.addDaysISO(c, 1); }
       return { n: all.length, unique: new Set(all).size,
         steps: [d.addDaysISO('2026-03-07', 1), d.addDaysISO('2026-03-29', 1), d.addDaysISO('2026-04-05', -1), d.addDaysISO('2026-09-06', 1), d.addDaysISO('2026-11-01', 1)] };`
    );
    // Every DST change of 2026 in these zones falls inside the year.
    expect(out).toEqual({ n: 365, unique: 365, steps: ['2026-03-08', '2026-03-30', '2026-04-04', '2026-09-07', '2026-11-02'] });
  });

  test.each(ZONES)('weekdays and repeat rules give the same dates in every time zone (%s)', (tz) => {
    const out = inZone(
      tz,
      `const base = { skippedDates: [], letGoDates: [] };
       return {
         weekdays: [d.weekdayOfISO('2026-10-11'), d.weekdayOfISO('2026-03-08'), d.weekdayOfISO('2028-02-29')],
         weekly: r.nextOccurrences({ ...base, date: '2026-03-02', repeat: 'weekly' }, '2026-03-01', 4),
         monthly: r.nextOccurrences({ ...base, date: '2026-01-31', repeat: 'monthly' }, '2026-01-01', 3),
         series: r.nextOccurrences({ ...base, date: '2026-10-30', repeat: 'daily', repeatUntil: '2026-11-02' }, '2026-10-01', 10),
       };`
    );
    expect(out).toEqual({
      weekdays: [0, 0, 2],
      weekly: ['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23'],
      monthly: ['2026-01-31', '2026-02-28', '2026-03-31'],
      // Across the US/EU clock change at the end of October.
      series: ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'],
    });
  });

  test('a reminder for a midnight task fires the evening before', () => {
    expect(inZone('Europe/London', `const f = d.reminderFireDate('2026-10-12', '00:00', 10); return [f.getFullYear(), f.getMonth() + 1, f.getDate(), f.getHours(), f.getMinutes()];`)).toEqual([2026, 10, 11, 23, 50]);
  });

  test('reminders count real time across a DST change', () => {
    const out = inZone(
      'America/New_York',
      `const s = d.reminderFireDate('2026-03-08', '03:30', 60); const g = d.reminderFireDate('2026-03-08', '02:30', 0); const f = d.reminderFireDate('2026-11-01', '01:30', 0);
       return { spring: [s.getHours(), s.getMinutes()], gap: [g.getDate(), g.getHours(), g.getMinutes()], fallOffset: f.getTimezoneOffset() };`
    );
    // 60 minutes before 03:30 on the spring-forward day is 01:30 (02:xx doesn't exist);
    // a start time that doesn't exist moves forward with the clock;
    // on the fall-back day 01:30 happens twice and the reminder uses the first.
    expect(out).toEqual({ spring: [1, 30], gap: [8, 3, 30], fallOffset: 240 });
  });

  test('a task is on the same dates after travelling to another time zone', () => {
    const body = `return r.nextOccurrences({ skippedDates: [], letGoDates: [], date: '2026-10-05', repeat: 'customDays', repeatDays: [1, 3] }, '2026-10-01', 4);`;
    expect(inZone('Asia/Tokyo', body)).toEqual(['2026-10-05', '2026-10-07', '2026-10-12', '2026-10-14']);
    expect(inZone('America/Los_Angeles', body)).toEqual(inZone('Asia/Tokyo', body));
  });

  test('week start Sunday vs Monday', () => {
    // 2026-10-11 is a Sunday.
    expect(weekStartFor('2026-10-11', 0)).toBe('2026-10-11');
    expect(weekStartFor('2026-10-11', 1)).toBe('2026-10-05');
    expect(weekStartFor('2026-10-12', 1)).toBe('2026-10-12');
    expect(weekStartFor('2026-10-17', 0)).toBe('2026-10-11');
    // Week starting on Saturday too (some regions).
    expect(weekStartFor('2026-10-11', 6)).toBe('2026-10-10');
  });

  test('the weekdays rule is Monday to Friday whatever the week start', () => {
    const t = normalizeTask({ id: 'wd', date: '2026-10-09', repeat: 'weekdays' }); // a Friday
    expect(nextOccurrences(t, '2026-10-09', 6)).toEqual(['2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']);
  });

  test('custom days', () => {
    const t = normalizeTask({ id: 'c', date: '2026-10-01', repeat: 'customDays', repeatDays: [0, 3] }); // Sun, Wed
    expect(nextOccurrences(t, '2026-10-01', 4)).toEqual(['2026-10-04', '2026-10-07', '2026-10-11', '2026-10-14']);
    expect(occursOn(t, '2026-10-01')).toBe(false); // the start date itself is a Thursday
  });

  test('monthly on the 31st falls on the last day of shorter months', () => {
    const t = normalizeTask({ id: 'm', date: '2026-01-31', repeat: 'monthly' });
    expect(nextOccurrences(t, '2026-01-01', 5)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
    const leap = normalizeTask({ id: 'm2', date: '2028-01-31', repeat: 'monthly' });
    expect(nextOccurrences(leap, '2028-02-01', 1)).toEqual(['2028-02-29']);
  });

  test('monthly from a leap day', () => {
    const t = normalizeTask({ id: 'leap', date: '2028-02-29', repeat: 'monthly' });
    expect(nextOccurrences(t, '2028-02-29', 3)).toEqual(['2028-02-29', '2028-03-29', '2028-04-29']);
    expect(occursOn(t, '2029-02-28')).toBe(true);
    expect(occursOn(t, '2029-03-01')).toBe(false);
    expect(daysInMonthISO('2100-02-01')).toBe(28); // not a leap year
    expect(daysInMonthISO('2000-02-01')).toBe(29);
  });

  test('a series with an end date stops there', () => {
    const t = normalizeTask({ id: 'u', date: '2026-10-01', repeat: 'daily', repeatUntil: '2026-10-03' });
    expect(nextOccurrences(t, '2026-09-01', 10)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
  });

  test.each([
    ['2026-01-25', '2026-01-31', 7],
    ['2026-02-01', '2026-02-28', 28],
    ['2028-02-01', '2028-02-29', 29],
    ['2026-04-01', '2026-04-30', 30],
    ['2026-10-01', '2026-10-31', 31],
  ])('a range %s to %s covers every day (%i)', (start, end, n) => {
    const dates = datesInRange(start, end);
    expect(dates).toHaveLength(n);
    expect(dates[0]).toBe(start);
    expect(dates[dates.length - 1]).toBe(end);
    for (const day of ['25', '27', '29', '30', '31']) {
      const iso = `${start.slice(0, 8)}${day}`;
      if (Number(day) <= daysInMonthISO(start) && iso >= start) expect(dates).toContain(iso);
    }
  });

  test.each([
    ['2026-01-31', '2026-02-01'],
    ['2026-02-28', '2026-03-01'],
    ['2028-02-28', '2028-02-29'],
    ['2028-02-29', '2028-03-01'],
    ['2026-04-30', '2026-05-01'],
    ['2026-12-31', '2027-01-01'],
  ])('move to tomorrow from %s lands on %s', (from, to) => {
    const id = store().addTask(from, 'Pay rent')!;
    store().moveToTomorrow(id, from);
    expect(task(id).date).toBe(to);
    expect(task(id).moveCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe('migration of tasks saved before v2', () => {
  test('one reminder and its sound become the first item of reminders', () => {
    const t = normalizeTask(legacy());
    expect(t.reminders).toEqual([{ id: 'reminder-0', minutesBefore: 10, sound: 'chime' }]);
    expect('reminderMinutesBefore' in t).toBe(false);
    expect('alarmSound' in t).toBe(false);
  });

  test('nothing the task had is lost', () => {
    const old = legacy({ linkedPlan: { planId: 'plan-1', path: ['step-2'] } });
    const t = normalizeTask(old);
    expect(t).toMatchObject({
      id: old.id,
      date: old.date,
      title: old.title,
      done: old.done,
      notificationIds: old.notificationIds,
      completionNotes: old.completionNotes,
      subtasks: old.subtasks,
      repeat: old.repeat,
      completedDates: old.completedDates,
      skippedDates: old.skippedDates,
      order: old.order,
      scheduledTime: old.scheduledTime,
      linkedPlan: old.linkedPlan,
    });
  });

  test('new fields get calm defaults', () => {
    const t = normalizeTask(legacy());
    expect(t).toMatchObject({ tagIds: [], priority: 'none', letGoDates: [], completedAt: {}, actualMinutes: {}, attachments: [], feelingLinks: {}, moveCount: 0 });
  });

  test('a task without a reminder gets none', () => {
    expect(normalizeTask(legacy({ reminderMinutesBefore: undefined })).reminders).toEqual([]);
  });

  test('migrating twice changes nothing', () => {
    const once = normalizeTask(legacy());
    expect(normalizeTask(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });

  test('fields from a newer version are kept, damaged values are repaired', () => {
    const t = normalizeTask({ ...legacy(), futureField: { a: 1 }, repeat: 'yearly', priority: 'urgent', tagIds: ['t1', 7], order: 'x' });
    expect((t as unknown as Record<string, unknown>).futureField).toEqual({ a: 1 });
    expect(t.repeat).toBe('none');
    expect(t.priority).toBe('none');
    expect(t.tagIds).toEqual(['t1']);
    expect(t.order).toBe(0);
  });

  test('garbage never throws', () => {
    expect(normalizeTasks(null)).toEqual([]);
    expect(normalizeTasks([null, 3, 'x']).length).toBe(3);
    expect(normalizeTags([{ id: 1 }, { id: 'a', name: 'Study' }])).toEqual([expect.objectContaining({ id: 'a', name: 'Study' })]);
    expect(normalizeTemplates([{ id: 'x' }])).toEqual([]);
  });

  test('old tasks saved on this phone are upgraded when Ona starts', async () => {
    const saved = new Map<string, string>([[storageKey('dailyPlanning'), JSON.stringify({ v: 1, state: { tasks: [legacy()], dayTemplates: [], dayReflections: {} } })]]);
    // true: sections with nothing saved keep their sample data (the Plan Builder tests below use it).
    await hydrateLocalData({ getItem: (k) => saved.get(k) ?? null, setItem: () => {} }, true);
    const t = task('old-1');
    expect(t.reminders).toEqual([{ id: 'reminder-0', minutesBefore: 10, sound: 'chime' }]);
    expect(t.completedDates).toEqual(['2026-03-02']);
    // Sections saved before tags existed start with none.
    expect(store().tags).toEqual([]);
  });

  test('old tasks arriving from another device are upgraded too', () => {
    const value = normalizeField('dailyPlanning', 'tasks', [legacy()]) as DailyTask[];
    expect(value[0].reminders[0].minutesBefore).toBe(10);
  });

  test('the old screen still works on migrated tasks (single-reminder controls)', () => {
    useDailyPlanningStore.setState({ tasks: [normalizeTask(legacy())] });
    store().setReminder('old-1', 30);
    store().setAlarmSound('old-1', 'ping');
    expect(task('old-1').reminders).toEqual([{ id: 'reminder-0', minutesBefore: 30, sound: 'ping' }]);
    store().setReminder('old-1', undefined);
    expect(task('old-1').reminders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('repeat: this task only vs all future', () => {
  const series = () => {
    useDailyPlanningStore.setState({
      tasks: [
        normalizeTask({
          ...legacy({ date: '2026-10-05', completedDates: ['2026-10-05', '2026-10-12'], skippedDates: [], completionNotes: { '2026-10-12': { comment: 'ok' } } }),
          id: 'weekly',
        }),
      ],
    });
    return 'weekly';
  };

  test('"this task only" changes one day and leaves the series alone', () => {
    const id = series();
    const copyId = store().updateTask(id, { title: 'Water plants (big pots)', scheduledTime: '10:00' }, 'this', '2026-10-12');
    expect(copyId).not.toBe(id);
    const copy = task(copyId);
    expect(copy).toMatchObject({ repeat: 'none', date: '2026-10-12', title: 'Water plants (big pots)', scheduledTime: '10:00', done: true, seriesId: id });
    expect(copy.completionNotes).toEqual({ '2026-10-12': { comment: 'ok' } });
    expect(task(id).title).toBe('Water plants');
    expect(taskAppliesToDate(task(id), '2026-10-12')).toBe(false);
    expect(taskAppliesToDate(task(id), '2026-10-19')).toBe(true);
    expect(store().tasks.filter((t) => taskAppliesToDate(t, '2026-10-12'))).toHaveLength(1);
  });

  test('"all future" ends the series the day before and starts a new one', () => {
    const id = series();
    const nextId = store().updateTask(id, { scheduledTime: '18:00' }, 'future', '2026-10-12');
    const old = task(id);
    const next = task(nextId);
    expect(old.repeatUntil).toBe('2026-10-11');
    expect(old.scheduledTime).toBe('08:00');
    expect(old.completedDates).toEqual(['2026-10-05']);
    expect(next).toMatchObject({ date: '2026-10-12', scheduledTime: '18:00', repeat: 'weekly', completedDates: ['2026-10-12'], seriesId: id });
    expect(next.completionNotes).toEqual({ '2026-10-12': { comment: 'ok' } });
    // Every date still has exactly one copy of the task.
    for (const d of ['2026-10-05', '2026-10-12', '2026-10-19']) expect(store().tasks.filter((t) => taskAppliesToDate(t, d))).toHaveLength(1);
    expect(resolveTaskDone(old, '2026-10-05')).toBe(true);
    expect(resolveTaskDone(next, '2026-10-12')).toBe(true);
  });

  test('"all future" from the first day just edits the series', () => {
    const id = series();
    expect(store().updateTask(id, { scheduledTime: '07:00' }, 'future', '2026-10-05')).toBe(id);
    expect(store().tasks).toHaveLength(1);
    expect(task(id).scheduledTime).toBe('07:00');
  });

  test('"all future" can switch the rule (weekly to weekdays)', () => {
    const id = series();
    const nextId = store().updateTask(id, { repeat: 'weekdays' }, 'future', '2026-10-19');
    expect(nextOccurrences(task(nextId), '2026-10-19', 3)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21']);
    expect(nextOccurrences(task(id), '2026-10-01', 10)).toEqual(['2026-10-05', '2026-10-12']);
  });

  test('stopping repeating from a day keeps that day\'s completion', () => {
    const id = series();
    const nextId = store().updateTask(id, { repeat: 'none' }, 'future', '2026-10-12');
    expect(task(nextId)).toMatchObject({ repeat: 'none', date: '2026-10-12', done: true, completedDates: [] });
  });

  test('deleting one day or every later day', () => {
    const id = series();
    store().deleteOccurrence(id, '2026-10-19', 'this');
    expect(taskAppliesToDate(task(id), '2026-10-19')).toBe(false);
    expect(taskAppliesToDate(task(id), '2026-10-26')).toBe(true);
    store().deleteOccurrence(id, '2026-10-26', 'future');
    expect(nextOccurrences(task(id), '2026-10-01', 10)).toEqual(['2026-10-05', '2026-10-12']);
    store().deleteOccurrence(id, '2026-10-05', 'future');
    expect(store().tasks).toHaveLength(0);
  });

  test('moving one day of a repeating task moves only that day', () => {
    const id = series();
    store().moveToTomorrow(id, '2026-10-19');
    const copy = store().tasks.find((t) => t.id !== id)!;
    expect(copy).toMatchObject({ date: '2026-10-20', repeat: 'none', moveCount: 1, done: false });
    expect(taskAppliesToDate(task(id), '2026-10-19')).toBe(false);
  });

  test('"move all unfinished" doesn\'t pick up a weekly task on another weekday', () => {
    const id = series();
    store().addTask('2026-10-13', 'Tuesday thing');
    expect(store().moveIncompleteToTomorrow('2026-10-13')).toBe(1);
    expect(store().tasks.filter((t) => t.id !== id && t.title === 'Water plants')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe('tasks, let go, subtasks, completion times', () => {
  test('a blank title creates nothing', () => {
    expect(store().addTask('2026-10-11', '   ')).toBeUndefined();
    expect(store().tasks).toHaveLength(0);
  });

  test('a new task takes the task page\'s fields', () => {
    const id = store().addTask('2026-10-11', ' Essay ', {
      notes: 'Intro first',
      priority: 'high',
      energy: 'high',
      estimateMinutes: 60,
      durationMinutes: 90,
      scheduledTime: '09:00',
      reminders: [{ id: 'r1', minutesBefore: 10 }],
      context: 'Library',
      why: 'Pass the course',
    })!;
    expect(task(id)).toMatchObject({ title: 'Essay', priority: 'high', energy: 'high', estimateMinutes: 60, durationMinutes: 90, context: 'Library', why: 'Pass the course' });
    expect(task(id).createdAt).toBeDefined();
  });

  test('reminders need a time', () => {
    const id = store().addTask('2026-10-11', 'No time', { reminders: [{ id: 'r', minutesBefore: 5 }] })!;
    expect(task(id).reminders).toEqual([]);
    store().setScheduledTime(id, '09:00');
    store().setReminders(id, [{ id: 'r', minutesBefore: 5 }]);
    store().setScheduledTime(id, undefined);
    expect(task(id).reminders).toEqual([]);
  });

  test('ticking off records when; unticking removes it', () => {
    const id = store().addTask('2026-10-11', 'Run')!;
    expect(store().toggleTask(id, '2026-10-11')).toBe(true);
    expect(task(id).completedAt['2026-10-11']).toMatch(/^\d{4}-\d\d-\d\dT/);
    store().toggleTask(id, '2026-10-11');
    expect(task(id).completedAt).toEqual({});
  });

  test('let go hides the day without counting it as missed, and can be undone', () => {
    const id = store().addTask('2026-10-11', 'Clean garage')!;
    store().letGo(id, '2026-10-11');
    expect(taskAppliesToDate(task(id), '2026-10-11')).toBe(false);
    expect(letGoArchive(store().tasks).map((x) => x.task.id)).toEqual([id]);
    store().undoLetGo(id, '2026-10-11');
    expect(taskAppliesToDate(task(id), '2026-10-11')).toBe(true);
    expect(letGoArchive(store().tasks)).toEqual([]);
  });

  test('subtasks reorder; all done offers completing the parent', () => {
    const id = store().addTask('2026-10-11', 'Trip')!;
    ['Tickets', 'Bag', 'Keys'].forEach((s) => store().addSubtask(id, s));
    const [a, , c] = task(id).subtasks;
    store().moveSubtask(id, c.id, 0);
    expect(task(id).subtasks.map((s) => s.title)).toEqual(['Keys', 'Tickets', 'Bag']);
    store().moveSubtask(id, a.id, 99);
    expect(task(id).subtasks.map((s) => s.title)).toEqual(['Keys', 'Bag', 'Tickets']);
    expect(allSubtasksDone(task(id))).toBe(false);
    task(id).subtasks.forEach((s) => store().toggleSubtask(id, s.id));
    expect(allSubtasksDone(task(id))).toBe(true);
    expect(allSubtasksDone({ subtasks: [] })).toBe(false);
  });

  test('actual time and linked feelings are kept per day', () => {
    const id = store().addTask('2026-10-11', 'Read')!;
    store().setActualMinutes(id, '2026-10-11', 42.4);
    store().setFeelingLink(id, '2026-10-11', 'after', 'feeling-1');
    expect(task(id).actualMinutes).toEqual({ '2026-10-11': 42 });
    expect(task(id).feelingLinks).toEqual({ '2026-10-11': { after: 'feeling-1' } });
    store().setFeelingLink(id, '2026-10-11', 'after', undefined);
    store().setActualMinutes(id, '2026-10-11', 0);
    expect(task(id).feelingLinks).toEqual({});
    expect(task(id).actualMinutes).toEqual({});
  });
});

// ---------------------------------------------------------------------------
describe('tags', () => {
  test('names are unique ignoring case', () => {
    const a = store().addTag('Study')!;
    expect(store().addTag(' study ')).toBe(a);
    expect(store().addTag('')).toBeUndefined();
    expect(store().tags).toHaveLength(1);
  });

  test('rename: empty and taken names are refused', () => {
    const a = store().addTag('Study')!;
    store().addTag('Work');
    expect(store().renameTag(a, ' ')).toBe('empty');
    expect(store().renameTag(a, 'WORK')).toBe('taken');
    expect(store().renameTag(a, 'Learning')).toBe('ok');
    expect(store().tags.find((t) => t.id === a)!.name).toBe('Learning');
  });

  test('merge moves every task over without duplicates', () => {
    const a = store().addTag('Uni')!;
    const b = store().addTag('Study')!;
    const t1 = store().addTask('2026-10-11', 'One', { tagIds: [a] })!;
    const t2 = store().addTask('2026-10-11', 'Two', { tagIds: [a, b] })!;
    store().mergeTags(a, b);
    expect(task(t1).tagIds).toEqual([b]);
    expect(task(t2).tagIds).toEqual([b]);
    expect(store().tags.map((t) => t.id)).toEqual([b]);
  });

  test('deleting a tag keeps the tasks', () => {
    const a = store().addTag('Errands')!;
    const t1 = store().addTask('2026-10-11', 'Post office', { tagIds: [a] })!;
    store().deleteTag(a);
    expect(task(t1)).toBeDefined();
    expect(task(t1).tagIds).toEqual([]);
    expect(store().tags).toEqual([]);
  });

  test('tags sync as their own records and come back unchanged', () => {
    store().addTag('Study');
    store().addTag('Home');
    const records = toRecords('dailyPlanning.tags', store().tags);
    expect(records.size).toBe(2);
    expect(fromRecords('dailyPlanning.tags', [], records)).toEqual(store().tags);
  });

  test('a task with every new field survives a sync round trip, minus phone-only reminder ids', () => {
    const id = store().addTask('2026-10-11', 'Synced', { tagIds: ['t'], priority: 'low', scheduledTime: '09:00', reminders: [{ id: 'r', minutesBefore: 5, sound: 'ping' }] })!;
    store().setActualMinutes(id, '2026-10-11', 20);
    useDailyPlanningStore.setState({ tasks: store().tasks.map((t) => ({ ...t, notificationIds: ['n-here'] })) });
    const records = toRecords('dailyPlanning.tasks', store().tasks);
    expect(JSON.stringify([...records.values()])).not.toContain('n-here');
    const back = fromRecords('dailyPlanning.tasks', [], records) as DailyTask[];
    expect(back[0]).toEqual({ ...task(id), notificationIds: [] });
  });
});

// ---------------------------------------------------------------------------
describe('templates', () => {
  test('save a task as a template and start a new one from it', () => {
    const tag = store().addTag('Health')!;
    const id = store().addTask('2026-10-11', 'Gym', { tagIds: [tag], priority: 'medium', estimateMinutes: 45, scheduledTime: '07:00', reminders: [{ id: 'r', minutesBefore: 10 }] })!;
    store().addSubtask(id, 'Pack shoes');
    store().toggleSubtask(id, task(id).subtasks[0].id);
    const tplId = store().saveTaskAsTemplate(id, 'Morning gym')!;
    const newId = store().addTaskFromTemplate('2026-10-12', tplId)!;
    const t = task(newId);
    expect(t).toMatchObject({ title: 'Gym', date: '2026-10-12', tagIds: [tag], priority: 'medium', estimateMinutes: 45, fromTemplateId: tplId });
    expect(t.subtasks).toEqual([expect.objectContaining({ title: 'Pack shoes', done: false })]);
    expect(t.subtasks[0].id).not.toBe(task(id).subtasks[0].id);
    // No time on a template, so its reminder waits until one is set.
    expect(t.reminders).toEqual([]);
  });

  test('a template keeps working after one of its tags is deleted', () => {
    const tag = store().addTag('Gone')!;
    const id = store().addTask('2026-10-11', 'X', { tagIds: [tag] })!;
    const tplId = store().saveTaskAsTemplate(id, '')!;
    store().deleteTag(tag);
    expect(task(store().addTaskFromTemplate('2026-10-12', tplId)!).tagIds).toEqual([]);
  });

  test('starter templates can be used and hidden', () => {
    const starter = STARTER_TASK_TEMPLATES[1];
    const id = store().addTaskFromTemplate('2026-10-11', starter.id)!;
    expect(task(id).subtasks.map((s) => s.title)).toEqual(starter.fields.subtaskTitles);
    store().setStarterTemplateHidden(starter.id, true);
    expect(store().hiddenStarterTemplates).toEqual([starter.id]);
    store().setStarterTemplateHidden(starter.id, false);
    expect(store().hiddenStarterTemplates).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('Plan Builder link still works', () => {
  const plan = () => usePlanStore.getState().plans[0];

  test('a pulled step reads its title and done state live, and "why" starts as the plan\'s motive', () => {
    const p = plan();
    const step = p.steps[0];
    const id = store().addLinkedTask('2026-10-11', p.id, [step.id]);
    expect(task(id).why).toBe(p.motive);
    const before = !!step.done;
    store().toggleTask(id, '2026-10-11');
    expect(!!usePlanStore.getState().plans[0].steps[0].done).toBe(!before);
    expect(resolveTaskDone(task(id), '2026-10-11')).toBe(!before);
    store().toggleTask(id, '2026-10-11'); // put it back
  });

  test('renaming the task renames the step', () => {
    const p = plan();
    const step = p.steps[0];
    const id = store().addLinkedTask('2026-10-11', p.id, [step.id]);
    const original = step.title;
    store().updateTask(id, { title: 'Renamed from Daily Planning' });
    expect(usePlanStore.getState().plans[0].steps[0].title).toBe('Renamed from Daily Planning');
    expect(task(id).title).toBe('');
    store().updateTask(id, { title: original });
  });

  test('pulling the same step twice on a day gives the same task', () => {
    const p = plan();
    const a = store().addLinkedTask('2026-10-11', p.id, [p.steps[0].id]);
    expect(store().addLinkedTask('2026-10-11', p.id, [p.steps[0].id])).toBe(a);
  });
});

// ---------------------------------------------------------------------------
describe('reminder scheduling', () => {
  test('several reminders on a weekdays task: one weekly notification per weekday and reminder', async () => {
    store().addTask('2026-10-12', 'Standup', {
      repeat: 'weekdays',
      scheduledTime: '09:00',
      reminders: [
        { id: 'a', minutesBefore: 10, sound: 'chime' },
        { id: 'b', minutesBefore: 0 },
      ],
    });
    await settle();
    mockScheduled.length = 0;
    await settle();
    expect(mockScheduled).toHaveLength(10);
    expect(new Set(mockScheduled.map((s) => s.repeat))).toEqual(new Set(['weekly']));
    expect([...new Set(mockScheduled.map((s) => weekdayOfISO(s.date)))].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  test('monthly reminders are scheduled a few at a time, skipping done days', () => {
    const t = normalizeTask({ id: 'm', date: '2026-01-31', repeat: 'monthly', completedDates: ['2026-10-31'] });
    const slots = reminderSlots(t, '2026-10-11', false);
    expect(slots.length).toBe(8);
    expect(slots[0]).toEqual({ date: '2026-11-30', repeat: 'none' });
    expect(slots.every((s) => s.repeat === 'none')).toBe(true);
  });

  test('daily and weekly repeat on the phone itself; a one-off fires once and not when done', () => {
    expect(reminderSlots(normalizeTask({ id: 'd', date: '2026-10-01', repeat: 'daily' }), '2026-10-11', false)).toEqual([{ date: '2026-10-01', repeat: 'daily' }]);
    expect(reminderSlots(normalizeTask({ id: 'o', date: '2026-10-20' }), '2026-10-11', false)).toEqual([{ date: '2026-10-20', repeat: 'none' }]);
    expect(reminderSlots(normalizeTask({ id: 'o', date: '2026-10-20' }), '2026-10-11', true)).toEqual([]);
  });

  test('all-day tasks and let-go tasks ring nothing', async () => {
    const a = store().addTask('2026-10-20', 'All day', { allDay: true, scheduledTime: '09:00', reminders: [{ id: 'r', minutesBefore: 5 }] })!;
    const b = store().addTask('2026-10-20', 'Let go', { scheduledTime: '09:00', reminders: [{ id: 'r', minutesBefore: 5 }] })!;
    store().letGo(b, '2026-10-20');
    mockScheduled.length = 0;
    await settle();
    expect(mockScheduled).toEqual([]);
    expect(task(a).notificationIds).toEqual([]);
  });
});
