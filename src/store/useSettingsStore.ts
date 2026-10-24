// The one settings store for the whole app. Every section reads its settings
// from here, and Settings (screens/SettingsScreen.tsx) is the only place they
// are edited — a section's own "Section settings" link opens that same page.
//
// Persisted on the device (AsyncStorage), versioned, and migrated on app
// updates. Settings never need an account and are never paywalled.
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { spaceKey } from '../utils/dataSpace';
import type { AlarmSoundId, AmbientSound, JournalFont, JournalPageStyle, SectionId } from '../types/sections';
import type { AccentId, TextSize } from '../theme/runtime';
import type { PatternsView } from '../utils/feelingsStats';
import { DEFAULT_DAY_VIEW, type DayViewPrefs } from '../utils/dayView';

export type WeekStart = 0 | 1 | 6; // Sunday, Monday, Saturday (JS getDay numbering)
export type ThemeChoice = 'system' | 'light' | 'dark';
export type NotificationFeature = 'tasks' | 'habits' | 'studyEnd' | 'sleep' | 'weeklyStory';
export type FeatureFlagId = 'recapAreaPages' | 'recapStory' | 'lifetimeEnabled' | 'foundersEnabled' | 'redeemCodeEnabled' | 'planReviewReminders';

// The first day of the week from the device locale, when the platform
// exposes it (Intl.Locale weekInfo); Monday otherwise.
export function localeWeekStart(): WeekStart {
  try {
    const locale = new (Intl as any).Locale(Intl.DateTimeFormat().resolvedOptions().locale);
    const first: number | undefined = locale.weekInfo?.firstDay ?? locale.getWeekInfo?.().firstDay;
    if (first === 7) return 0;
    if (first === 6) return 6;
    return 1;
  } catch {
    return 1;
  }
}

export interface QuietHours {
  enabled: boolean;
  start: string; // HH:MM
  end: string; // HH:MM
  // Alarms the user set on purpose (task alarms, the wake alarm, a study
  // timer) ring through quiet hours unless this is on.
  includeAlarms: boolean;
}

export interface Consent {
  // Needed for sync. Asked for explicitly at account creation; off until then.
  storeData: boolean;
  analytics: boolean; // generic events only, never feelings/habits content
  tips: boolean;
}

// Everything that is a setting — plain data, persisted as-is.
export interface SettingsData {
  // Appearance
  theme: ThemeChoice;
  accent: AccentId;
  textSize: TextSize;
  weekStartsOn: WeekStart;
  timeFormat: 'system' | '12h' | '24h';
  haptics: boolean;

  // Notifications — master switches over the reminders the user created
  // in each section. Nothing is ever scheduled that the user didn't set up.
  notify: Record<NotificationFeature, boolean>;
  defaultAlarmSound: AlarmSoundId;
  quietHours: QuietHours;
  weeklyStoryNotificationIds: string[];
  // Which version of Android's reminder sound channels this phone's
  // scheduled reminders use (see migrateReminderChannels in utils/reminders.ts).
  reminderChannelVersion: number;

  // Privacy — three separate consents, never bundled.
  consent: Consent;

  // Security. PINs themselves live hashed in secure storage (utils/pinLock.ts);
  // these only say whether each lock is on.
  journalLock: boolean;
  journalLockBiometrics: boolean;
  appLock: boolean;
  appLockBiometrics: boolean;
  hideInRecents: boolean; // blur/hide Ona's preview in the app switcher
  blockSensitiveScreenshots: boolean; // Journaling, Feelings, Quit

  // Sound (one shared engine for Study and Sleep)
  backgroundAudio: boolean;
  // How Ona behaves when another app starts playing sound.
  interruption: 'pause' | 'lower';
  defaultStudySound: AmbientSound;
  defaultSleepTimerMinutes: number | null; // null = no timer
  defaultFadeOutMinutes: number;

