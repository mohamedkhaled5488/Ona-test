import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { AlarmSoundId, SleepLogEntry, SleepMixLayer, SleepSoundId, WindDownItem } from '../types/sections';
import { defaultWindDownItems } from '../data/sleepSounds';
import { genId } from '../utils/id';
import { todayISO } from '../utils/date';
import { cancelReminders, scheduleReminder } from '../utils/notifications';

const DEFAULT_FADE_OUT_MINUTES = 5;
const DEFAULT_WAKE_FADE_IN_MINUTES = 2;

interface ReminderSlot {
  time?: string; // HH:MM
  enabled: boolean;
  notificationIds: string[];
}

interface SleepState {
  mix: SleepMixLayer[];
  isPlaying: boolean;
  timerMinutes: number | null; // total sleep-timer duration, null = off
  fadeOutMinutes: number;

  windDownItems: WindDownItem[];
  bedtime: ReminderSlot;
  // The wake-up reminder (a gentle notification, not a ringing alarm). The
  // name stays for saved data. fadeInMinutes is kept for old data only:
  // notifications can't fade in.
  wakeAlarm: ReminderSlot & { fadeInMinutes: number; sound?: AlarmSoundId };

  logs: SleepLogEntry[];

  addSoundToMix: (soundId: SleepSoundId) => void;
  removeSoundFromMix: (soundId: SleepSoundId) => void;
  setLayerVolume: (soundId: SleepSoundId, volume: number) => void;
  togglePlaying: () => void;
  setTimerMinutes: (minutes: number | null) => void;
  setFadeOutMinutes: (minutes: number) => void;

  addWindDownItem: (label: string) => void;
  removeWindDownItem: (id: string) => void;
  toggleWindDownItem: (id: string) => void;
  resetWindDownForTonight: () => void;

  setBedtime: (time: string | undefined, enabled: boolean) => Promise<void>;
  setWakeAlarm: (time: string | undefined, enabled: boolean, fadeInMinutes?: number) => Promise<void>;
  setWakeSound: (sound: AlarmSoundId) => Promise<void>;

  logSleep: (date: string, quality: 1 | 2 | 3 | 4 | 5, note: string | undefined) => void;
  deleteLog: (id: string) => void;
}

export const useSleepStore = create<SleepState>()(
  immer((set, get) => ({
    mix: [],
    isPlaying: false,
    timerMinutes: null,
    fadeOutMinutes: DEFAULT_FADE_OUT_MINUTES,

    windDownItems: defaultWindDownItems.map((item) => ({ id: genId('wind'), label: item.label, done: false })),
    bedtime: { time: undefined, enabled: false, notificationIds: [] },
    wakeAlarm: { time: undefined, enabled: false, fadeInMinutes: DEFAULT_WAKE_FADE_IN_MINUTES, notificationIds: [] },

    logs: [],

    addSoundToMix: (soundId) =>
      set((state) => {
        if (state.mix.some((l) => l.soundId === soundId)) return;
        state.mix.push({ soundId, volume: 0.7 });
      }),

    removeSoundFromMix: (soundId) =>
      set((state) => {
        state.mix = state.mix.filter((l) => l.soundId !== soundId);
      }),

    setLayerVolume: (soundId, volume) =>
      set((state) => {
        const layer = state.mix.find((l) => l.soundId === soundId);
        if (layer) layer.volume = Math.max(0, Math.min(1, volume));
      }),

    togglePlaying: () =>
      set((state) => {
        state.isPlaying = !state.isPlaying;
      }),

    setTimerMinutes: (minutes) =>
      set((state) => {
        state.timerMinutes = minutes;
      }),

    setFadeOutMinutes: (minutes) =>
      set((state) => {
        state.fadeOutMinutes = Math.max(0, minutes);
      }),

    addWindDownItem: (label) =>
      set((state) => {
        const trimmed = label.trim();
        if (!trimmed) return;
        state.windDownItems.push({ id: genId('wind'), label: trimmed, done: false });
      }),

    removeWindDownItem: (id) =>
      set((state) => {
        state.windDownItems = state.windDownItems.filter((w) => w.id !== id);
      }),

    toggleWindDownItem: (id) =>
      set((state) => {
        const item = state.windDownItems.find((w) => w.id === id);
        if (item) item.done = !item.done;
      }),

    resetWindDownForTonight: () =>
      set((state) => {
        state.windDownItems.forEach((w) => {
          w.done = false;
        });
      }),

    setBedtime: async (time, enabled) => {
      await cancelReminders(get().bedtime.notificationIds);
      const ids =
        time && enabled
          ? await scheduleReminder({
              feature: 'sleep',
              title: 'Wind down for bed',
              date: todayISO(),
              scheduledTime: time,
              minutesBefore: 0,
              repeat: 'daily',
            })
          : [];
      set((state) => {
        state.bedtime = { time, enabled, notificationIds: ids };
      });
    },

    setWakeAlarm: async (time, enabled, fadeInMinutes) => {
      await cancelReminders(get().wakeAlarm.notificationIds);
      const resolvedFadeIn = fadeInMinutes ?? get().wakeAlarm.fadeInMinutes;
      const ids =
        time && enabled
          ? await scheduleReminder({
              feature: 'sleep',
              alarm: true,
              soundId: get().wakeAlarm.sound,
              title: 'Time to wake up',
              date: todayISO(),
              scheduledTime: time,
              minutesBefore: 0,
              repeat: 'daily',
            })
          : [];
      set((state) => {
        state.wakeAlarm = { ...state.wakeAlarm, time, enabled, fadeInMinutes: resolvedFadeIn, notificationIds: ids };
      });
    },

    // Choosing a sound reschedules the reminder with it (the old one is
    // cancelled first, inside setWakeAlarm).
    setWakeSound: async (sound) => {
      set((state) => {
        state.wakeAlarm.sound = sound;
      });
      const { time, enabled } = get().wakeAlarm;
      if (time && enabled) await get().setWakeAlarm(time, enabled);
    },

    logSleep: (date, quality, note) =>
      set((state) => {
        const existing = state.logs.find((l) => l.date === date);
        if (existing) {
          existing.quality = quality;
          existing.note = note?.trim() || undefined;
        } else {
          state.logs.push({ id: genId('sleeplog'), date, quality, note: note?.trim() || undefined, createdAt: new Date().toISOString() });
        }
      }),

    deleteLog: (id) =>
      set((state) => {
        state.logs = state.logs.filter((l) => l.id !== id);
      }),
  }))
);

export function averageSleepQuality(logs: SleepLogEntry[], sinceDate: string): number | undefined {
  const recent = logs.filter((l) => l.date >= sinceDate);
  if (recent.length === 0) return undefined;
  return recent.reduce((sum, l) => sum + l.quality, 0) / recent.length;
}
