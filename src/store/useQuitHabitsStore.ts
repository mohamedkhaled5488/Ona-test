import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { FeelingZone, QuitCravingSession, QuitFeelingEntry, QuitHabit, QuitHabitType, QuitIfThenPlan, QuitSlip, QuitToolkit, QuitTrack } from '../types/sections';
import { genId } from '../utils/id';
import { daysBetweenISODates, todayISO } from '../utils/date';

interface QuitHabitsState {
  habits: QuitHabit[];
  tracks: QuitTrack[];
  feelingEntries: QuitFeelingEntry[];
  slips: QuitSlip[];
  cravingSessions: QuitCravingSession[];

  // Creates the habit and its first track together — returns both ids.
  addQuitHabit: (name: string, why: string | undefined, habitType?: QuitHabitType) => { habitId: string; trackId: string };
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

  // A hard day, marked on the journey: the chapter and the day count carry
  // on. Returns the slip's id.
  markHardDay: (habitId: string, trackId: string, details?: { reflection?: string; reasonTags?: string[]; cravingSessionId?: string }) => string;
  // "Start a new chapter?" after a hard day (never by default): the current
  // chapter ends on that day, with its reflection, and a new one starts.
  startNewChapter: (habitId: string, slipId: string) => string | undefined;

  // Craving sessions ("I'm craving it"): started, a tool tried, ended.
  startCraving: (habitId: string, trackId: string, ratingBefore?: number) => string;
  updateCraving: (id: string, patch: Partial<Pick<QuitCravingSession, 'ratingBefore' | 'ratingAfter' | 'triggerTag' | 'note'>>) => void;
  tryCravingTool: (id: string, toolId: string) => void;
  endCraving: (id: string, outcome: NonNullable<QuitCravingSession['outcome']>, links?: { resistedEntryId?: string; slipId?: string }) => void;

  // The craving toolkit (quit/toolkit.ts): the habit's type, "My toolkit"
  // (pin, order, hide, the user's own tools) and if-then plans.
  updateQuitHabit: (id: string, patch: Partial<Pick<QuitHabit, 'habitType' | 'toolkitOffered' | 'substanceNoteShown' | 'reasons' | 'futureNote' | 'photoUri'>>) => void;
  pinTool: (habitId: string, toolId: string, pinned: boolean) => void;
  moveTool: (habitId: string, toolId: string, by: -1 | 1) => void;
  // Hiding a tool unpins it.
  hideTool: (habitId: string, toolId: string, hidden: boolean) => void;
  setShowGames: (habitId: string, show: boolean) => void;
  // The user's own tool, pinned straight away. Returns its id.
  addCustomTool: (habitId: string, name: string, minutes?: number) => string;
  // Removes it, and any plan that used it.
  removeCustomTool: (habitId: string, toolId: string) => void;
  addPlan: (habitId: string, plan: Omit<QuitIfThenPlan, 'id'>) => string;
  removePlan: (habitId: string, planId: string) => void;
}

// The habit's toolkit, created on first change (older habits have none).
function editToolkit(state: { habits: QuitHabit[] }, habitId: string, edit: (tk: QuitToolkit, habit: QuitHabit) => void) {
  const h = state.habits.find((x) => x.id === habitId);
  if (!h) return;
  if (!h.toolkit) h.toolkit = { pinned: [], hidden: [], custom: [] };
  edit(h.toolkit, h);
}

