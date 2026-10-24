// A1: the Sleep wake-up reminder (and every reminder) is an honest, gentle
// notification: it carries the sound the person chose, Android plays it on
// the alarm volume (heard on silent), old Android channels are migrated once,
// editing or turning it off cancels the old one, and nothing in the app calls
// it an alarm or claims it fades in. IDs: docs/test-cases/integration.md (REM-*)
let mockNextId = 0;
const mockScheduled = new Map<string, { content: Record<string, unknown>; trigger: Record<string, unknown> }>();
const mockChannels = new Map<string, Record<string, unknown>>();
const mockDeleted: string[] = [];
jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DAILY: 'daily', WEEKLY: 'weekly', DATE: 'date', TIME_INTERVAL: 'timeInterval' },
  AndroidImportance: { HIGH: 4 },
  AndroidAudioUsage: { ALARM: 4 },
  AndroidAudioContentType: { SONIFICATION: 4 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async (id: string, ch: Record<string, unknown>) => void mockChannels.set(id, ch)),
  deleteNotificationChannelAsync: jest.fn(async (id: string) => void mockDeleted.push(id)),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted', canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted', canAskAgain: true })),
  scheduleNotificationAsync: jest.fn(async (req: { content: Record<string, unknown>; trigger: Record<string, unknown> }) => {
    const id = `n${++mockNextId}`;
    mockScheduled.set(id, req);
    return id;
  }),
  cancelScheduledNotificationAsync: jest.fn(async (id: string) => void mockScheduled.delete(id)),
}));

import { Platform } from 'react-native';
import { initNotifications, channelIdFor, LEGACY_CHANNEL_IDS } from '../notifications';
import { migrateReminderChannels } from '../reminders';
import { useSleepStore } from '../../store/useSleepStore';
import { useSettingsStore, DEFAULT_SETTINGS } from '../../store/useSettingsStore';
import { setDataSpace } from '../dataSpace';
import { alarmSoundOptions } from '../../data/alarmSounds';
import { PHONE_CLOCK_NOTE } from '../../config/reminderWording';

const fs = require('fs') as { readFileSync: (p: string, e: string) => string };
const path = require('path') as { join: (...p: string[]) => string };
const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');
const scheduled = () => [...mockScheduled.values()];

// Android: channels, and the alarm volume.
Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });

beforeEach(() => {
  mockScheduled.clear();
  mockChannels.clear();
  mockDeleted.length = 0;
  setDataSpace('real');
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, notify: { ...DEFAULT_SETTINGS.notify } });
  useSleepStore.setState({ wakeAlarm: { time: undefined, enabled: false, fadeInMinutes: 10, notificationIds: [] } } as never);
});

describe('REM: the sound the person chose is the sound that plays', () => {
  test('REM-001 setting the wake-up reminder schedules it daily with the chosen sound and its channel', async () => {
    await useSleepStore.getState().setWakeSound('chime');
    await useSleepStore.getState().setWakeAlarm('07:00', true);
    expect(scheduled()).toHaveLength(1);
    const { content, trigger } = scheduled()[0];
    expect(content).toMatchObject({ sound: 'chime.wav', channelId: channelIdFor('chime') });
    expect(trigger).toMatchObject({ type: 'daily', hour: 7, minute: 0 });
  });

  test('REM-002 without its own sound, it uses the default reminder sound from Settings', async () => {
    useSettingsStore.setState({ defaultAlarmSound: 'ascend' });
    await useSleepStore.getState().setWakeAlarm('06:30', true);
    expect(scheduled()[0].content).toMatchObject({ sound: 'ascend.wav', channelId: channelIdFor('ascend') });
  });

  test('REM-003 changing the sound or the time replaces the old reminder; turning it off leaves nothing scheduled', async () => {
    await useSleepStore.getState().setWakeAlarm('07:00', true);
    await useSleepStore.getState().setWakeSound('ping');
    expect(scheduled().map((r) => r.content.sound)).toEqual(['ping.wav']);
    await useSleepStore.getState().setWakeAlarm('07:30', true);
    expect(scheduled().map((r) => r.trigger.minute)).toEqual([30]);
    await useSleepStore.getState().setWakeAlarm(undefined, false);
    expect(scheduled()).toEqual([]);
  });
});

