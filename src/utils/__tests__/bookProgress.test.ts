import {
  ESTIMATE_CONFIG,
  MAX_PAGES,
  bookProgress,
  classifyEndPage,
  describeProgress,
  estimateMinutesLeft,
  formatTimeLeft,
  readingPace,
  sanitizePageCount,
  suggestedStartPage,
  validateStartPage,
} from '../bookProgress';
import { useReadingListStore } from '../../store/useReadingListStore';
import type { ReadingSession } from '../../types/sections';

function session(date: string, minutes: number, pagesRead?: number): ReadingSession {
  return { id: `${date}-${minutes}`, entryId: 'b', date, minutes, pagesRead };
}

describe('bookProgress', () => {
  it('shows pages and pages left', () => {
    const p = bookProgress({ totalPages: 320, currentPage: 120 });
    expect(p).toEqual({ current: 120, total: 320, left: 200, fraction: 120 / 320 });
    expect(describeProgress(p)).toBe('Page 120 of 320, 200 pages left.');
  });

  it('has no bar (fraction) until a total exists', () => {
    expect(bookProgress({ currentPage: 40 }).fraction).toBeUndefined();
    expect(describeProgress(bookProgress({ currentPage: 40 }))).toBe('Page 40');
    expect(describeProgress(bookProgress({}))).toBeUndefined();
  });

  it('follows a total changed later', () => {
    expect(bookProgress({ totalPages: 200, currentPage: 150 }).left).toBe(50);
    expect(bookProgress({ totalPages: 400, currentPage: 150 }).left).toBe(250);
    // Shrinking the total below the current page never goes negative.
    expect(bookProgress({ totalPages: 100, currentPage: 150 }).left).toBe(0);
  });

  it('suggests the last page reached, or 1 for a new book', () => {
    expect(suggestedStartPage({})).toBe(1);
    expect(suggestedStartPage({ currentPage: 95 })).toBe(95);
    expect(suggestedStartPage({ currentPage: 95, totalPages: 80 })).toBe(80);
  });
});

describe('page input', () => {
  it('accepts whole numbers only and caps very large numbers', () => {
    expect(sanitizePageCount('320')).toBe(320);
    expect(sanitizePageCount('12.7')).toBe(12);
    expect(sanitizePageCount('')).toBeUndefined();
    expect(sanitizePageCount('0')).toBeUndefined();
    expect(sanitizePageCount('-4')).toBeUndefined();
    expect(sanitizePageCount('abc')).toBeUndefined();
    expect(sanitizePageCount(99999999)).toBe(MAX_PAGES);
    expect(sanitizePageCount(Infinity)).toBeUndefined();
  });

  it('rejects a start page above the total', () => {
    expect(validateStartPage('400', 320)).toEqual({ ok: false, error: expect.stringContaining('320') });
    expect(validateStartPage('320', 320)).toEqual({ ok: true, page: 320 });
    expect(validateStartPage('400', undefined)).toEqual({ ok: true, page: 400 });
    expect(validateStartPage('', 320).ok).toBe(false);
  });

  it('classifies the end page', () => {
    expect(classifyEndPage(40, 95, 320)).toBe('normal');
    expect(classifyEndPage(40, 30, 320)).toBe('reread');
    expect(classifyEndPage(40, 330, 320)).toBe('beyondTotal');
    expect(classifyEndPage(40, 320, 320)).toBe('finished');
    expect(classifyEndPage(undefined, 30, 320)).toBe('normal');
    expect(classifyEndPage(40, 900, undefined)).toBe('normal');
  });
});