  // Sections
  // Daily Planning: when to ask "How do you feel?" after finishing a task.
  // 'auto' = after medium/high priority or tagged tasks, never quick ones.
  taskFeelingMode: TaskFeelingMode;
  taskFeelingBefore: boolean; // also ask before starting a task (off by default)
  // Habits, Skills and Quit: when to offer the optional "How do you feel?" sheet.
  habitFeelingAsk: FeelingAsk; // after a Build habit is done
  skillFeelingAsk: FeelingAsk; // after a practice session
  quitFeelingAsk: FeelingAsk; // after a resisted urge or a slip (offered softly, never a required step)
  dailyDefaultView: 'list' | 'timeline';
  taskPageMoreOpen: boolean; // the task page's "More options", as the user last left it
  welcomeSeen: boolean; // the first-run screen has been passed (or this isn't a fresh install)
  // Discover tour, on this phone only: the last slide seen (to resume) and whether it was finished.
  discoverLastSlide: string;
  discoverTourDone: boolean;
  dailyViewPrefs: DayViewPrefs; // the day list's group, sort and filters, as last left
  dailyAvailableMinutes: number; // "Plan my day": how much time a day usually has for tasks
  dailyDefaultReminder: number | null; // minutes before; added when a new task gets a start time (null = none)
  dailyDefaultEstimate: number | null; // minutes; filled in on new tasks (null = none)
  planningInsights: { range: 'week' | 'month' | 'quarter' | 'custom'; custom: { start: string; end: string } | null; tagIds: string[]; compare: boolean };
  planningStreakCard: boolean; // the calm planning-days card in Insights (optional)
  weeklyReviewDismissed: string; // week start of the Recap weekly review last dismissed
  feelingsAskIntensity: boolean; // Identify the Feeling
  feelingsTwoWords: boolean;
  feelingsReasonTags: boolean;
  feelingsPatternsDefault: PatternsView;
  quitUrgeMinutes: number; // Quit a Habit: urge-timer length
  studyDefaultPreset: string; // Study: id from data/studyPresets
  bookTrackBy: 'pages' | 'percent';
  budgetCurrency: string; // prefills the inline selector
  budgetWarnAt: 80 | 90 | 100; // percent of a limit
  journalPageStyle: JournalPageStyle; // Journaling: default page (also changed from the writing page)
  journalDefaultFont: JournalFont;
  journalPrompts: boolean;
  journalOnThisDay: boolean;
  bookFeelingAfterSession: boolean; // Book
  bookShowEstimate: boolean; // Book
  hiddenRecapSections: SectionId[]; // hidden everywhere in Recap, including shared images
  shareSensitiveInRecap: boolean; // shared story cards leave out Feelings and Quit unless on
  recapComparison: boolean; // "+3 vs last week"
  // For people who share their phone: Feelings and Quit stay out of Home
  // (Recap). Off by default; Recap is private on the phone.
  hideSensitiveOnHome: boolean;

  // Developer (debug builds only)
  devFeatureOverrides: Partial<Record<FeatureFlagId, boolean>>;
  devSimulateOffline: boolean;
}

