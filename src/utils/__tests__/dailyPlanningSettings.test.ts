// Daily Planning v2, stage 6: Settings → Daily Planning. Defaults for new
// tasks, the pages for tags, templates and the let-go archive, and that they
// are reachable.
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

const fs = require('fs') as { readFileSync: (p: string, e: string) => string };
const path = require('path') as { join: (...p: string[]) => string };

import { DEFAULT_SETTINGS, withDefaults } from '../../store/useSettingsStore';
import { PAGE_TITLES } from '../../screens/settings/pages';
import { useDailyPlanningStore } from '../../store/useDailyPlanningStore';
import { letGoArchive, occursOn } from '../taskRepeat';

const store = () => useDailyPlanningStore.getState();
const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');

beforeEach(() => useDailyPlanningStore.setState({ tasks: [], tags: [], taskTemplates: [], hiddenStarterTemplates: [] }));

test('new settings start calm: no default reminder or estimate; the planning days card on; feelings "Important or tagged"; "before" off', () => {
  expect(DEFAULT_SETTINGS).toMatchObject({
    dailyDefaultReminder: null,
    dailyDefaultEstimate: null,
    planningStreakCard: true,
    taskFeelingMode: 'auto',
    taskFeelingBefore: false,
    dailyDefaultView: 'list',
  });
  // Saved settings from before these existed get them filled in.
  expect(withDefaults({ theme: 'dark' })).toMatchObject({ dailyDefaultReminder: null, dailyDefaultEstimate: null, theme: 'dark' });
  expect(withDefaults({ dailyDefaultReminder: 10 }).dailyDefaultReminder).toBe(10);
});

test('every Daily Planning setting from the spec is on its settings page', () => {
  const src = read('src/screens/settings/PreferencePages.tsx');
  const dp = src.slice(src.indexOf("case 'dailyPlanning':"), src.indexOf("case 'journaling':"));
  for (const key of ['dailyDefaultReminder', 'defaultAlarmSound', 'weekStartsOn', 'dailyDefaultView', 'taskFeelingMode', 'taskFeelingBefore', 'dailyDefaultEstimate', 'planningStreakCard']) {
    expect(dp).toContain(`'${key}'`);
  }
  for (const page of ['dpTags', 'dpTemplates', 'dpArchive']) expect(dp).toContain(`go('${page}')`);
});

test('the tags, templates and archive pages are registered and titled', () => {
  expect(PAGE_TITLES).toMatchObject({ dpTags: 'Tags', dpTemplates: 'Task templates', dpArchive: 'Let go' });
  const router = read('src/screens/SettingsScreen.tsx');
  expect(router).toMatch(/case 'dpTags':\s*return <TagsPage \/>/);
  expect(router).toMatch(/case 'dpTemplates':\s*return <TemplatesPage \/>/);
  expect(router).toMatch(/case 'dpArchive':\s*return <ArchivePage \/>/);
});

test('defaults are applied to new tasks only (the page and quick add), never to existing ones', () => {
  const page = read('src/screens/TaskEditorScreen.tsx');
  expect(page).toMatch(/dailyDefaultEstimate/);
  expect(page).toMatch(/const addDefault = !original && time && !form\.scheduledTime && form\.reminders\.length === 0 && lead !== null/);
  const day = read('src/screens/DailyPlanningScreen.tsx');
  expect(day).toMatch(/newTaskTime && dailyDefaultReminder !== null/);
});

describe('the let-go archive', () => {
  test('lists let-go days newest first; putting one back restores its day', () => {
    const a = store().addTask('2026-10-01', 'Old idea')!;
    const b = store().addTask('2026-10-05', 'Another')!;
    store().letGo(a, '2026-10-01');
    store().letGo(b, '2026-10-05');
    expect(letGoArchive(store().tasks).map((x) => x.task.id)).toEqual([b, a]);
    store().undoLetGo(a, '2026-10-01');
    const t = store().tasks.find((x) => x.id === a)!;
    expect(occursOn(t, '2026-10-01')).toBe(true);
    expect(letGoArchive(store().tasks).map((x) => x.task.id)).toEqual([b]);
  });

  test('"Bring back to today" moves a one-off to today', () => {
    const a = store().addTask('2026-10-01', 'Old idea')!;
    store().letGo(a, '2026-10-01');
    store().undoLetGo(a, '2026-10-01');
    store().rescheduleTask(a, '2026-10-01', '2026-10-11', undefined);
    expect(store().tasks.find((x) => x.id === a)).toMatchObject({ date: '2026-10-11', letGoDates: [] });
  });

  test('one let-go day of a repeating task is listed on its own and the series keeps going', () => {
    const r = store().addTask('2026-10-01', 'Stretch', { repeat: 'daily' })!;
    store().letGo(r, '2026-10-03');
    const t = store().tasks.find((x) => x.id === r)!;
    expect(letGoArchive(store().tasks)).toEqual([{ task: t, date: '2026-10-03' }]);
    expect(occursOn(t, '2026-10-04')).toBe(true);
  });
});

test('dialogs on the settings pages open after their sheet closes (a dialog over a sheet can hide behind it)', () => {
  const src = read('src/screens/settings/DailyPlanningPages.tsx');
  for (const fn of ['const remove = () => {', 'const mergeInto = (into: TaskTag) => {']) {
    const body = src.slice(src.indexOf(fn), src.indexOf(fn) + 120);
    expect(body).toMatch(/onClose\(\);\s*showDialog/);
  }
});
