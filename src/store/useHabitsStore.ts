import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { GraduationChoice, Habit, HabitCheckIn, HabitFrequency } from '../types/sections';
import { genId } from '../utils/id';
import { todayISO } from '../utils/date';
import { cancelReminders, scheduleReminder } from '../utils/notifications';
import { frequencyStreak, shouldResurfaceWhyFor, nextScheduledDates, type FrequencyStreak } from '../utils/habitFrequency';

export interface HabitInput {
  name: string;
  cueRoutine?: string;
  identity?: string;
  minimumVersion?: string;
  why?: string;
  targetDays: number;
  frequency?: HabitFrequency;
  pairedQuitHabitId?: string;
}

// The fields the periodic review / long-gap "adjust" step can change.
export type HabitEdit = Partial<Pick<Habit, 'name' | 'cueRoutine' | 'targetDays' | 'frequency'>>;

interface HabitsState {
  habits: Habit[];
  checkIns: HabitCheckIn[];

  addHabit: (input: HabitInput) => string;
  deleteHabit: (id: string) => void;

  setCheckIn: (
    habitId: string,
    date: string,
    done: boolean,
    note?: string,
    photoUri?: string,
    reasonTags?: string[],
    durationMinutes?: number
  ) => void;
  clearCheckIn: (habitId: string, date: string) => void;

  setReminder: (habitId: string, time: string | undefined, enabled: boolean) => Promise<void>;

  chooseGraduation: (habitId: string, choice: GraduationChoice, reflection?: string) => void;
  extendTarget: (habitId: string, addDays: number) => void;

  updateHabit: (habitId: string, edit: HabitEdit) => void;
  archiveHabit: (habitId: string) => void;
  unarchiveHabit: (habitId: string) => void;
  acknowledgeReentry: (habitId: string) => void;
  markReviewed: (habitId: string) => void;
}

export const useHabitsStore = create<HabitsState>()(
  immer((set, get) => ({
    habits: [],
    checkIns: [],

    addHabit: (input) => {
      const id = genId('habit');
      set((state) => {
        state.habits.unshift({
          id,
          name: input.name.trim() || 'Untitled habit',
          cueRoutine: input.cueRoutine?.trim() || undefined,
          identity: input.identity?.trim() || undefined,
          minimumVersion: input.minimumVersion?.trim() || undefined,
          why: input.why?.trim() || undefined,
          targetDays: input.targetDays,
          createdAt: todayISO(),
          reminderEnabled: false,
          reminderNotificationIds: [],
          frequency: input.frequency && input.frequency.kind !== 'daily' ? input.frequency : undefined,
          pairedQuitHabitId: input.pairedQuitHabitId,
        });
      });
      return id;
    },

    deleteHabit: (id) => {
      const habit = get().habits.find((h) => h.id === id);
      if (habit) void cancelReminders(habit.reminderNotificationIds);
      set((state) => {
        state.habits = state.habits.filter((h) => h.id !== id);
        state.checkIns = state.checkIns.filter((c) => c.habitId !== id);
      });
    },

    setCheckIn: (habitId, date, done, note, photoUri, reasonTags, durationMinutes) =>
      set((state) => {
        const existing = state.checkIns.find((c) => c.habitId === habitId && c.date === date);
        if (existing) {
          existing.done = done;
          existing.note = note?.trim() || undefined;
          if (photoUri !== undefined) existing.photoUri = photoUri;
          existing.reasonTags = done ? undefined : reasonTags;
          if (durationMinutes !== undefined) existing.durationMinutes = durationMinutes;
        } else {
          state.checkIns.push({
            id: genId('checkin'),
            habitId,
            date,
            done,
            note: note?.trim() || undefined,
            photoUri,
            reasonTags: done ? undefined : reasonTags,
            durationMinutes,
            createdAt: new Date().toISOString(),
          });
        }
      }),

    clearCheckIn: (habitId, date) =>
      set((state) => {
        state.checkIns = state.checkIns.filter((c) => !(c.habitId === habitId && c.date === date));
      }),

    setReminder: async (habitId, time, enabled) => {
      const habit = get().habits.find((h) => h.id === habitId);
      if (!habit) return;
      await cancelReminders(habit.reminderNotificationIds);
      // A specific-weekdays habit gets one weekly reminder per chosen day
      // (no nudge on its days off); every other frequency is reminded daily.
      const weekdaysOnly = habit.frequency?.kind === 'weekdays';
      const ids =
        time && enabled
          ? (
              await Promise.all(
                nextScheduledDates(habit.frequency, todayISO()).map((date) =>
                  scheduleReminder({
                    feature: 'habits',
                    title: `${habit.name} — cue reminder`,
                    date,
                    scheduledTime: time,
                    minutesBefore: 0,
                    repeat: weekdaysOnly ? 'weekly' : 'daily',
                  })
                )
              )
            ).flat()
          : [];
      set((state) => {
        const h = state.habits.find((h) => h.id === habitId);
        if (h) {
          h.reminderTime = time;
          h.reminderEnabled = enabled;
          h.reminderNotificationIds = ids;
        }
      });
    },

    chooseGraduation: (habitId, choice, reflection) =>
      set((state) => {
        const habit = state.habits.find((h) => h.id === habitId);
        if (!habit) return;
        habit.graduatedAt = todayISO();
        habit.graduationChoice = choice;
        if (choice === 'formed') habit.graduationReflection = reflection?.trim() || undefined;
      }),

    extendTarget: (habitId, addDays) =>
      set((state) => {
        const habit = state.habits.find((h) => h.id === habitId);
        if (!habit) return;
        habit.targetDays += addDays;
        habit.graduatedAt = undefined;
        habit.graduationChoice = undefined;
      }),

    updateHabit: (habitId, edit) =>
      set((state) => {
        const habit = state.habits.find((h) => h.id === habitId);
        if (!habit) return;
        if (edit.name !== undefined) habit.name = edit.name.trim() || habit.name;
        if (edit.cueRoutine !== undefined) habit.cueRoutine = edit.cueRoutine.trim() || undefined;
        if (edit.targetDays !== undefined && edit.targetDays >= 1) habit.targetDays = edit.targetDays;
        if (edit.frequency !== undefined) habit.frequency = edit.frequency.kind === 'daily' ? undefined : edit.frequency;
      }),

    archiveHabit: (habitId) => {
      const habit = get().habits.find((h) => h.id === habitId);
      if (habit) void cancelReminders(habit.reminderNotificationIds);
      set((state) => {
        const h = state.habits.find((x) => x.id === habitId);
        if (!h) return;
        h.archivedAt = todayISO();
        h.reminderEnabled = false;
        h.reminderNotificationIds = [];
      });
    },

    unarchiveHabit: (habitId) =>
      set((state) => {
        const h = state.habits.find((x) => x.id === habitId);
        if (!h) return;
        h.archivedAt = undefined;
        h.reentryAcknowledgedAt = todayISO();
      }),

    acknowledgeReentry: (habitId) =>
      set((state) => {
        const h = state.habits.find((x) => x.id === habitId);
        if (h) h.reentryAcknowledgedAt = todayISO();
      }),

    markReviewed: (habitId) =>
      set((state) => {
        const h = state.habits.find((x) => x.id === habitId);
        if (h) h.lastReviewedAt = todayISO();
      }),
  }))
);

