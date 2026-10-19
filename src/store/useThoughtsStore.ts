import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { CapturedThought, ThoughtKind } from '../types/sections';
import { mockThoughts } from '../data/mockData';
import { genId } from '../utils/id';
import { todayISO } from '../utils/date';
import { planColorPalette } from '../data/planStepColors';
import { usePlanStore } from './usePlanStore';
import { useJournalStore } from './useJournalStore';

interface ThoughtsState {
  thoughts: CapturedThought[];
  addThought: (kind: ThoughtKind, text: string) => void;
  deleteThought: (id: string) => void;
  promoteToPlan: (id: string) => string | undefined; // returns the new plan id
  promoteToJournal: (id: string) => void;
}

export const useThoughtsStore = create<ThoughtsState>()(
  immer((set, get) => ({
    thoughts: mockThoughts,

    addThought: (kind, text) =>
      set((state) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        state.thoughts.unshift({ id: genId('thought'), createdAt: new Date().toISOString(), kind, text: trimmed });
      }),

    deleteThought: (id) =>
      set((state) => {
        state.thoughts = state.thoughts.filter((t) => t.id !== id);
      }),

    // Promotion is a one-time copy into the target section, not a live link —
    // Catch a Feeling/Idea is intentionally the one section that only ever
    // pushes data outward, never keeps a synced connection.
    promoteToPlan: (id) => {
      const thought = get().thoughts.find((t) => t.id === id);
      if (!thought) return undefined;
      const planId = usePlanStore.getState().createPlan(thought.text, '', planColorPalette[0]);
      set((state) => {
        const t = state.thoughts.find((t) => t.id === id);
        if (t) t.promotedTo = 'plan';
      });
      return planId;
    },

    promoteToJournal: (id) => {
      const thought = get().thoughts.find((t) => t.id === id);
      if (!thought) return;
      const today = todayISO();
      const existing = useJournalStore.getState().entries.find((e) => e.date === today);
      if (existing) {
        useJournalStore
          .getState()
          .upsertEntry(today, existing.zone, `${existing.text}\n\n${thought.text}`, existing.tags);
      } else {
        // A new entry gets the neutral colour: a promoted idea says nothing about
        // how the day felt (it used to be marked "Tense").
        useJournalStore.getState().upsertEntry(today, 'okay', thought.text, []);
      }
      set((state) => {
        const t = state.thoughts.find((t) => t.id === id);
        if (t) t.promotedTo = 'journal';
      });
    },
  }))
);
