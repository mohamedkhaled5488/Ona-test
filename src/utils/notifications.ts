import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type * as NotificationsType from 'expo-notifications';
import type { AlarmSoundId } from '../types/sections';
import { alarmSoundOptions } from '../data/alarmSounds';
import { useSettingsStore, type NotificationFeature } from '../store/useSettingsStore';
import { applyQuietHours, applyQuietHoursToDate } from './quietHours';
import { reminderFireDate } from './date';
import { isDemo } from './dataSpace';

const isSupported = Platform.OS !== 'web';

// Loaded lazily so a problem with the native module can never break app
// startup — reminders just quietly do nothing.
//
// Confirmed by hitting it directly: on Android inside Expo Go, `require`-ing
// expo-notifications kicks off an async, fire-and-forget push-token
// auto-registration side effect (DevicePushTokenAutoRegistration.fx.js) that
// throws — sometimes well after this module was required, whenever its
// internal storage read resolves, which is why it can surface on any screen,
// not just at startup. Being async, it's an unhandled rejection, not a thrown
// exception at the `require()` call site — no try/catch around that call can
// ever catch it. The only real fix is to never `require` the module there at
// all. Checked against the raw string (not the ExecutionEnvironment enum
// import, which — despite matching the SDK docs — didn't reliably prevent
// this in practice) plus the older `appOwnership` field as a second signal,
// since either alone turned out not to be trustworthy enough for something
// this consequential to get wrong. iOS Expo Go and any dev/production build
// on either platform are unaffected.
// Belt-and-suspenders on top of the environment check below: this exact
// message ("expo-notifications: ... removed from Expo Go ...") has surfaced
// as a fatal red-screen crash twice despite the environment check that's
// supposed to prevent it from ever loading in the first place — so as a
// last-resort safety net, neutralize *this specific, known-harmless* error
// globally, however it manages to occur, instead of letting it take down the
// app. Call once, as early as possible (before any other import that might
// transitively load expo-notifications).
export function installExpoGoPushCrashGuard(): void {
  const g = globalThis as { ErrorUtils?: { setGlobalHandler: (h: (e: unknown, isFatal?: boolean) => void) => void; getGlobalHandler?: () => (e: unknown, isFatal?: boolean) => void } };
  if (!g.ErrorUtils) return;
  const previousHandler = g.ErrorUtils.getGlobalHandler?.();
  g.ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('removed from Expo Go') && message.includes('expo-notifications')) {
      console.warn('[notifications] Suppressed known Expo Go push-registration error:', message);
      return;
    }
    previousHandler?.(error, isFatal);
  });
}

let cached: typeof NotificationsType | null | undefined;
function getNotifications(): typeof NotificationsType | null {
  if (cached !== undefined) return cached;
  const isExpoGo =
    (Constants.executionEnvironment as string | undefined) === 'storeClient' ||
    (Constants as unknown as { appOwnership?: string }).appOwnership === 'expo';
  if (isExpoGo && Platform.OS === 'android') {
    cached = null;
    return cached;
  }
  try {
    cached = require('expo-notifications') as typeof NotificationsType;
  } catch {
    cached = null;
  }
  return cached;
}
// On Android 8+, a notification's sound is fixed by its channel, not by the
// per-notification content — so each alarm sound option gets its own channel,
// created once up front, and scheduling just picks the matching channel id.
function channelIdFor(soundId: AlarmSoundId | undefined): string {
  return `reminders-${soundId ?? 'default'}`;
}

export async function initNotifications(): Promise<void> {
  if (!isSupported) return;
  try {
    const Notifications = getNotifications();
    if (!Notifications) return;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      await Promise.all(
        alarmSoundOptions.map((option) =>
          Notifications.setNotificationChannelAsync(channelIdFor(option.id), {
            name: `Task reminders — ${option.label}`,
            importance: Notifications.AndroidImportance.HIGH,
            sound: option.fileName ?? 'default',
          })
        )
      );
    }
  } catch {
    // Notifications are a convenience; never let setup break the app.
  }
}


export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function getNotificationPermission(): Promise<{ state: PermissionState; canAskAgain: boolean }> {
  const Notifications = isSupported ? getNotifications() : null;
  if (!Notifications) return { state: 'unsupported', canAskAgain: false };
  try {
    const p = await Notifications.getPermissionsAsync();
    return { state: p.granted ? 'granted' : (p.status as PermissionState), canAskAgain: p.canAskAgain };
  } catch {
    return { state: 'unsupported', canAskAgain: false };
  }
}

async function ensurePermission(): Promise<boolean> {
  try {
    const Notifications = getNotifications();
    if (!Notifications) return false;
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const asked = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    return asked.granted;
  } catch {
    return false;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isSupported || isDemo()) return false;
  return ensurePermission();
}

export interface ReminderInput {
  // Which Settings → Notifications switch this belongs to. When it's off,
  // nothing is scheduled.
  feature: NotificationFeature;
  // An alarm the user set on purpose (task alarm, wake alarm) — rings
  // through quiet hours unless the user included alarms.
  alarm?: boolean;
  title: string;
  date: string; // ISO date of the (first) occurrence
  scheduledTime: string; // HH:MM
  minutesBefore: number;
  // The phone repeats daily and weekly reminders itself; other task repeat
  // rules are scheduled as dated ones (see utils/taskRepeat.ts).
  repeat: 'none' | 'daily' | 'weekly';
  soundId?: AlarmSoundId; // undefined = the default alarm sound from Settings
}