export const DEFAULT_SETTINGS: SettingsData = {
  theme: 'system',
  accent: 'teal',
  textSize: 'system',
  weekStartsOn: localeWeekStart(),
  timeFormat: 'system',
  haptics: true,

  notify: { tasks: true, habits: true, studyEnd: true, sleep: true, weeklyStory: false },
  defaultAlarmSound: 'default',
  quietHours: { enabled: false, start: '22:00', end: '07:00', includeAlarms: false },
  weeklyStoryNotificationIds: [],
  reminderChannelVersion: 1,

  consent: { storeData: false, analytics: false, tips: false },

  journalLock: false,
  journalLockBiometrics: false,
  appLock: false,
  appLockBiometrics: false,
  hideInRecents: false,
  blockSensitiveScreenshots: false,

  backgroundAudio: true,
  interruption: 'lower',
  defaultStudySound: 'none',
  defaultSleepTimerMinutes: null,
  defaultFadeOutMinutes: 5,

  taskFeelingMode: 'auto',
  taskFeelingBefore: false,
  habitFeelingAsk: 'always',
  skillFeelingAsk: 'always',
  quitFeelingAsk: 'never',
  dailyDefaultView: 'list',
  taskPageMoreOpen: false,
  welcomeSeen: false,
  discoverLastSlide: '',
  discoverTourDone: false,
  dailyViewPrefs: DEFAULT_DAY_VIEW,
  dailyAvailableMinutes: 480,
  dailyDefaultReminder: null,
  dailyDefaultEstimate: null,
  planningInsights: { range: 'month', custom: null, tagIds: [], compare: false },
  planningStreakCard: true,
  weeklyReviewDismissed: '',
  feelingsAskIntensity: true,
  feelingsTwoWords: true,
  feelingsReasonTags: true,
  feelingsPatternsDefault: 'month',
  quitUrgeMinutes: 15,
  studyDefaultPreset: 'classic',
  bookTrackBy: 'pages',
  budgetCurrency: 'USD',
  budgetWarnAt: 80,
  journalPageStyle: { background: 'ink', size: 'medium', template: 'lined' },
  journalDefaultFont: 'inter',
  journalPrompts: true,
  journalOnThisDay: true,
  bookFeelingAfterSession: true,
  bookShowEstimate: true,
  hiddenRecapSections: [],
  shareSensitiveInRecap: false,
  recapComparison: true,
  hideSensitiveOnHome: false,

  devFeatureOverrides: {},
  devSimulateOffline: false,
};

// Bump when a stored value changes meaning, and add a step below that turns
// the previous version's data into the new one. New keys don't need a bump:
// anything missing is filled from DEFAULT_SETTINGS on load.
export const SETTINGS_VERSION = 3;

export type TaskFeelingMode = 'auto' | 'always' | 'tagged' | 'never';
// 'sometimes' = only when nothing has been noted for that item in the last few days.
export type FeelingAsk = 'always' | 'sometimes' | 'never';

type Migration = (state: Record<string, unknown>) => Record<string, unknown>;
export const SETTINGS_MIGRATIONS: Record<number, Migration> = {
  // v1 → v2: the weekly story toggle moved under `notify`.
  2: (s) => {
    const { weeklyStoryNotification, ...rest } = s;
    const notify = { ...((rest.notify as object) ?? {}) } as Record<string, unknown>;
    if (typeof weeklyStoryNotification === 'boolean') notify.weeklyStory = weeklyStoryNotification;
    return { ...rest, notify };
  },
  // v2 → v3: the after-task feeling switch became a choice of when to ask.
  3: (s) => {
    const { feelingPromptAfterTasks, ...rest } = s;
    if (feelingPromptAfterTasks === false) rest.taskFeelingMode = 'never';
    return rest;
  },
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Fills anything missing from the defaults and drops keys the app no longer
// knows about, one level deep for grouped settings (notify, quietHours...).
export function withDefaults(stored: Record<string, unknown>): SettingsData {
  const out: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    const value = stored[key];
    if (value === undefined) out[key] = def;
    else if (isPlainObject(def) && isPlainObject(value) && key !== 'devFeatureOverrides') {
      const merged: Record<string, unknown> = {};
      for (const sub of Object.keys(def)) merged[sub] = value[sub] ?? (def as Record<string, unknown>)[sub];
      out[key] = merged;
    } else out[key] = value;
  }
  return out as unknown as SettingsData;
}

export function migrateSettings(
  stored: unknown,
  fromVersion: number,
  migrations: Record<number, Migration> = SETTINGS_MIGRATIONS,
  toVersion: number = SETTINGS_VERSION
): SettingsData {
  let state = isPlainObject(stored) ? { ...stored } : {};
  for (let v = fromVersion + 1; v <= toVersion; v++) {
    const step = migrations[v];
    if (step) state = step(state);
  }
  return withDefaults(state);
}

