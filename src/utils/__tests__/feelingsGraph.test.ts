// Stage 2: the Feelings graph maths. One point per day (or month) with data,
// at its own position in the full period, never cut off before the end. The
// "graph stops at day 21" bug is pinned with data on days 25, 27, 29 and the
// last day of the month. IDs match docs/test-cases/date-time.md.
import fc from 'fast-check';
import {
  dailyTrendPoints,
  datesInRange,
  domainIndexForDate,
  domainLabels,
  domainSlotCount,
  hasSustainedSafeguardPattern,
  monthlyTrendPoints,
  monthlyTrendPointsInRange,
  nearestZoneForScore,
  patternsNaturalRange,
  rollingAverageTrend,
  zoneScore,
} from '../feelingsStats';
import { addDaysISO, daysInMonthISO } from '../date';
import { makeFeeling } from '../../test-utils';
import type { FeelingZone } from '../../types/sections';

const ZONES: FeelingZone[] = ['lively', 'calm', 'okay', 'tense', 'low'];

describe('FEEL-G: the graph range and its points', () => {
  test.each(['2026-02', '2028-02', '2026-04', '2026-10'])('FEEL-G-001 %s: data on days 25, 27, 29 and the last day all land in the month view, at their own day', (month) => {
    const r = patternsNaturalRange('month', `${month}-15`, { start: '', end: '' }, `${month}-15`);
    const last = daysInMonthISO(`${month}-01`);
    const days = [...new Set([25, 27, 29, last])].filter((d) => d <= last);
    const entries = days.map((d) => makeFeeling({ date: `${month}-${String(d).padStart(2, '0')}`, zone: 'calm' }));
    const points = dailyTrendPoints(entries, datesInRange(r.start, r.end));
    expect(points.map((p) => p.date)).toEqual(entries.map((e) => e.date));
    expect(points.map((p) => domainIndexForDate(r.start, p.date, 'day'))).toEqual(days.map((d) => d - 1));
    expect(domainSlotCount(r.start, r.end, 'day')).toBe(last); // the axis reaches the last day
  });

  test('FEEL-G-002 the year view has a point for December, at the 12th slot', () => {
    const entries = [makeFeeling({ date: '2026-01-03' }), makeFeeling({ date: '2026-12-31', zone: 'low' })];
    const pts = monthlyTrendPoints(entries, '2026');
    expect(pts.map((p) => p.key)).toEqual(['2026-01', '2026-12']);
    expect(domainIndexForDate('2026-01-01', pts[1].date, 'month')).toBe(11);
    expect(domainSlotCount('2026-01-01', '2026-12-31', 'month')).toBe(12);
  });

  test('FEEL-G-003 a custom range across a year boundary, by month: every month with data, in order', () => {
    const entries = ['2026-11-30', '2026-12-01', '2027-01-31', '2027-02-28'].map((date) => makeFeeling({ date }));
    expect(monthlyTrendPointsInRange(entries, '2026-11', '2027-02').map((p) => p.key)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  test('FEEL-G-004 a day\'s point is the average of its entries; days without entries have no point (a gap, not zero)', () => {
    const entries = [makeFeeling({ date: '2026-10-01', zone: 'lively' }), makeFeeling({ date: '2026-10-01', zone: 'low' }), makeFeeling({ date: '2026-10-03', zone: 'calm' })];
    const pts = dailyTrendPoints(entries, datesInRange('2026-10-01', '2026-10-03'));
    expect(pts.map((p) => [p.date, p.score])).toEqual([
      ['2026-10-01', 0],
      ['2026-10-03', zoneScore.calm],
    ]);
  });

  test('FEEL-G-005 every axis label slot exists, and the last day of a month always gets a label', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 200 }), fc.integer({ min: 1, max: 120 }), (offset, len) => {
        const start = addDaysISO('2026-01-01', offset);
        const labels = domainLabels(start, len, 'day');
        expect(labels).toHaveLength(len);
        if (len > 7) expect(labels[len - 1]).not.toBe('');
      })
    );
  });
});

describe('FEEL-G: scores and smoothing', () => {
  test('FEEL-G-010 the nearest zone for a zone\'s own score is that zone', () => {
    for (const z of ZONES) expect(nearestZoneForScore(zoneScore[z])).toBe(z);
  });

  test('FEEL-G-011 smoothing keeps one point per point, stays within the range of the scores, and a window of 1 changes nothing', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...ZONES), { minLength: 1, maxLength: 60 }), fc.integer({ min: 1, max: 10 }), (zones, w) => {
        const pts = dailyTrendPoints(
          zones.map((zone, i) => makeFeeling({ date: addDaysISO('2026-01-01', i), zone })),
          datesInRange('2026-01-01', addDaysISO('2026-01-01', zones.length - 1))
        );
        const smooth = rollingAverageTrend(pts, w);
        expect(smooth).toHaveLength(pts.length);
        const lo = Math.min(...pts.map((p) => p.score));
        const hi = Math.max(...pts.map((p) => p.score));
        for (const p of smooth) {
          expect(p.score).toBeGreaterThanOrEqual(lo - 1e-9);
          expect(p.score).toBeLessThanOrEqual(hi + 1e-9);
        }
        if (w === 1) expect(smooth).toEqual(pts);
      })
    );
  });
});

describe('FEEL-G: the gentle "heavier than usual" note', () => {
  const heavyId = 'sad-depressed';
  test('FEEL-G-020 shows from the 8th day with a heavy word in 14 days, not the 7th; old days don\'t count', () => {
    const on = (n: number) => Array.from({ length: n }, (_, i) => makeFeeling({ date: addDaysISO('2026-10-18', -i), zone: 'low', feelingIds: [heavyId] }));
    expect(hasSustainedSafeguardPattern(on(7), '2026-10-18')).toBe(false);
    expect(hasSustainedSafeguardPattern(on(8), '2026-10-18')).toBe(true);
    const old = Array.from({ length: 10 }, (_, i) => makeFeeling({ date: addDaysISO('2026-09-01', -i), zone: 'low', feelingIds: [heavyId] }));
    expect(hasSustainedSafeguardPattern(old, '2026-10-18')).toBe(false);
    // Several entries on one day are still one day.
    const sameDay = Array.from({ length: 9 }, () => makeFeeling({ date: '2026-10-18', zone: 'low', feelingIds: [heavyId] }));
    expect(hasSustainedSafeguardPattern(sameDay, '2026-10-18')).toBe(false);
  });
});
