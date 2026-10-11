import type { ReadingListEntry, ReadingSession } from '../types/sections';

// Page-based progress for one book. Pure functions — the store and the Book
// screen both lean on these, and they're what the tests pin down.

// Nobody's book has more pages than this; anything bigger is a typo.
export const MAX_PAGES = 20000;

// When the "about N hours left" line is allowed to appear. Kept loose on
// purpose (two sessions) so it shows up early, but only with real data.
export const ESTIMATE_CONFIG = {
  minSessions: 2, // sessions that recorded both pages and time
  minMinutes: 30, // total reading time across those sessions
  recentSessions: 5, // pace is measured over this many most-recent sessions
};

// Whole number between 1 and MAX_PAGES, or undefined for empty/invalid input.
export function sanitizePageCount(raw: string | number | undefined | null): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (typeof raw === 'string' && !raw.trim()) return undefined;
  if (!Number.isFinite(n)) return undefined;
  const whole = Math.floor(n);
  if (whole < 1) return undefined;
  return Math.min(whole, MAX_PAGES);
}

export interface BookProgress {
  current?: number;
  total?: number;
  left?: number;
  fraction?: number; // 0..1, only when a total exists
}

export function bookProgress(entry: Pick<ReadingListEntry, 'totalPages' | 'currentPage'>): BookProgress {
  const total = entry.totalPages;
  const current = entry.currentPage;
  if (!total) return { current };
  const at = Math.min(current ?? 0, total);
  return { current, total, left: total - at, fraction: at / total };
}

export function describeProgress(p: BookProgress): string | undefined {
  if (p.total && p.current) {
    if (p.left === 0) return `Page ${p.current} of ${p.total} — you've reached the end.`;
    return `Page ${p.current} of ${p.total}, ${p.left} ${p.left === 1 ? 'page' : 'pages'} left.`;
  }
  if (p.total) return `${p.total} pages`;
  if (p.current) return `Page ${p.current}`;
  return undefined;
}

// Pre-fill for "Which page are you starting from?" — where the reader got to
// last time, or page 1 for a book they haven't logged pages for.
export function suggestedStartPage(entry: Pick<ReadingListEntry, 'totalPages' | 'currentPage'>): number {
  const page = entry.currentPage ?? 1;
  return entry.totalPages ? Math.min(page, entry.totalPages) : page;
}

export type StartPageCheck = { ok: true; page: number } | { ok: false; error: string };

export function validateStartPage(raw: string | number, total: number | undefined): StartPageCheck {
  const page = sanitizePageCount(raw);
  if (page === undefined) return { ok: false, error: 'Enter a page number (1 or more).' };
  if (total && page > total) return { ok: false, error: `This book has ${total} pages — pick a page up to ${total}.` };
  return { ok: true, page };
}

export type EndPageKind = 'normal' | 'reread' | 'beyondTotal' | 'finished';

export function classifyEndPage(start: number | undefined, end: number, total: number | undefined): EndPageKind {
  if (total && end > total) return 'beyondTotal';
  if (start !== undefined && end < start) return 'reread';
  if (total && end === total) return 'finished';
  return 'normal';
}

export function pagesBetween(start: number | undefined, end: number | undefined): number | undefined {
  if (start === undefined || end === undefined) return undefined;
  return Math.max(0, end - start);
}

// Pages per minute over the most recent sessions that recorded both pages and
// time. Undefined when there isn't enough to say anything honest.
export function readingPace(sessions: ReadingSession[], cfg = ESTIMATE_CONFIG): number | undefined {
  const usable = sessions
    .filter((s) => s.minutes > 0 && (s.pagesRead ?? 0) > 0)
    .sort((a, b) => (b.date === a.date ? 0 : b.date.localeCompare(a.date)))
    .slice(0, cfg.recentSessions);
  if (usable.length < cfg.minSessions) return undefined;
  const minutes = usable.reduce((sum, s) => sum + s.minutes, 0);
  if (minutes < cfg.minMinutes) return undefined;
  const pages = usable.reduce((sum, s) => sum + (s.pagesRead ?? 0), 0);
  return pages / minutes;
}

export function estimateMinutesLeft(sessions: ReadingSession[], pagesLeft: number | undefined, cfg = ESTIMATE_CONFIG): number | undefined {
  if (!pagesLeft || pagesLeft <= 0) return undefined;
  const pace = readingPace(sessions, cfg);
  if (!pace) return undefined;
  return Math.round(pagesLeft / pace);
}

// Soft wording, rounded so it never reads like a deadline.
export function formatTimeLeft(minutes: number): string {
  if (minutes < 60) {
    const m = Math.max(5, Math.round(minutes / 5) * 5);
    return `about ${m} minutes left at your pace`;
  }
  const hours = minutes / 60;
  if (hours < 10) {
    const rounded = Math.round(hours * 2) / 2;
    if (rounded === 1) return 'about an hour left at your pace';
    return `about ${rounded} hours left at your pace`;
  }
  return `about ${Math.round(hours)} hours left at your pace`;
}

// Used to keep progressPercent (the old manual-percent field) in step with
// pages, so anything still reading the percent sees sensible numbers.
export function percentFromPages(current: number | undefined, total: number | undefined): number | undefined {
  if (!total || current === undefined) return undefined;
  return Math.round((Math.min(current, total) / total) * 100);
}
