import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Quote, ReadingListEntry, ReadingSession, ReadingStatus } from '../types/sections';
import { genId } from '../utils/id';
import { todayISO } from '../utils/date';
import { pagesBetween, percentFromPages, sanitizePageCount } from '../utils/bookProgress';

export interface QuoteInput {
  text: string;
  pageNumber?: number;
  note?: string;
  photoUri?: string;
}

export interface SessionPages {
  startPage?: number;
  endPage?: number;
  pagesRead?: number; // only when start/end aren't known
}

interface ReadingListState {
  entries: ReadingListEntry[];
  quotes: Quote[];
  sessions: ReadingSession[];

  addManualBook: (title: string, author: string, status: ReadingStatus, totalPages?: number) => string; // returns the new entry id
  removeEntry: (id: string) => void;
  setProgress: (id: string, percent: number) => void;
  setRating: (id: string, rating: number) => void;
  setNotes: (id: string, notes: string) => void;
  setCustomCover: (id: string, uri: string | undefined) => void;
  setTotalPages: (id: string, total: number | undefined) => void;
  setStatus: (id: string, status: ReadingStatus) => void;
  markFinished: (id: string, finish: { rating?: number; reflection?: string }) => void;

  addQuote: (entryId: string, input: QuoteInput) => string;
  updateQuote: (id: string, updates: Partial<QuoteInput>) => void;
  toggleQuoteFavorite: (id: string) => void;
  deleteQuote: (id: string) => void;

  // Returns the new session's id, or undefined when nothing was saved.
  addSession: (entryId: string, minutes: number, pages?: SessionPages, date?: string) => string | undefined;
  deleteSession: (id: string) => void;
}

