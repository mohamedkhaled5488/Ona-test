import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { FeelingZone, QuitFeelingEntry, QuitHabit, QuitTrack } from '../types/sections';
import { genId } from '../utils/id';
import { todayISO } from '../utils/date';

interface QuitHabitsState {
  habits: QuitHabit[];
  tracks: QuitTrack[];
  feelingEntries: QuitFeelingEntry[];

  // Creates the habit and its first track together — returns both ids.
  addQuitHabit: (name: string, why: string | undefined) => { habitId: string; trackId: string };
  deleteQuitHabit: (id: string) => void;
  // Links the Build habit created as "something to do instead".
  setReplacementHabit: (quitHabitId: string, habitId: string) => void;

  addFeelingEntry: (
    trackId: string,
    feelingId: string | undefined,
    zone: FeelingZone | undefined,
    note: string | undefined,
    isRelapseMoment?: boolean,
    isResistedUrge?: boolean,
    approach?: string,
    urgePassed?: boolean
  ) => string;
  deleteFeelingEntry: (id: string) => void;
  // Attaches (or, with undefined, removes) the feeling noted for an urge or slip.
  setEntryFeeling: (id: string, feeling: { feelingEntryId: string; zone: FeelingZone; feelingId?: string; note?: string } | undefined) => void;

  // Archives the current track (marks it ended, with an optional
  // reflection) — documents this chapter without deciding anything about
  // what comes next. The track is never deleted.
  archiveTrack: (trackId: string, reflection: string | undefined, reasonTags?: string[]) => void;

  // Starts a fresh track at Day 1 — a separate, deliberate action the user
  // chooses when they're ready, not something that happens automatically
  // just because a track was archived. Returns the new track's id.
  startNewTrack: (habitId: string) => string;
}

export const useQuitHabitsStore = create<QuitHabitsState>()(
  immer((set) => ({
    habits: [],
    tracks: [],
    feelingEntries: [],

    addQuitHabit: (name, why) => {
      const habitId = genId('quithabit');
      const trackId = genId('track');
      set((state) => {
        state.habits.unshift({ id: habitId, name: name.trim() || 'Untitled', why: why?.trim() || undefined, createdAt: todayISO() });
        state.tracks.unshift({ id: trackId, quitHabitId: habitId, startDate: todayISO(), createdAt: new Date().toISOString(), status: 'active' });
      });
      return { habitId, trackId };
    },

    setReplacementHabit: (quitHabitId, habitId) =>
      set((state) => {
        const h = state.habits.find((x) => x.id === quitHabitId);
        if (h) h.replacementHabitId = habitId;
      }),

    deleteQuitHabit: (id) =>
      set((state) => {
        const trackIds = new Set(state.tracks.filter((t) => t.quitHabitId === id).map((t) => t.id));
        state.habits = state.habits.filter((h) => h.id !== id);
        state.tracks = state.tracks.filter((t) => t.quitHabitId !== id);
        state.feelingEntries = state.feelingEntries.filter((e) => !trackIds.has(e.trackId));
      }),

    addFeelingEntry: (trackId, feelingId, zone, note, isRelapseMoment, isResistedUrge, approach, urgePassed) => {
      const id = genId('quitfeeling');
      set((state) => {
        state.feelingEntries.unshift({
          id,
          trackId,
          feelingId,
          zone,
          note: note?.trim() || undefined,
          isRelapseMoment: !!isRelapseMoment,
          isResistedUrge: !!isResistedUrge,
          approach,
          urgePassed,
          createdAt: new Date().toISOString(),
        });
      });
      return id;
    },

    deleteFeelingEntry: (id) =>
      set((state) => {
        state.feelingEntries = state.feelingEntries.filter((e) => e.id !== id);
      }),

    setEntryFeeling: (id, feeling) =>
      set((state) => {
        const e = state.feelingEntries.find((x) => x.id === id);
        if (!e) return;
        e.feelingEntryId = feeling?.feelingEntryId;
        e.zone = feeling?.zone;
        e.feelingId = feeling?.feelingId;
        if (feeling && feeling.note !== undefined) e.note = feeling.note.trim() || undefined;
      }),

    archiveTrack: (trackId, reflection, reasonTags) =>
      set((state) => {
        const track = state.tracks.find((t) => t.id === trackId);
        if (!track) return;
        track.status = 'archived';
        track.endDate = todayISO();
        track.relapseReflection = reflection?.trim() || undefined;
        track.relapseReasonTags = reasonTags;
      }),

    startNewTrack: (habitId) => {
      const newTrackId = genId('track');
      set((state) => {
        state.tracks.unshift({ id: newTrackId, quitHabitId: habitId, startDate: todayISO(), createdAt: new Date().toISOString(), status: 'active' });
      });
      return newTrackId;
    },
  }))
);

// --- Pure helpers ---

export function activeTrackFor(tracks: QuitTrack[], habitId: string): QuitTrack | undefined {
  return tracks.find((t) => t.quitHabitId === habitId && t.status === 'active');
}

export function tracksForHabit(tracks: QuitTrack[], habitId: string): QuitTrack[] {
  // Sorted by creation order, not startDate alone — two tracks begun the
  // same calendar day (an active track and a same-day relapse) would
  // otherwise be indistinguishable by date and could sort backwards.
  return tracks.filter((t) => t.quitHabitId === habitId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function feelingEntriesForTrack(entries: QuitFeelingEntry[], trackId: string): QuitFeelingEntry[] {
  return entries.filter((e) => e.trackId === trackId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function daysSinceTrackStart(track: QuitTrack, today: string): number {
  const start = new Date(`${track.startDate}T00:00:00`);
  const end = new Date(`${track.endDate ?? today}T00:00:00`);
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
}

// Milestones are purely additive acknowledgments — no target, no comparison.
const MILESTONE_DAYS = [1, 7, 14, 30, 60, 90, 180, 365];

export function quitMilestoneMessage(elapsed: number): string | undefined {
  if (elapsed === 1) return 'Day 1 — starting is its own kind of hard.';
  if (elapsed === 7) return 'One full week.';
  if (elapsed === 30) return '30 days.';
  if (elapsed === 90) return '90 days — a real season of your life.';
  if (elapsed === 365) return 'One full year.';
  if (MILESTONE_DAYS.includes(elapsed)) return `Day ${elapsed}.`;
  return undefined;
}

export function longestTrackDays(tracks: QuitTrack[], habitId: string, today: string): number {
  const relevant = tracksForHabit(tracks, habitId);
  return relevant.reduce((max, t) => Math.max(max, daysSinceTrackStart(t, today)), 0);
}

// Every resisted-urge entry across every track of one habit — the count
// that matters for celebration ("resisted 12 urges this month") spans the
// whole habit's journey, not just its current track.
export function resistedUrgeEntriesForHabit(feelingEntries: QuitFeelingEntry[], tracks: QuitTrack[], habitId: string): QuitFeelingEntry[] {
  const trackIds = new Set(tracksForHabit(tracks, habitId).map((t) => t.id));
  return feelingEntries.filter((e) => trackIds.has(e.trackId) && e.isResistedUrge);
}
