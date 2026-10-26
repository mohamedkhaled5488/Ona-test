import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { FeelingZone, JournalEntry, JournalFont } from '../types/sections';
import { mockJournalEntries } from '../data/mockData';
import { genId } from '../utils/id';

interface JournalState {
  entries: JournalEntry[];

  upsertEntry: (
    date: string,
    zone: FeelingZone | undefined,
    text: string,
    tags: string[],
    // feelingChosen: undefined keeps what the entry had.
    options?: { preciseFeelingId?: string; font?: JournalFont; feelingChosen?: boolean }
  ) => void;
  deleteEntry: (id: string) => void;
  // From the Feelings log: its feeling was edited there, or deleted.
  setEntryFeeling: (id: string, zone: FeelingZone, preciseFeelingId: string | undefined) => void;
  setFeelingRemoved: (id: string, removed: boolean) => void;
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
          if (options?.feelingChosen !== undefined) existing.feelingChosen = options.feelingChosen;
          if (options?.feelingChosen) existing.feelingRemoved = undefined;
        } else {
          state.entries.push({
            id: genId('journal'),
            date,
            zone,
            text,
            tags,
            preciseFeelingId: options?.preciseFeelingId,
            font: options?.font,
            feelingChosen: options?.feelingChosen ?? false,
          });
        }
      }),

    deleteEntry: (id) =>
      set((state) => {
        state.entries = state.entries.filter((e) => e.id !== id);
      }),

    setEntryFeeling: (id, zone, preciseFeelingId) =>
      set((state) => {
        const e = state.entries.find((x) => x.id === id);
        if (!e) return;
        e.zone = zone;
        e.preciseFeelingId = preciseFeelingId;
      }),

    setFeelingRemoved: (id, removed) =>
      set((state) => {
        const e = state.entries.find((x) => x.id === id);
        if (e) e.feelingRemoved = removed || undefined;
      }),
  }))
);
