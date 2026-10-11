import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { FeelingZone, JournalEntry, JournalFont } from '../types/sections';
import { mockJournalEntries } from '../data/mockData';
import { genId } from '../utils/id';

interface JournalState {
  entries: JournalEntry[];

  upsertEntry: (
    date: string,
    zone: FeelingZone,
    text: string,
    tags: string[],
    options?: { preciseFeelingId?: string; font?: JournalFont }
  ) => void;
  deleteEntry: (id: string) => void;
}

export const useJournalStore = create<JournalState>()(
  immer((set) => ({
    entries: mockJournalEntries,

    upsertEntry: (date, zone, text, tags, options) =>
      set((state) => {
        const existing = state.entries.find((e) => e.date === date);
        if (existing) {
          existing.zone = zone;
          existing.text = text;
          existing.tags = tags;
          existing.preciseFeelingId = options?.preciseFeelingId;
          existing.font = options?.font;
        } else {
          state.entries.push({
            id: genId('journal'),
            date,
            zone,
            text,
            tags,
            preciseFeelingId: options?.preciseFeelingId,
            font: options?.font,
          });
        }
      }),

    deleteEntry: (id) =>
      set((state) => {
        state.entries = state.entries.filter((e) => e.id !== id);
      }),
  }))
);
