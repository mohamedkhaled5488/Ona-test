// Letters to Myself. Synced like the journal (a conflict keeps both,
// sync/engine.ts KEEP_BOTH); the reminder ids are this phone's only. "Saved
// for later" offers and the last feeling an offer was made for are this
// phone's preferences, never synced (utils/localData.ts prefs).
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Letter } from '../types/sections';
import { genId } from '../utils/id';

export type LetterInput = Pick<Letter, 'kind' | 'zones' | 'feelingIds' | 'text'> & Partial<Pick<Letter, 'deliverOn' | 'remind' | 'showWhenIntense' | 'fromReflection'>>;

interface LettersState {
  letters: Letter[];
  later: string[]; // letter ids saved for later from an offer
  offeredFor?: string; // the last feeling an offer was made for

  addLetter: (input: LetterInput) => string;
  updateLetter: (id: string, input: Partial<LetterInput>) => void;
  deleteLetter: (id: string) => void;
  setPaused: (id: string, paused: boolean) => void;
  setHidden: (id: string, hidden: boolean) => void;
  markShown: (id: string) => void;
  markDelivered: (id: string) => void;
  setNotificationIds: (id: string, ids: string[]) => void;
  saveForLater: (id: string) => void;
  removeLater: (id: string) => void;
  setOfferedFor: (feelingId: string) => void;
}

const now = () => new Date().toISOString();

export const useLettersStore = create<LettersState>()(
  immer((set) => {
    const edit = (id: string, fn: (l: Letter) => void, touch = true) =>
      set((state) => {
        const l = state.letters.find((x) => x.id === id);
        if (!l) return;
        fn(l);
        if (touch) l.updatedAt = now();
      });
    return {
      letters: [],
      later: [],
      offeredFor: undefined,

      addLetter: (input) => {
        const id = genId('letter');
        const at = now();
        set((state) => {
          state.letters.push({
            id,
            kind: input.kind,
            zones: input.kind === 'feeling' ? input.zones : [],
            feelingIds: input.kind === 'feeling' ? input.feelingIds : [],
            text: input.text,
            createdAt: at,
            updatedAt: at,
            timesShown: 0,
            ...(input.kind === 'date' ? { deliverOn: input.deliverOn, remind: !!input.remind } : {}),
            ...(input.showWhenIntense ? { showWhenIntense: true } : {}),
            ...(input.fromReflection ? { fromReflection: input.fromReflection } : {}),
          });
        });
        return id;
      },
      updateLetter: (id, input) =>
        edit(id, (l) => {
          if (input.kind) l.kind = input.kind;
          if (input.text !== undefined) l.text = input.text;
          if (input.zones) l.zones = l.kind === 'feeling' ? input.zones : [];
          if (input.feelingIds) l.feelingIds = l.kind === 'feeling' ? input.feelingIds : [];
          if (l.kind === 'date') {
            if (input.deliverOn !== undefined) {
              if (input.deliverOn !== l.deliverOn) l.deliveredAt = undefined;
              l.deliverOn = input.deliverOn;
            }
            if (input.remind !== undefined) l.remind = input.remind;
          } else {
            l.deliverOn = undefined;
            l.remind = undefined;
          }
          if (input.showWhenIntense !== undefined) l.showWhenIntense = input.showWhenIntense || undefined;
        }),
      deleteLetter: (id) =>
        set((state) => {
          state.letters = state.letters.filter((l) => l.id !== id);
          state.later = state.later.filter((x) => x !== id);
        }),
      setPaused: (id, paused) => edit(id, (l) => void (l.paused = paused || undefined)),
      setHidden: (id, hidden) => edit(id, (l) => void (l.hidden = hidden || undefined)),
      markShown: (id) =>
        edit(
          id,
          (l) => {
            l.timesShown += 1;
            l.lastShownAt = now();
          },
          false
        ),
      markDelivered: (id) => edit(id, (l) => void (l.deliveredAt = l.deliveredAt ?? now()), false),
      setNotificationIds: (id, ids) => edit(id, (l) => void (l.notificationIds = ids.length ? ids : undefined), false),
      saveForLater: (id) =>
        set((state) => {
          if (!state.later.includes(id)) state.later.push(id);
        }),
      removeLater: (id) =>
        set((state) => {
          state.later = state.later.filter((x) => x !== id);
        }),
      setOfferedFor: (feelingId) =>
        set((state) => {
          state.offeredFor = feelingId;
        }),
    };
  })
);