// --- Pure helpers ---

// "Streak pauses, not resets": while there's a gap since the last Done,
// the number stays frozen at what was last earned instead of dropping to 0.
// Counted against the habit's frequency — scheduled days for a daily or
// specific-weekdays habit, whole weeks for an "X times a week" one. See
// utils/habitFrequency.ts (kept pure there so it can be unit tested).
export function habitStreak(checkIns: HabitCheckIn[], habitId: string, today: string, frequency?: HabitFrequency): FrequencyStreak {
  return frequencyStreak(checkIns, habitId, frequency, today);
}

export function daysElapsed(habit: Habit, today: string): number {
  const start = new Date(`${habit.createdAt}T00:00:00`);
  const now = new Date(`${today}T00:00:00`);
  return Math.max(1, Math.floor((now.getTime() - start.getTime()) / 86400000) + 1);
}

export function habitMilestoneMessage(elapsed: number, targetDays: number): string | undefined {
  const half = Math.round(targetDays / 2);
  if (elapsed === 1) return 'Day 1 — the hardest one to start is done.';
  if (elapsed === 7) return 'One full week. That’s a real pattern forming.';
  if (elapsed === half && half !== 1 && half !== 7) return `Halfway there — day ${half} of ${targetDays}.`;
  if (elapsed === targetDays) return `Day ${targetDays} — you reached your target.`;
  return undefined;
}

// Gently resurface the user's own "why" when it looks like the habit is
// slipping — the last two scheduled days missed, or (for "X times a week")
// no longer enough days left this week to make it.
export function shouldResurfaceWhy(checkIns: HabitCheckIn[], habitId: string, today: string, frequency?: HabitFrequency): boolean {
  return shouldResurfaceWhyFor(checkIns, habitId, frequency, today);
}

export function checkInsForHabit(checkIns: HabitCheckIn[], habitId: string): HabitCheckIn[] {
  return checkIns.filter((c) => c.habitId === habitId);
}