describe('time left estimate', () => {
  it('stays hidden with thin data', () => {
    expect(readingPace([])).toBeUndefined();
    expect(readingPace([session('2026-10-01', 40, 30)])).toBeUndefined(); // one session
    expect(readingPace([session('2026-10-01', 10, 8), session('2026-10-02', 10, 9)])).toBeUndefined(); // < 30 min
    expect(readingPace([session('2026-10-01', 40), session('2026-10-02', 40)])).toBeUndefined(); // time only
    expect(estimateMinutesLeft([session('2026-10-01', 40, 30)], 100)).toBeUndefined();
  });

  it('uses only the most recent sessions for pace', () => {
    const old = Array.from({ length: 10 }, (_, i) => session(`2026-09-0${i % 9 + 1}`, 60, 6)); // slow, long ago
    const recent = Array.from({ length: ESTIMATE_CONFIG.recentSessions }, (_, i) => session(`2026-10-1${i}`, 30, 30));
    expect(readingPace([...old, ...recent])).toBeCloseTo(1);
  });

  it('gives a sensible estimate for the 320-page example', () => {
    // 1 → 40 in 45 min, 40 → 95 in 60 min: 94 pages in 105 min.
    const store = useReadingListStore.getState();
    const id = store.addManualBook('Example', 'Author', 'reading', 320);
    store.addSession(id, 45, { startPage: 1, endPage: 40 }, '2026-10-01');
    store.addSession(id, 60, { startPage: 40, endPage: 95 }, '2026-10-02');

    const state = useReadingListStore.getState();
    const entry = state.entries.find((e) => e.id === id)!;
    const p = bookProgress(entry);
    expect(describeProgress(p)).toBe('Page 95 of 320, 225 pages left.');
    expect(entry.progressPercent).toBe(30);

    const mins = estimateMinutesLeft(state.sessions.filter((s) => s.entryId === id), p.left)!;
    expect(mins).toBeGreaterThan(220); // 225 pages ÷ (94/105) ≈ 251 min
    expect(mins).toBeLessThan(280);
    expect(formatTimeLeft(mins)).toBe('about 4 hours left at your pace');
  });

  it('words time softly', () => {
    expect(formatTimeLeft(42)).toBe('about 40 minutes left at your pace');
    expect(formatTimeLeft(2)).toBe('about 5 minutes left at your pace');
    expect(formatTimeLeft(65)).toBe('about an hour left at your pace');
    expect(formatTimeLeft(300)).toBe('about 5 hours left at your pace');
    expect(formatTimeLeft(1500)).toBe('about 25 hours left at your pace');
  });
});

describe('reading store pages', () => {
  it('saves a time-only session without moving the current page', () => {
    const store = useReadingListStore.getState();
    const id = store.addManualBook('Time only', '', 'reading', 200);
    store.addSession(id, 30, { startPage: 10, endPage: 50 });
    store.addSession(id, 20, { startPage: 50 });
    const entry = useReadingListStore.getState().entries.find((e) => e.id === id)!;
    expect(entry.currentPage).toBe(50);
    const latest = useReadingListStore.getState().sessions[0];
    expect(latest.pagesRead).toBeUndefined();
    expect(latest.minutes).toBe(20);
  });

  it('updates the total later and marks finished', () => {
    const store = useReadingListStore.getState();
    const id = store.addManualBook('Grows', '', 'reading', 300);
    store.addSession(id, 30, { startPage: 280, endPage: 310 });
    store.setTotalPages(id, 310);
    let entry = useReadingListStore.getState().entries.find((e) => e.id === id)!;
    expect(entry.totalPages).toBe(310);
    expect(entry.progressPercent).toBe(100);

    store.markFinished(id, { rating: 4, reflection: '  Loved the ending ' });
    entry = useReadingListStore.getState().entries.find((e) => e.id === id)!;
    expect(entry.status).toBe('finished');
    expect(entry.rating).toBe(4);
    expect(entry.notes).toBe('Loved the ending');
  });

  it("treats 'I'm not sure' as no total", () => {
    const store = useReadingListStore.getState();
    const id = store.addManualBook('Unknown length', '', 'reading', undefined);
    store.setTotalPages(id, 250);
    store.setTotalPages(id, undefined);
    expect(useReadingListStore.getState().entries.find((e) => e.id === id)!.totalPages).toBeUndefined();
  });
});