export const useReadingListStore = create<ReadingListState>()(
  immer((set) => ({
    entries: [],
    quotes: [],
    sessions: [],

    // Every book is added this way — just a title and author, no discovery/
    // lookup API. See the Ona navigation restructure doc.
    addManualBook: (title, author, status, totalPages) => {
      const id = genId('reading');
      set((state) => {
        const now = new Date().toISOString();
        const bookId = genId('manual-book');
        state.entries.unshift({
          id,
          bookId,
          status,
          progressPercent: status === 'reading' ? 0 : undefined,
          totalPages: sanitizePageCount(totalPages),
          book: {
            id: bookId,
            title: title.trim() || 'Untitled book',
            authors: author.trim() ? [author.trim()] : [],
          },
          addedAt: now,
          updatedAt: now,
        });
      });
      return id;
    },

    removeEntry: (id) =>
      set((state) => {
        state.entries = state.entries.filter((e) => e.id !== id);
        state.quotes = state.quotes.filter((q) => q.entryId !== id);
        state.sessions = state.sessions.filter((s) => s.entryId !== id);
      }),

    setProgress: (id, percent) =>
      set((state) => {
        const entry = state.entries.find((e) => e.id === id);
        if (entry) {
          entry.progressPercent = Math.max(0, Math.min(100, percent));
          entry.updatedAt = new Date().toISOString();
        }
      }),

    setRating: (id, rating) =>
      set((state) => {
        const entry = state.entries.find((e) => e.id === id);
        if (entry) {
          entry.rating = rating;
          entry.updatedAt = new Date().toISOString();
        }
      }),

    setNotes: (id, notes) =>
      set((state) => {
        const entry = state.entries.find((e) => e.id === id);
        if (entry) {
          entry.notes = notes.trim() || undefined;
          entry.updatedAt = new Date().toISOString();
        }
      }),

    setCustomCover: (id, uri) =>
      set((state) => {
        const entry = state.entries.find((e) => e.id === id);
        if (entry) {
          entry.customCoverUri = uri;
          entry.updatedAt = new Date().toISOString();
        }
      }),

    setTotalPages: (id, total) =>
      set((state) => {
        const entry = state.entries.find((e) => e.id === id);
        if (!entry) return;
        entry.totalPages = sanitizePageCount(total);
        if (entry.totalPages && entry.currentPage) entry.progressPercent = percentFromPages(entry.currentPage, entry.totalPages);
        entry.updatedAt = new Date().toISOString();
      }),

    setStatus: (id, status) =>
      set((state) => {
        const entry = state.entries.find((e) => e.id === id);
        if (!entry) return;
        entry.status = status;
        if (status === 'reading' && entry.progressPercent === undefined) entry.progressPercent = 0;
        entry.updatedAt = new Date().toISOString();
      }),

    markFinished: (id, finish) =>
      set((state) => {
        const entry = state.entries.find((e) => e.id === id);
        if (!entry) return;
        entry.status = 'finished';
        entry.progressPercent = 100;
        if (entry.totalPages) entry.currentPage = entry.totalPages;
        if (finish.rating) entry.rating = finish.rating;
        if (finish.reflection?.trim()) entry.notes = finish.reflection.trim();
        entry.updatedAt = new Date().toISOString();
      }),

    addQuote: (entryId, input) => {
      const id = genId('quote');
      set((state) => {
        state.quotes.unshift({
          id,
          entryId,
          text: input.text.trim(),
          pageNumber: input.pageNumber,
          note: input.note?.trim() || undefined,
          photoUri: input.photoUri,
          favorite: false,
          createdAt: new Date().toISOString(),
        });
      });
      return id;
    },

    updateQuote: (id, updates) =>
      set((state) => {
        const quote = state.quotes.find((q) => q.id === id);
        if (!quote) return;
        if (updates.text !== undefined) quote.text = updates.text.trim();
        if (updates.pageNumber !== undefined) quote.pageNumber = updates.pageNumber;
        if (updates.note !== undefined) quote.note = updates.note.trim() || undefined;
        if (updates.photoUri !== undefined) quote.photoUri = updates.photoUri;
      }),

    toggleQuoteFavorite: (id) =>
      set((state) => {
        const quote = state.quotes.find((q) => q.id === id);
        if (quote) quote.favorite = !quote.favorite;
      }),

    deleteQuote: (id) =>
      set((state) => {
        state.quotes = state.quotes.filter((q) => q.id !== id);
      }),

    addSession: (entryId, minutes, pages, date) => {
      if (minutes <= 0) return undefined;
      const id = genId('readsession');
      set((state) => {
        const startPage = sanitizePageCount(pages?.startPage);
        const endPage = sanitizePageCount(pages?.endPage);
        const pagesRead = pagesBetween(startPage, endPage) ?? sanitizePageCount(pages?.pagesRead);
        state.sessions.unshift({ id, entryId, date: date ?? todayISO(), minutes, pagesRead: pagesRead || undefined, startPage, endPage });
        const entry = state.entries.find((e) => e.id === entryId);
        if (entry && endPage !== undefined) {
          entry.currentPage = endPage;
          if (entry.totalPages) entry.progressPercent = percentFromPages(endPage, entry.totalPages);
          entry.updatedAt = new Date().toISOString();
        }
      });
      return id;
    },

    deleteSession: (id) =>
      set((state) => {
        state.sessions = state.sessions.filter((s) => s.id !== id);
      }),
  }))
);

// Deterministic by ISO week number, so the same quote resurfaces all week
// rather than reshuffling on every render/app open.
export function weeklyResurfacedQuote(quotes: Quote[], todayIso: string): Quote | undefined {
  if (quotes.length === 0) return undefined;
  const d = new Date(`${todayIso}T00:00:00`);
  const start = new Date(d.getFullYear(), 0, 1);
  const weekNumber = Math.floor((d.getTime() - start.getTime()) / (7 * 86400000));
  const sorted = [...quotes].sort((a, b) => a.id.localeCompare(b.id));
  return sorted[weekNumber % sorted.length];
}

export function searchQuotes(quotes: Quote[], query: string): Quote[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return quotes.filter((quote) => quote.text.toLowerCase().includes(q) || quote.note?.toLowerCase().includes(q));
}

export function totalReadingMinutes(sessions: ReadingSession[], entryId: string): number {
  return sessions.filter((s) => s.entryId === entryId).reduce((sum, s) => sum + s.minutes, 0);
}

export function totalPagesRead(sessions: ReadingSession[], entryId: string): number {
  return sessions.filter((s) => s.entryId === entryId).reduce((sum, s) => sum + (s.pagesRead ?? 0), 0);
}
