// Settings → Notifications against the real scheduler, with expo-notifications
// replaced by a recorder: per-feature switches, quiet hours, default sound,
// the denied-mockPermission state, and resync of existing reminders.
let mockNextId = 0;
const mockScheduled = new Map<string, { content: any; trigger: any }>();
let mockPermission = { granted: true, status: 'granted', canAskAgain: true };

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DAILY: 'daily', WEEKLY: 'weekly', DATE: 'date', TIME_INTERVAL: 'timeInterval' },
  AndroidImportance: { HIGH: 4 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => mockPermission),
  requestPermissionsAsync: jest.fn(async () => mockPermission),
  scheduleNotificationAsync: jest.fn(async (req: { content: any; trigger: any }) => {
    const id = `n${++mockNextId}`;
    mockScheduled.set(id, req);
    return id;
  }),
  cancelScheduledNotificationAsync: jest.fn(async (id: string) => {
    mockScheduled.delete(id);
  }),
}));

import { useSettingsStore, DEFAULT_SETTINGS } from '../../store/useSettingsStore';
import { useDailyPlanningStore } from '../../store/useDailyPlanningStore';
import { useSleepStore } from '../../store/useSleepStore';
import { getNotificationPermission, scheduleReminder } from '../notifications';
import { resyncFeature, syncWeeklyStoryReminder } from '../reminders';
import { addDaysISO, todayISO } from '../date';

const tomorrow = addDaysISO(todayISO(), 1);

beforeEach(() => {
  mockScheduled.clear();
  mockPermission = { granted: true, status: 'granted', canAskAgain: true };
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, notify: { ...DEFAULT_SETTINGS.notify }, quietHours: { ...DEFAULT_SETTINGS.quietHours } });
});

const base = { title: 'Water plants', date: tomorrow, minutesBefore: 0, repeat: 'none' as const };

describe('per-feature switches', () => {
  test('a feature that is off schedules nothing', async () => {
    useSettingsStore.getState().setNotify('habits', false);
    expect(await scheduleReminder({ ...base, feature: 'habits', scheduledTime: '09:00' })).toEqual([]);
    expect(mockScheduled.size).toBe(0);
  });

  test('the weekly story is off by default and only scheduled once switched on', async () => {
    await syncWeeklyStoryReminder();
    expect(mockScheduled.size).toBe(0);
    useSettingsStore.getState().setNotify('weeklyStory', true);
    await syncWeeklyStoryReminder();
    expect(mockScheduled.size).toBe(1);
    expect(useSettingsStore.getState().weeklyStoryNotificationIds).toHaveLength(1);
    useSettingsStore.getState().setNotify('weeklyStory', false);
    await syncWeeklyStoryReminder();
    expect(mockScheduled.size).toBe(0);
  });

  test('turning task reminders off cancels existing ones, and on restores them', async () => {
    const store = useDailyPlanningStore.getState();
    store.addTask(tomorrow, 'Call the bank', { scheduledTime: '10:00' });
    const task = () => useDailyPlanningStore.getState().tasks.find((t) => t.title === 'Call the bank')!;
    useDailyPlanningStore.getState().setReminder(task().id, 15);
    await useDailyPlanningStore.getState().resyncAllReminders();
    expect(task().notificationIds).toHaveLength(1);
    expect(mockScheduled.size).toBeGreaterThan(0);

    useSettingsStore.getState().setNotify('tasks', false);
    await resyncFeature('tasks');
    expect(task().notificationIds).toEqual([]);
    expect([...mockScheduled.values()].some((n) => n.content.title === 'Call the bank')).toBe(false);

    useSettingsStore.getState().setNotify('tasks', true);
    await resyncFeature('tasks');
    expect(task().notificationIds).toHaveLength(1);
    expect([...mockScheduled.values()].some((n) => n.content.title === 'Call the bank')).toBe(true);
  });

  test('sleep reminders keep their own on/off when the feature switch toggles', async () => {
    await useSleepStore.getState().setBedtime('22:30', true);
    expect(useSleepStore.getState().bedtime.notificationIds).toHaveLength(1);
    useSettingsStore.getState().setNotify('sleep', false);
    await resyncFeature('sleep');
    expect(useSleepStore.getState().bedtime.notificationIds).toEqual([]);
    expect(useSleepStore.getState().bedtime.enabled).toBe(true); // the user's own choice is kept
    useSettingsStore.getState().setNotify('sleep', true);
    await resyncFeature('sleep');
    expect(useSleepStore.getState().bedtime.notificationIds).toHaveLength(1);
  });
});

describe('quiet hours', () => {
  beforeEach(() => useSettingsStore.getState().setQuietHours({ enabled: true, start: '22:00', end: '07:00' }));

  test('an optional reminder inside quiet hours is delayed to the end', async () => {
    const [id] = await scheduleReminder({ ...base, feature: 'habits', scheduledTime: '23:30' });
    const fire: Date = mockScheduled.get(id)!.trigger.date;
    expect(fire.getHours()).toBe(7);
    expect(fire.getMinutes()).toBe(0);
    expect(fire.getDate()).toBe(new Date(`${addDaysISO(tomorrow, 1)}T00:00:00`).getDate());
  });

  test('a daily optional reminder moves its time', async () => {
    const [id] = await scheduleReminder({ ...base, feature: 'sleep', scheduledTime: '22:15', repeat: 'daily' });
    expect(mockScheduled.get(id)!.trigger).toMatchObject({ type: 'daily', hour: 7, minute: 0 });
  });

  test('explicit alarms ring through by default', async () => {
    const [id] = await scheduleReminder({ ...base, feature: 'tasks', alarm: true, scheduledTime: '23:30' });
    const fire: Date = mockScheduled.get(id)!.trigger.date;
    expect(fire.getHours()).toBe(23);
    expect(fire.getMinutes()).toBe(30);
  });

  test('...unless the user includes alarms', async () => {
    useSettingsStore.getState().setQuietHours({ includeAlarms: true });
    const [id] = await scheduleReminder({ ...base, feature: 'tasks', alarm: true, scheduledTime: '23:30' });
    expect((mockScheduled.get(id)!.trigger.date as Date).getHours()).toBe(7);
  });

  test('outside quiet hours nothing moves', async () => {
    const [id] = await scheduleReminder({ ...base, feature: 'habits', scheduledTime: '12:00' });
    expect((mockScheduled.get(id)!.trigger.date as Date).getHours()).toBe(12);
  });
});

describe('sound and permission', () => {
  test('task alarms use the default alarm sound unless the task picks one', async () => {
    useSettingsStore.getState().set('defaultAlarmSound', 'ping');
    const [a] = await scheduleReminder({ ...base, feature: 'tasks', alarm: true, scheduledTime: '12:00' });
    const [b] = await scheduleReminder({ ...base, feature: 'tasks', alarm: true, scheduledTime: '12:00', soundId: 'chime' });
    expect(mockScheduled.get(a)!.content.sound).toBe('ping.wav');
    expect(mockScheduled.get(b)!.content.sound).toBe('chime.wav');
  });

  test('a denied permission is reported (so Settings can show the fix) and nothing is scheduled', async () => {
    mockPermission = { granted: false, status: 'denied', canAskAgain: false };
    expect(await getNotificationPermission()).toEqual({ state: 'denied', canAskAgain: false });
    expect(await scheduleReminder({ ...base, feature: 'tasks', alarm: true, scheduledTime: '12:00' })).toEqual([]);
    expect(mockScheduled.size).toBe(0);
  });
});
