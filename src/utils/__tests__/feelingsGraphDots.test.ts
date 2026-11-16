// Found on a phone (2026-11-15): the Feelings graph didn't show every feeling
// logged, and some looked like they were on the wrong day. It drew one
// averaged point per day (per month in Year view): a second feeling that day
// only moved that point, and a mixed day (Lively and Low) showed as an "Okay"
// nobody logged. Now every feeling is its own dot, on its own day, in the
// order it was logged; the line is the average. Also run with
// TZ=Pacific/Auckland and America/Los_Angeles in CI (a day is the phone's).
// IDs: docs/test-cases/integration.md (GRAPH-*)
import { dailyTrendPoints, datesInRange, dotCountLabel, dotSegments, feelingDots, patternsNaturalRange } from '../feelingsStats';
import type { FeelingCheckIn, FeelingZone } from '../../types/sections';

// A feeling logged at a local time on a local day.
const at = (id: string, zone: FeelingZone, day: string, hh: number, mm = 0): FeelingCheckIn => {
  const [y, m, d] = day.split('-').map(Number);
  return { id, zone, feelingIds: [], date: day, createdAt: new Date(y, m - 1, d, hh, mm).toISOString() };
};

const WEEK = patternsNaturalRange('week', '2026-11-15', { start: '', end: '' }, '2026-11-15'); // Nov 9..15

test('GRAPH-001 every feeling in the period is a dot: three on one day are three dots, not one average', () => {
  const entries = [at('a', 'lively', '2026-11-15', 8), at('b', 'low', '2026-11-15', 13), at('c', 'tense', '2026-11-15', 21), at('d', 'calm', '2026-11-12', 10)];
  const dots = feelingDots(entries, WEEK.start, WEEK.end, 'day');
  expect(dots.map((d) => d.key).sort()).toEqual(['a', 'b', 'c', 'd']);
  // The old graph: one point for the 15th (an average no one logged).
  expect(dailyTrendPoints(entries, datesInRange(WEEK.start, WEEK.end)).filter((p) => p.date === '2026-11-15')).toHaveLength(1);
  // Each dot keeps its own feeling.
  expect(dots.filter((d) => d.date === '2026-11-15').map((d) => d.zone)).toEqual(['lively', 'low', 'tense']);
});

test('GRAPH-002 each dot sits in its own day\'s slot (never the next or the previous), in the order it was logged', () => {
  const entries = [at('late', 'calm', '2026-11-14', 23, 59), at('early', 'tense', '2026-11-14', 0, 1), at('noon', 'low', '2026-11-14', 12), at('next', 'lively', '2026-11-15', 0, 30)];
  const dots = feelingDots(entries, WEEK.start, WEEK.end, 'day');
  const slot14 = 5; // Nov 9 is slot 0
  for (const id of ['early', 'noon', 'late']) {
    const d = dots.find((x) => x.key === id)!;
    expect({ id, slot: Math.round(d.x) }).toEqual({ id, slot: slot14 });
  }
  expect(Math.round(dots.find((x) => x.key === 'next')!.x)).toBe(6);
  expect(dots.filter((d) => d.date === '2026-11-14').map((d) => d.key)).toEqual(['early', 'noon', 'late']);
  expect(dotCountLabel(dots, slot14)).toBe('3 feelings');
  expect(dotCountLabel(dots, 6)).toBe('1 feeling');
});

test('GRAPH-003 a feeling for another day (a journal page for yesterday) sits on that day, in the middle', () => {
  const journal: FeelingCheckIn = { ...at('j', 'calm', '2026-11-13', 12), createdAt: new Date(2026, 10, 15, 9).toISOString(), source: { kind: 'journal', refId: 'p' } };
  const d = feelingDots([journal], WEEK.start, WEEK.end, 'day')[0];
  expect(d.x).toBeCloseTo(4, 5); // Nov 13, the middle of its slot
});

test('GRAPH-004 Year view: every feeling is a dot inside its own month (not one average per month)', () => {
  const year = patternsNaturalRange('year', '2026-11-15', { start: '', end: '' }, '2026-11-15');
  const entries = [at('a', 'low', '2026-01-01', 9), at('b', 'lively', '2026-01-31', 9), at('c', 'calm', '2026-11-15', 9), at('d', 'tense', '2026-11-15', 20)];
  const dots = feelingDots(entries, year.start, year.end, 'month');
  expect(dots).toHaveLength(4);
  expect(dots.filter((x) => Math.round(x.x) === 0).map((x) => x.key).sort()).toEqual(['a', 'b']);
  expect(dots.filter((x) => Math.round(x.x) === 10).map((x) => x.key).sort()).toEqual(['c', 'd']);
  expect(dots.every((x) => x.x > -0.5 && x.x < 11.5)).toBe(true);
});

test('GRAPH-005 only the period\'s feelings: one the day before it starts or after it ends is not drawn', () => {
  const dots = feelingDots([at('before', 'low', '2026-11-08', 23, 59), at('in', 'low', '2026-11-09', 0, 0), at('after', 'low', '2026-11-16', 0, 1)], WEEK.start, WEEK.end, 'day');
  expect(dots.map((d) => d.key)).toEqual(['in']);
});

test('GRAPH-006 Energy as well as Pleasantness: the dot\'s height is its own feeling\'s', () => {
  const [p] = feelingDots([at('a', 'tense', '2026-11-15', 9)], WEEK.start, WEEK.end, 'day', 'pleasantness');
  const [e] = feelingDots([at('a', 'tense', '2026-11-15', 9)], WEEK.start, WEEK.end, 'day', 'energy');
  expect(p.score).toBeLessThan(0); // unpleasant
  expect(e.score).toBeGreaterThan(0); // high energy
});

test('GRAPH-007 one line joins every dot, in the order logged, across days with none between (owner, 2026-11-16)', () => {
  const entries = [at('c', 'tense', '2026-11-15', 21), at('a', 'calm', '2026-11-10', 9), at('b1', 'low', '2026-11-12', 8), at('b2', 'lively', '2026-11-12', 18)];
  const dots = feelingDots(entries, WEEK.start, WEEK.end, 'day');
  const segs = dotSegments(dots);
  expect(segs.map(([x, y]) => `${x.key}->${y.key}`)).toEqual(['a->b1', 'b1->b2', 'b2->c']);
  expect(segs).toHaveLength(dots.length - 1);
  // Each piece goes left to right (never back in time).
  for (const [x, y] of segs) expect(y.x).toBeGreaterThan(x.x);
  expect(dotSegments([])).toEqual([]);
  expect(dotSegments(dots.slice(0, 1))).toEqual([]);
});