describe('REM: Android channels', () => {
  test('REM-010 one channel per sound, on the alarm volume (heard on silent), high importance, shown on the lock screen', async () => {
    await initNotifications();
    for (const opt of alarmSoundOptions) {
      expect(mockChannels.get(channelIdFor(opt.id))).toMatchObject({
        importance: 4,
        sound: opt.fileName ?? 'default',
        audioAttributes: { usage: 4, contentType: 4 },
        lockscreenVisibility: 1,
      });
    }
    // Versioned ids, so a change of channel settings can't be silently ignored.
    expect(channelIdFor('chime')).toMatch(/^ona-reminder-v\d+-chime$/);
    expect(LEGACY_CHANNEL_IDS).toContain('reminders-chime');
  });

  test('REM-011 the one-time move: every reminder is rescheduled on the new channels, then the old channels are removed; never twice', async () => {
    useSleepStore.setState({ wakeAlarm: { time: '07:00', enabled: true, fadeInMinutes: 10, notificationIds: ['old-1'], sound: 'chime' } } as never);
    expect(await migrateReminderChannels()).toBe(true);
    const channels = scheduled().map((r) => r.content.channelId as string);
    expect(channels).toContain(channelIdFor('chime')); // the wake-up reminder, with its sound
    expect(channels.filter((c) => LEGACY_CHANNEL_IDS.includes(c))).toEqual([]); // nothing left on an old channel
    expect(mockDeleted.sort()).toEqual([...LEGACY_CHANNEL_IDS].sort());
    expect(useSettingsStore.getState().reminderChannelVersion).toBe(2);
    mockDeleted.length = 0;
    expect(await migrateReminderChannels()).toBe(false);
    expect(mockDeleted).toEqual([]);
  });
});

describe('REM: honest wording', () => {
  const UI = ['src/screens/SleepScreen.tsx', 'src/screens/TaskEditorScreen.tsx', 'src/screens/DailyPlanningScreen.tsx', 'src/screens/settings/NotificationsPage.tsx', 'src/screens/settings/PreferencePages.tsx', 'src/screens/SettingsScreen.tsx', 'src/config/reminderWording.ts'];
  // Visible text only: string literals and JSX text.
  const visibleText = (src: string) =>
    [...src.replace(/\/\/.*$/gm, '').matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`|>([^<>{}]+)</g)]
      .map((m) => m[1] ?? m[2] ?? m[3] ?? m[4] ?? '')
      .filter((t) => /\s/.test(t) && /[a-z]/i.test(t));

  test('REM-020 no reminder is called an alarm, and nothing claims to fade in or ring until dismissed', () => {
    const found: string[] = [];
    for (const f of UI) {
      for (const t of visibleText(read(f))) {
        // Allowed: Android's own setting ("Alarms & reminders") and the phone's
        // "alarm volume". The Sleep sound timer's fade-out is real and stays.
        const plain = t.replace(/Alarms & reminders/g, '').replace(/alarm volume/gi, '');
        if (/\balarms?\b/i.test(plain) || /fades? in|until (you )?dismiss|rings? until/i.test(t)) found.push(`${f}: "${t.slice(0, 80)}"`);
      }
    }
    expect(found).toEqual([]);
  });

  test('REM-021 "For important wake-ups, use your phone\'s clock." sits next to the Sleep, task and Settings reminder sounds', () => {
    expect(PHONE_CLOCK_NOTE).toBe("For important wake-ups, use your phone's clock.");
    for (const f of ['src/screens/SleepScreen.tsx', 'src/screens/TaskEditorScreen.tsx', 'src/screens/DailyPlanningScreen.tsx', 'src/screens/settings/NotificationsPage.tsx']) {
      expect({ f, shown: read(f).includes('PHONE_CLOCK_NOTE') }).toEqual({ f, shown: true });
    }
  });

  test('REM-022 the exact-timing permission is declared, so "Allow exact reminders" lists Ona', () => {
    expect(JSON.parse(read('app.json')).expo.android.permissions).toContain('android.permission.SCHEDULE_EXACT_ALARM');
  });
});