export const useQuitHabitsStore = create<QuitHabitsState>()(
  immer((set) => ({
    habits: [],
    tracks: [],
    feelingEntries: [],
    slips: [],
    cravingSessions: [],

    addQuitHabit: (name, why, habitType) => {
      const habitId = genId('quithabit');
      const trackId = genId('track');
      set((state) => {
        state.habits.unshift({ id: habitId, name: name.trim() || 'Untitled', why: why?.trim() || undefined, createdAt: todayISO(), habitType, toolkitOffered: false });
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
        state.slips = state.slips.filter((x) => x.quitHabitId !== id);
        state.cravingSessions = state.cravingSessions.filter((x) => x.quitHabitId !== id);
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

    markHardDay: (habitId, trackId, details = {}) => {
      const id = genId('slip');
      set((state) => {
        state.slips.unshift({
          id,
          quitHabitId: habitId,
          trackId,
          date: todayISO(),
          createdAt: new Date().toISOString(),
          reflection: details.reflection?.trim() || undefined,
          reasonTags: details.reasonTags?.length ? details.reasonTags : undefined,
          cravingSessionId: details.cravingSessionId,
        });
      });
      return id;
    },

    startNewChapter: (habitId, slipId) => {
      let newTrackId: string | undefined;
      set((state) => {
        const slip = state.slips.find((x) => x.id === slipId);
        const track = state.tracks.find((t) => t.quitHabitId === habitId && t.status === 'active');
        if (!slip || !track) return;
        track.status = 'archived';
        track.endDate = slip.date;
        track.relapseReflection = slip.reflection;
        track.relapseReasonTags = slip.reasonTags;
        newTrackId = genId('track');
        state.tracks.unshift({ id: newTrackId, quitHabitId: habitId, startDate: todayISO(), createdAt: new Date().toISOString(), status: 'active' });
      });
      return newTrackId;
    },

    startCraving: (habitId, trackId, ratingBefore) => {
      const id = genId('craving');
      set((state) => {
        state.cravingSessions.unshift({ id, quitHabitId: habitId, trackId, startedAt: new Date().toISOString(), ratingBefore, tools: [] });
      });
      return id;
    },

    updateCraving: (id, patch) =>
      set((state) => {
        const c = state.cravingSessions.find((x) => x.id === id);
        if (c) Object.assign(c, patch);
      }),

    tryCravingTool: (id, toolId) =>
      set((state) => {
        const c = state.cravingSessions.find((x) => x.id === id);
        if (!c || c.endedAt) return;
        const at = new Date().toISOString();
        const open = c.tools[c.tools.length - 1];
        if (open && !open.endedAt) {
          if (open.toolId === toolId) return;
          open.endedAt = at;
        }
        c.tools.push({ toolId, startedAt: at });
      }),

    endCraving: (id, outcome, links = {}) =>
      set((state) => {
        const c = state.cravingSessions.find((x) => x.id === id);
        if (!c) return;
        const at = new Date().toISOString();
        const open = c.tools[c.tools.length - 1];
        if (open && !open.endedAt) open.endedAt = at;
        c.outcome = outcome;
        // "Still here" keeps the session (and its timer) going.
        if (outcome !== 'stillHere') c.endedAt = at;
        if (links.resistedEntryId) c.resistedEntryId = links.resistedEntryId;
        if (links.slipId) c.slipId = links.slipId;
      }),

    updateQuitHabit: (id, patch) =>
      set((state) => {
        const h = state.habits.find((x) => x.id === id);
        if (h) Object.assign(h, patch);
      }),

    pinTool: (habitId, toolId, pinned) =>
      set((state) =>
        editToolkit(state, habitId, (tk) => {
          tk.pinned = tk.pinned.filter((x) => x !== toolId);
          if (pinned) {
            tk.pinned.push(toolId);
            tk.hidden = tk.hidden.filter((x) => x !== toolId);
          }
        })
      ),

    moveTool: (habitId, toolId, by) =>
      set((state) =>
        editToolkit(state, habitId, (tk) => {
          const i = tk.pinned.indexOf(toolId);
          const j = i + by;
          if (i < 0 || j < 0 || j >= tk.pinned.length) return;
          [tk.pinned[i], tk.pinned[j]] = [tk.pinned[j], tk.pinned[i]];
        })
      ),

    hideTool: (habitId, toolId, hidden) =>
      set((state) =>
        editToolkit(state, habitId, (tk) => {
          tk.hidden = tk.hidden.filter((x) => x !== toolId);
          if (hidden) {
            tk.hidden.push(toolId);
            tk.pinned = tk.pinned.filter((x) => x !== toolId);
          }
        })
      ),

    setShowGames: (habitId, show) =>
      set((state) =>
        editToolkit(state, habitId, (tk) => {
          tk.showGames = show || undefined;
        })
      ),

    addCustomTool: (habitId, name, minutes) => {
      const id = genId('tool');
      set((state) =>
        editToolkit(state, habitId, (tk) => {
          tk.custom.push({ id, name: name.trim() || 'My tool', minutes: minutes && minutes > 0 ? Math.round(minutes) : undefined });
          tk.pinned.push(id);
        })
      );
      return id;
    },

    removeCustomTool: (habitId, toolId) =>
      set((state) =>
        editToolkit(state, habitId, (tk, h) => {
          tk.custom = tk.custom.filter((c) => c.id !== toolId);
          tk.pinned = tk.pinned.filter((x) => x !== toolId);
          tk.hidden = tk.hidden.filter((x) => x !== toolId);
          if (h.plans) h.plans = h.plans.filter((p) => p.toolId !== toolId);
        })
      ),

    addPlan: (habitId, plan) => {
      const id = genId('plan');
      set((state) => {
        const h = state.habits.find((x) => x.id === habitId);
        if (!h) return;
        h.plans = [...(h.plans ?? []), { id, when: plan.when.trim(), timeOfDay: plan.timeOfDay, toolId: plan.toolId }];
      });
      return id;
    },

    removePlan: (habitId, planId) =>
      set((state) => {
        const h = state.habits.find((x) => x.id === habitId);
        if (h?.plans) h.plans = h.plans.filter((p) => p.id !== planId);
      }),
  }))
);

// The craving session going on for a habit (started, not yet ended), if any:
// reopening Ona brings it back with its timer right.
export function openCravingFor(sessions: QuitCravingSession[], habitId: string): QuitCravingSession | undefined {
  return sessions.find((s) => s.quitHabitId === habitId && !s.endedAt);
}

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

// Calendar days, so the spring daylight-saving change can't lose one.
export function daysSinceTrackStart(track: QuitTrack, today: string): number {
  return Math.max(1, daysBetweenISODates(track.startDate, track.endDate ?? today) + 1);
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
