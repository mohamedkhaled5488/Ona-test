import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { BestMoment, SectionId } from '../types/sections';

// Recap's own store — and *only* Recap's own data. Everything else Recap
// shows is read live from each section's own store via src/utils/recap.ts.
// This store never imports or calls another section's store.
interface RecapState {
  bestMoments: BestMoment[]; // at most one per date

  setBestMoment: (date: string, sourceSection: SectionId, label: string, refId?: string) => void;
  clearBestMoment: (date: string) => void;
}

export const useRecapStore = create<RecapState>()(
  immer((set) => ({
    bestMoments: [],

    setBestMoment: (date, sourceSection, label, refId) =>
      set((state) => {
        const existing = state.bestMoments.find((m) => m.date === date);
        if (existing) {
          existing.sourceSection = sourceSection;
          existing.label = label;
          existing.refId = refId;
        } else {
          state.bestMoments.push({ date, sourceSection, label, refId });
        }
      }),

    clearBestMoment: (date) =>
      set((state) => {
        state.bestMoments = state.bestMoments.filter((m) => m.date !== date);
      }),
  }))
);