// Local notification sounds are referenced by bundled base filename (see the
// expo-notifications plugin config in app.json, which registers these files
// at build time). 'default' plays the system's own sound.
function resolveSoundFile(soundId: AlarmSoundId | undefined): string | undefined {
  return alarmSoundOptions.find((o) => o.id === soundId)?.fileName;
}

function featureOn(feature: NotificationFeature): boolean {
  return useSettingsStore.getState().notify[feature];
}

// Returns the scheduled notification ids (empty if nothing was scheduled).
export async function scheduleReminder(input: ReminderInput): Promise<string[]> {
  // Demo mode never schedules anything (and so never touches real alarms).
  if (!isSupported || isDemo()) return [];
  if (!featureOn(input.feature)) return [];
  if (!(await ensurePermission())) return [];
  const Notifications = getNotifications();
  if (!Notifications) return [];
  const { quietHours, defaultAlarmSound } = useSettingsStore.getState();

  const fire = applyQuietHoursToDate(reminderFireDate(input.date, input.scheduledTime, input.minutesBefore), quietHours, !!input.alarm);

  const soundId = input.soundId ?? defaultAlarmSound;
  const soundFile = resolveSoundFile(soundId);
  const content = {
    title: input.title || 'Task reminder',
    body: input.minutesBefore === 0 ? `Scheduled for ${input.scheduledTime}` : `Starts at ${input.scheduledTime}`,
    sound: soundFile ?? true, // true = the system's default notification sound (iOS)
    ...(Platform.OS === 'android' ? { channelId: channelIdFor(soundId) } : {}),
  };

  try {
    let trigger: NotificationsType.NotificationTriggerInput;
    if (input.repeat === 'daily') {
      trigger = { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: fire.getHours(), minute: fire.getMinutes() };
    } else if (input.repeat === 'weekly') {
      trigger = {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: fire.getDay() + 1,
        hour: fire.getHours(),
        minute: fire.getMinutes(),
      };
    } else {
      if (fire.getTime() <= Date.now()) return [];
      trigger = { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fire };
    }
    const id = await Notifications.scheduleNotificationAsync({ content, trigger });
    return [id];
  } catch {
    return [];
  }
}

// A one-off notification at an exact moment (the end of a study block).
export async function scheduleAt(
  at: Date,
  feature: NotificationFeature,
  title: string,
  body: string,
  alarm = false
): Promise<string[]> {
  if (!isSupported || isDemo() || !featureOn(feature)) return [];
  const Notifications = getNotifications();
  if (!Notifications) return [];
  try {
    // Never prompts here — the user was asked when they first turned reminders on.
    if (!(await Notifications.getPermissionsAsync()).granted) return [];
    const fire = applyQuietHoursToDate(at, useSettingsStore.getState().quietHours, alarm);
    if (fire.getTime() <= Date.now()) return [];
    const id = await Notifications.scheduleNotificationAsync({
      content: { title, body, ...(Platform.OS === 'android' ? { channelId: channelIdFor(undefined) } : {}) },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fire },
    });
    return [id];
  } catch {
    return [];
  }
}

// The optional "Your week in Ona" nudge — off unless the user turns it on.
// Fires on the first day of their week, in the evening (moved by quiet hours
// if they cover it). `weekday` uses JS getDay numbering (0 = Sunday).
export async function scheduleWeeklyStoryReminder(weekday: number): Promise<string[]> {
  if (!isSupported || isDemo() || !featureOn('weeklyStory')) return [];
  if (!(await ensurePermission())) return [];
  const Notifications = getNotifications();
  if (!Notifications) return [];
  const t = applyQuietHours({ hour: 18, minute: 0 }, useSettingsStore.getState().quietHours, false);
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Your week in Ona',
        body: 'A short look back at last week is ready whenever you are.',
        ...(Platform.OS === 'android' ? { channelId: channelIdFor(undefined) } : {}),
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: ((weekday + (t.nextDay ? 1 : 0)) % 7) + 1, hour: t.hour, minute: t.minute },
    });
    return [id];
  } catch {
    return [];
  }
}

// Settings → Notifications → "Send test notification". User-initiated, so it
// ignores the per-feature switches and quiet hours.
export async function sendTestNotification(): Promise<boolean> {
  if (!isSupported || isDemo()) return false;
  if (!(await ensurePermission())) return false;
  const Notifications = getNotifications();
  if (!Notifications) return false;
  const soundId = useSettingsStore.getState().defaultAlarmSound;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Test from Ona',
        body: 'Notifications are working.',
        sound: resolveSoundFile(soundId) ?? true,
        ...(Platform.OS === 'android' ? { channelId: channelIdFor(soundId) } : {}),
      },
      trigger: null,
    });
    return true;
  } catch {
    return false;
  }
}

export async function cancelReminders(ids: string[]): Promise<void> {
  const Notifications = getNotifications();
  // Demo ids are never real notifications; never cancel anything from demo.
  if (!isSupported || isDemo() || !Notifications) return;
  await Promise.all(
    ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined))
  );
}
