import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { FeelingCheckIn, FeelingSource, FeelingZone, PersonalFeeling } from '../types/sections';
import { mockFeelingCheckIns } from '../data/mockData';
import { genId } from '../utils/id';
import { todayISO } from '../utils/date';

interface FeelingsState {
  entries: FeelingCheckIn[];
  personalFeelings: PersonalFeeling[];
  bookmarks: string[]; // feeling ids (static or personal)
  // Per (feelingId, bullet text) helpfulness score, from the thumbs up/down on
  // the result screen — used to surface what's actually helped this user
  // first next time, using only their own local data.
  guidanceVotes: Record<string, number>;
  // User-added "what's contributing to this?" chips (v4), on top of the
  // fixed reasonTagOptions list — e.g. "Exam" or a specific person's name.
  customReasonTags: string[];

  addEntry: (
    zone: FeelingZone,
    feelingIds: string[],
    intensities?: Partial<Record<string, 1 | 2 | 3 | 4 | 5>>,
    reasonTags?: string[],
    source?: FeelingSource
  ) => string;
  setEntryNote: (id: string, note: string) => void;
  // Editing and deleting from the Feelings log (or from a task it's linked to).
  updateEntry: (id: string, patch: Partial<Pick<FeelingCheckIn, 'zone' | 'feelingIds' | 'intensities' | 'reasonTags' | 'note'>>) => void;
  deleteEntry: (id: string) => void;
  // Adds an entry with its own id, or replaces the one with that id (a
  // feeling brought in from another section: feelings/fromSections.ts).
  putEntry: (entry: FeelingCheckIn) => void;
  restoreEntries: (entries: FeelingCheckIn[]) => void;
  toggleBookmark: (feelingId: string) => void;
  retagEntry: (id: string, zone: FeelingZone, feelingIds: string[]) => void;
  voteGuidance: (feelingId: string, bulletText: string, delta: 1 | -1) => void;

  // "Something else? Write your own word" — saved once, then reappears in
  // that zone's word list from then on. Returns the created record so the
  // caller can select it immediately.
  addPersonalFeeling: (name: string, zone: FeelingZone) => PersonalFeeling;

  addCustomReasonTag: (tag: string) => string;
  // Settings → Sections → Identify the Feeling. Past entries keep the tag.
  removeCustomReasonTag: (tag: string) => void;
}

const voteKey = (feelingId: string, bulletText: string) => `${feelingId}::${bulletText}`;

export const useFeelingsStore = create<FeelingsState>()(
  immer((set) => ({
    entries: mockFeelingCheckIns,
    personalFeelings: [],
    bookmarks: [],
    guidanceVotes: {},
    customReasonTags: [],

    addEntry: (zone, feelingIds, intensities, reasonTags, source) => {
      const id = genId('feeling');
      set((state) => {
        state.entries.push({
          id,
          zone,
          feelingIds,
          intensities,
          reasonTags,
          date: todayISO(),
          createdAt: new Date().toISOString(),
          source,
        });
      });
      return id;
    },

    setEntryNote: (id, note) =>
      set((state) => {
        const entry = state.entries.find((e) => e.id === id);
        if (entry) entry.note = note.trim() || undefined;
      }),

    updateEntry: (id, patch) =>
      set((state) => {
        const entry = state.entries.find((e) => e.id === id);
        if (!entry) return;
        Object.assign(entry, patch);
        if (entry.note !== undefined) entry.note = entry.note.trim() || undefined;
      }),

    deleteEntry: (id) =>
      set((state) => {
        state.entries = state.entries.filter((e) => e.id !== id);
      }),

    putEntry: (entry) =>
      set((state) => {
        const i = state.entries.findIndex((e) => e.id === entry.id);
        if (i >= 0) state.entries[i] = entry;
        else state.entries.push(entry);
      }),

    restoreEntries: (entries) =>
      set((state) => {
        state.entries = entries;
      }),

    retagEntry: (id, zone, feelingIds) =>
      set((state) => {
        const entry = state.entries.find((e) => e.id === id);
        if (entry) {
          entry.zone = zone;
          entry.feelingIds = feelingIds;
        }
      }),

    toggleBookmark: (feelingId) =>
      set((state) => {
        state.bookmarks = state.bookmarks.includes(feelingId)
          ? state.bookmarks.filter((id) => id !== feelingId)
          : [...state.bookmarks, feelingId];
      }),

    voteGuidance: (feelingId, bulletText, delta) =>
      set((state) => {
        const key = voteKey(feelingId, bulletText);
        state.guidanceVotes[key] = (state.guidanceVotes[key] ?? 0) + delta;
      }),

    addPersonalFeeling: (name, zone) => {
      const created: PersonalFeeling = { id: genId('personalfeeling'), name: name.trim() || 'Untitled', zone, createdAt: new Date().toISOString() };
      set((state) => {
        state.personalFeelings.push(created);
      });
      return created;
    },

    addCustomReasonTag: (tag) => {
      const trimmed = tag.trim();
      set((state) => {
        if (trimmed && !state.customReasonTags.includes(trimmed)) state.customReasonTags.push(trimmed);
      });
      return trimmed;
    },

    removeCustomReasonTag: (tag) =>
      set((state) => {
        state.customReasonTags = state.customReasonTags.filter((t) => t !== tag);
      }),
  }))
);

export function sortGuidanceByVotes(feelingId: string, guidance: string[], votes: Record<string, number>): string[] {
  return [...guidance]
    .map((text, index) => ({ text, index, score: votes[voteKey(feelingId, text)] ?? 0 }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((g) => g.text);
}

export function getGuidanceVote(feelingId: string, bulletText: string, votes: Record<string, number>): number {
  return votes[voteKey(feelingId, bulletText)] ?? 0;
}