export function pickSettings(state: SettingsData): SettingsData {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) out[key] = (state as unknown as Record<string, unknown>)[key];
  return out as unknown as SettingsData;
}

export interface SettingsState extends SettingsData {
  // Generic setter — every simple setting goes through this, so there's one
  // write path and no per-setting boilerplate.
  set: <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => void;
  setNotify: (feature: NotificationFeature, on: boolean) => void;
  setQuietHours: (patch: Partial<QuietHours>) => void;
  setConsent: (patch: Partial<Consent>) => void;
  setJournalPageStyle: (patch: Partial<JournalPageStyle>) => void;
  setDevFeature: (flag: FeatureFlagId, on: boolean | undefined) => void;
  resetSettings: () => void;

  // Named setters kept for the sections that already use them.
  setBackgroundAudio: (on: boolean) => void;
  setWeekStartsOn: (day: WeekStart) => void;
  toggleRecapSection: (id: SectionId) => void;
  setShareSensitiveInRecap: (on: boolean) => void;
  setWeeklyStoryNotification: (on: boolean, ids?: string[]) => void;
}

export const SETTINGS_KEY = 'ona.settings';

// The same storage, with every key resolved for the current data space.
export function spacedStorage(storage: StateStorage): StateStorage {
  return {
    getItem: (name) => storage.getItem(spaceKey(name)),
    setItem: (name, value) => storage.setItem(spaceKey(name), value),
    removeItem: (name) => storage.removeItem(spaceKey(name)),
  };
}

export function createSettingsStore(storage: StateStorage) {
  return create<SettingsState>()(
    persist(
      immer((set) => ({
        ...DEFAULT_SETTINGS,

        set: (key, value) => set((s) => { (s as unknown as SettingsData)[key] = value as never; }),
        setNotify: (feature, on) => set((s) => { s.notify[feature] = on; }),
        setQuietHours: (patch) => set((s) => { Object.assign(s.quietHours, patch); }),
        setConsent: (patch) => set((s) => { Object.assign(s.consent, patch); }),
        setJournalPageStyle: (patch) => set((s) => { Object.assign(s.journalPageStyle, patch); }),
        setDevFeature: (flag, on) =>
          set((s) => {
            if (on === undefined) delete s.devFeatureOverrides[flag];
            else s.devFeatureOverrides[flag] = on;
          }),
        resetSettings: () => set((s) => { Object.assign(s, DEFAULT_SETTINGS); }),

        setBackgroundAudio: (on) => set((s) => { s.backgroundAudio = on; }),
        setWeekStartsOn: (day) => set((s) => { s.weekStartsOn = day; }),
        toggleRecapSection: (id) =>
          set((s) => {
            s.hiddenRecapSections = s.hiddenRecapSections.includes(id) ? s.hiddenRecapSections.filter((x) => x !== id) : [...s.hiddenRecapSections, id];
          }),
        setShareSensitiveInRecap: (on) => set((s) => { s.shareSensitiveInRecap = on; }),
        setWeeklyStoryNotification: (on, ids = []) =>
          set((s) => {
            s.notify.weeklyStory = on;
            s.weeklyStoryNotificationIds = ids;
          }),
      })),
      {
        name: SETTINGS_KEY,
        version: SETTINGS_VERSION,
        // Keys go through the data space, so Demo mode has its own settings.
        storage: createJSONStorage(() => spacedStorage(storage)),
        partialize: (state) => pickSettings(state),
        migrate: (persisted, version) => migrateSettings(persisted, version) as unknown as SettingsState,
        // Also fills keys added since the last save, without a version bump.
        merge: (persisted, current) => ({ ...current, ...withDefaults(isPlainObject(persisted) ? persisted : {}) }),
      }
    )
  );
}

export const useSettingsStore = createSettingsStore(AsyncStorage);

// Resolves when stored settings have loaded (immediately if they already have).
export function settingsHydrated(): Promise<void> {
  if (useSettingsStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useSettingsStore.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}
