// "Support for this feeling": what this phone remembers, only to choose well
// next time: "Did this help?" answers, suggestions the person hid, and what
// was shown (support/engine.ts). Kept on this phone only: never synced, never
// sent to analytics; in the export and wiped with the rest (utils/localData.ts).
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Helped, SupportShown, Votes } from '../support/engine';
import { keepHistory } from '../support/engine';

interface SupportState {
  votes: Record<string, Votes>;
  hidden: string[];
  history: SupportShown[];
  offerAfterLog: boolean; // "Would something help?" after a hard feeling is logged
  checkInIds: string[]; // the hour-later check-in, this phone only

  recordShown: (s: Omit<SupportShown, 'used'>) => void;
  recordUsed: (optionId: string) => void;
  vote: (optionId: string | undefined, helped: Helped) => void;
  hide: (optionId: string) => void;
  unhide: (optionId: string) => void;
  setOfferAfterLog: (on: boolean) => void;
  setCheckInIds: (ids: string[]) => void;
}

export const useSupportStore = create<SupportState>()(
  immer((set) => ({
    votes: {},
    hidden: [],
    history: [],
    offerAfterLog: true,
    checkInIds: [],

    recordShown: (s) =>
      set((state) => {
        state.history = keepHistory([...state.history, { ...s, used: [] }], s.at.slice(0, 10));
      }),
    recordUsed: (optionId) =>
      set((state) => {
        const last = state.history[state.history.length - 1];
        if (last && !last.used.includes(optionId)) last.used.push(optionId);
      }),
    vote: (optionId, helped) =>
      set((state) => {
        const last = state.history[state.history.length - 1];
        if (last) last.helped = helped;
        const ids = optionId ? [optionId] : (last?.used ?? []);
        for (const id of ids) {
          if (!state.votes[id]) state.votes[id] = { yes: 0, aLittle: 0, notReally: 0 };
          state.votes[id][helped] += 1;
        }
      }),
    hide: (optionId) =>
      set((state) => {
        if (!state.hidden.includes(optionId)) state.hidden.push(optionId);
      }),
    unhide: (optionId) =>
      set((state) => {
        state.hidden = state.hidden.filter((x) => x !== optionId);
      }),
    setOfferAfterLog: (on) =>
      set((state) => {
        state.offerAfterLog = on;
      }),
    setCheckInIds: (ids) =>
      set((state) => {
        state.checkInIds = ids;
      }),
  }))
);
