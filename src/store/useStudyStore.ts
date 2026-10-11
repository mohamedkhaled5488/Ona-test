import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { AmbientSound, StudySession } from '../types/sections';
import { mockStudySessions } from '../data/mockData';
import { genId } from '../utils/id';
import { toISODate } from '../utils/date';

export interface StartSessionConfig {
  focusMinutes: number;
  breakMinutes: number;
  subject?: string;
  appBlockingEnabled: boolean;
  ambientSound: AmbientSound;
  presetLabel?: string;
}

interface ActiveStudySession extends StartSessionConfig {
  phase: 'focus' | 'break';
  secondsRemaining: number;
  isPaused: boolean;
  focusSecondsElapsed: number;
  cyclesCompleted: number;
  startedAt: string;
}

interface PendingSummary {
  subject?: string;
  focusMinutes: number;
  appBlockingEnabled: boolean;
  ambientSound: AmbientSound;
  presetLabel?: string;
  cyclesCompleted: number;
  startedAt: string;
  endedAt: string;
}

interface StudyState {
  sessions: StudySession[];
  active: ActiveStudySession | null;
  pendingSummary: PendingSummary | null;

  start: (config: StartSessionConfig) => void;
  tick: () => void;
  togglePause: () => void;
  skipPhase: () => void;
  endEarly: () => void; // moves active session to the pending-summary/note step
  finish: (note: string | undefined) => void; // logs to history, clears pending summary
  discardPending: () => void;

  // Session detail page
  updateSession: (id: string, edit: { subject?: string; notes?: string }) => void;
  deleteSession: (id: string) => void;
  restoreSessions: (sessions: StudySession[]) => void;
  addComment: (sessionId: string, text: string) => void;
  editComment: (sessionId: string, commentId: string, text: string) => void;
  deleteComment: (sessionId: string, commentId: string) => void;
}

export const useStudyStore = create<StudyState>()(
  immer((set) => ({
    sessions: mockStudySessions,
    active: null,
    pendingSummary: null,

    start: (config) =>
      set((state) => {
        state.active = {
          ...config,
          phase: 'focus',
          secondsRemaining: config.focusMinutes * 60,
          isPaused: false,
          focusSecondsElapsed: 0,
          cyclesCompleted: 0,
          startedAt: new Date().toISOString(),
        };
      }),

    tick: () =>
      set((state) => {
        const active = state.active;
        if (!active || active.isPaused) return;
        if (active.secondsRemaining > 0) {
          active.secondsRemaining -= 1;
          if (active.phase === 'focus') active.focusSecondsElapsed += 1;
          return;
        }
        // phase boundary reached
        if (active.phase === 'focus') {
          active.cyclesCompleted += 1;
          active.phase = 'break';
          active.secondsRemaining = active.breakMinutes * 60;
        } else {
          active.phase = 'focus';
          active.secondsRemaining = active.focusMinutes * 60;
        }
      }),

    togglePause: () =>
      set((state) => {
        if (state.active) state.active.isPaused = !state.active.isPaused;
      }),

    skipPhase: () =>
      set((state) => {
        const active = state.active;
        if (!active) return;
        if (active.phase === 'focus') {
          active.cyclesCompleted += 1;
          active.phase = 'break';
          active.secondsRemaining = active.breakMinutes * 60;
        } else {
          active.phase = 'focus';
          active.secondsRemaining = active.focusMinutes * 60;
        }
      }),

    endEarly: () =>
      set((state) => {
        const a = state.active;
        if (!a) return;
        state.pendingSummary = {
          subject: a.subject,
          focusMinutes: Math.round(a.focusSecondsElapsed / 60),
          appBlockingEnabled: a.appBlockingEnabled,
          ambientSound: a.ambientSound,
          presetLabel: a.presetLabel,
          cyclesCompleted: a.cyclesCompleted,
          startedAt: a.startedAt,
          endedAt: new Date().toISOString(),
        };
        state.active = null;
      }),

    finish: (note) =>
      set((state) => {
        const pending = state.pendingSummary;
        if (!pending) return;
        state.sessions.unshift({
          id: genId('study'),
          // The day the session started on.
          date: toISODate(new Date(pending.startedAt)),
          subject: pending.subject,
          focusMinutes: pending.focusMinutes,
          breakMinutes: 0,
          appBlockingEnabled: pending.appBlockingEnabled,
          ambientSound: pending.ambientSound,
          notes: note?.trim() || undefined,
          startedAt: pending.startedAt,
          endedAt: pending.endedAt,
          presetLabel: pending.presetLabel,
          cyclesCompleted: pending.cyclesCompleted,
          comments: [],
        });
        state.pendingSummary = null;
      }),

    discardPending: () =>
      set((state) => {
        state.pendingSummary = null;
      }),

    updateSession: (id, edit) =>
      set((state) => {
        const s = state.sessions.find((x) => x.id === id);
        if (!s) return;
        if (edit.subject !== undefined) s.subject = edit.subject.trim() || undefined;
        if (edit.notes !== undefined) s.notes = edit.notes.trim() || undefined;
      }),

    deleteSession: (id) =>
      set((state) => {
        state.sessions = state.sessions.filter((s) => s.id !== id);
      }),

    restoreSessions: (sessions) =>
      set((state) => {
        state.sessions = sessions;
      }),

    addComment: (sessionId, text) =>
      set((state) => {
        const s = state.sessions.find((x) => x.id === sessionId);
        if (!s || !text.trim()) return;
        s.comments = [...(s.comments ?? []), { id: genId('comment'), text: text.trim(), createdAt: new Date().toISOString() }];
      }),

    editComment: (sessionId, commentId, text) =>
      set((state) => {
        const c = state.sessions.find((x) => x.id === sessionId)?.comments?.find((x) => x.id === commentId);
        if (!c || !text.trim()) return;
        c.text = text.trim();
        c.editedAt = new Date().toISOString();
      }),

    deleteComment: (sessionId, commentId) =>
      set((state) => {
        const s = state.sessions.find((x) => x.id === sessionId);
        if (s) s.comments = (s.comments ?? []).filter((c) => c.id !== commentId);
      }),
  }))
);
