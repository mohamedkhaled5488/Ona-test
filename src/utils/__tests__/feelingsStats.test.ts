import {
  patternsNaturalRange,
  dailyTrendPoints,
  datesInRange,
  domainIndexForDate,
  domainSlotCount,
  domainLabels,
  tagImpactRanking,
  describeTagImpact,
  tagZoneDistribution,
  tagTrend,
  tagCooccurrences,
  tagPrimaryZone,
  describeTagHeadline,
  analysisMinCount,
  tagFeelingBreakdown,
} from '../feelingsStats';
import type { FeelingCheckIn } from '../../types/sections';

function checkIn(
  date: string,
  zone: FeelingCheckIn['zone'] = 'okay',
  reasonTags?: string[],
  feelingIds: string[] = ['okay-okay'],
  note?: string
): FeelingCheckIn {
  return { id: `t-${date}-${Math.random()}`, feelingIds, zone, date, reasonTags, note, createdAt: `${date}T12:00:00Z` };
}

describe('patternsNaturalRange', () => {
  const today = '2026-09-29';

  // Month and Year always span the FULL calendar period, including days
  // after today when viewing the current month/year — an earlier fix
  // attempt capped the end date at today instead, which turned out not to
  // be the actual bug (see the domain-based positioning tests below for the
  // real fix) and made the axis stop before the true month-end.
  it('spans the full current month through its real last day, not just through today', () => {
    const range = patternsNaturalRange('month', today, { start: today, end: today }, today);
    expect(range.start).toBe('2026-09-01');
    expect(range.end).toBe('2026-09-30');
    expect(range.granularity).toBe('day');
  });

  it('spans a past month through its real last day', () => {
    const range = patternsNaturalRange('month', '2026-08-15', { start: today, end: today }, today);
    expect(range.start).toBe('2026-08-01');
    expect(range.end).toBe('2026-08-31');
  });

  it('spans the full current year through December 31st', () => {
    const range = patternsNaturalRange('year', today, { start: today, end: today }, today);
    expect(range.start).toBe('2026-01-01');
    expect(range.end).toBe('2026-12-31');
    expect(range.granularity).toBe('month');
  });

  it('spans a past year through December 31st', () => {
    const range = patternsNaturalRange('year', '2025-06-01', { start: today, end: today }, today);
    expect(range.end).toBe('2025-12-31');
  });

  it('the week view always ends at today', () => {
    const range = patternsNaturalRange('week', today, { start: today, end: today }, today);
    expect(range.end).toBe(today);
    expect(range.start).toBe('2026-09-23');
  });

  it('a custom range is used exactly as given', () => {
    const range = patternsNaturalRange('custom', today, { start: '2026-09-01', end: '2026-09-29' }, today);
    expect(range.start).toBe('2026-09-01');
    expect(range.end).toBe('2026-09-29');
  });
});

describe('dailyTrendPoints — end-of-month coverage', () => {
  it('plots every logged day through the end of the month, including days 25-29', () => {
    const today = '2026-09-29';
    const entries: FeelingCheckIn[] = Array.from({ length: 29 }, (_, i) => checkIn(`2026-09-${String(i + 1).padStart(2, '0')}`));

    const range = patternsNaturalRange('month', today, { start: today, end: today }, today);
    const points = dailyTrendPoints(entries, datesInRange(range.start, range.end));

    expect(points).toHaveLength(29);
    expect(points[points.length - 1].date).toBe('2026-09-29');
    ['2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29'].forEach((date) => {
      expect(points.some((p) => p.date === date)).toBe(true);
    });
  });

  it('does not invent a point for a day with no check-in', () => {
    const entries: FeelingCheckIn[] = Array.from({ length: 15 }, (_, i) => checkIn(`2026-09-${String(i + 1).padStart(2, '0')}`));
    const points = dailyTrendPoints(entries, datesInRange('2026-09-01', '2026-09-30'));

    expect(points).toHaveLength(15);
    expect(points.some((p) => p.date === '2026-09-16')).toBe(false);
  });
});

// The actual Round 2 bug: the chart used to position each point by "its
// index among the points that have data" rather than by its real date, so
// a month with a gap (the normal case — check-ins are naturally sparse, and
// this is also what a zone/reason filter produces) had its last real point
// stretched all the way to the right edge of the chart, making the axis
// look like it stopped at whatever day that happened to be — reproduced
// exactly by filtering the demo data to a zone whose last September
// occurrence was day 21, which is the "day 21" the bug reports described.
describe('domain-based x-axis positioning (fixes the "stops early" bug)', () => {
  it("a day near month-end keeps its real position even when earlier days have no check-in", () => {
    // Sparse: only days 10-21 and day 29 have a check-in — days 1-9 and
    // 22-28 are gaps. If positioning were index-based, day 29 (the 9th
    // point in this 9-point array) would render at the far-right edge
    // exactly like day 21 does today — indistinguishable from a real
    // month-end. Domain-based positioning must place it near, but not at,
    // the true end of a 30-slot month.
    const slotCount = domainSlotCount('2026-09-01', '2026-09-30', 'day');
    expect(slotCount).toBe(30);

    const day21Index = domainIndexForDate('2026-09-01', '2026-09-21', 'day');
    const day29Index = domainIndexForDate('2026-09-01', '2026-09-29', 'day');
    expect(day21Index).toBe(20);
    expect(day29Index).toBe(28);
    // Day 29 must sit further along the fixed 30-slot domain than day 21,
    // and neither should be at the very last slot (slot 29, day 30).
    expect(day29Index).toBeGreaterThan(day21Index);
    expect(day29Index).toBeLessThan(slotCount - 1);
  });

  it('reproduces the exact reported symptom: a zone filter leaving only days 10-21 does not make the axis end at 21', () => {
    // This mirrors the live repro: filtering the month to a zone that only
    // occurred on days 10, 11, 14-18 and 21 used to render those 8 points
    // stretched edge-to-edge, so the last one (day 21) landed at the exact
    // right edge of the chart — indistinguishable from "the month ends on
    // the 21st." The fix must place it at its real fixed slot instead.
    const sparseDays = [10, 11, 14, 15, 16, 17, 18, 21];
    const slotCount = domainSlotCount('2026-09-01', '2026-09-30', 'day');
    const lastPointSlot = domainIndexForDate('2026-09-01', '2026-09-21', 'day');

    expect(lastPointSlot).toBe(20); // 0-based: the 21st is slot 20 of 30
    expect(lastPointSlot).toBeLessThan(slotCount - 1); // not stretched to the last slot
    expect(sparseDays).toHaveLength(8); // sanity: this really is a sparse subset, not the full month
  });

  it('domain slot count and labels reflect the full month regardless of how many days have data', () => {
    const slotCount = domainSlotCount('2026-09-01', '2026-09-30', 'day');
    const labels = domainLabels('2026-09-01', slotCount, 'day');
    expect(labels).toHaveLength(30);
    expect(labels[0]).toBe('1');
    expect(labels[labels.length - 1]).toBe('30'); // the real month-end, always present on the axis
  });

  it('month-granularity (Year view) domain index counts months, not array position', () => {
    expect(domainIndexForDate('2026-01-01', '2026-01-01', 'month')).toBe(0);
    expect(domainIndexForDate('2026-01-01', '2026-09-01', 'month')).toBe(8);
    expect(domainSlotCount('2026-01-01', '2026-12-31', 'month')).toBe(12);
  });
});

describe('tagImpactRanking (Analysis partition)', () => {
  it('ranks by the size of the shift from baseline, not by raw frequency', () => {
    const entries: FeelingCheckIn[] = [
      // Baseline: a run of neutral/okay days with no tag.
      ...Array.from({ length: 20 }, (_, i) => checkIn(`2026-08-${String(i + 1).padStart(2, '0')}`, 'okay')),
      // "Work" (common, 6 uses) drags noticeably low (tense = -1 each time).
      ...Array.from({ length: 6 }, (_, i) => checkIn(`2026-09-${String(i + 1).padStart(2, '0')}`, 'tense', ['Work'])),
      // "Weather" (rare, 5 uses — right at the threshold) is lively every time — a huge, rare effect.
      ...Array.from({ length: 5 }, (_, i) => checkIn(`2026-09-${String(i + 10).padStart(2, '0')}`, 'lively', ['Weather'])),
    ];

    const ranking = tagImpactRanking(entries);
    expect(ranking.map((r) => r.tag)).toEqual(['Weather', 'Work']);
    expect(ranking[0].delta).toBeGreaterThan(0); // Weather skews toward Lively (higher pleasantness)
    expect(ranking[1].delta).toBeLessThan(0); // Work skews toward Tense (lower pleasantness)
  });

  it('excludes a tag below the minimum sample size, however large its apparent effect', () => {
    const entries: FeelingCheckIn[] = [
      ...Array.from({ length: 10 }, (_, i) => checkIn(`2026-08-${String(i + 1).padStart(2, '0')}`, 'okay')),
      checkIn('2026-09-01', 'low', ['Money']),
      checkIn('2026-09-02', 'low', ['Money']),
    ];
    const ranking = tagImpactRanking(entries);
    expect(ranking.find((r) => r.tag === 'Money')).toBeUndefined();
  });

  it('describes an impact in correlational, non-causal language', () => {
    const sentence = describeTagImpact({ tag: 'Work', count: 8, avgScore: -1, baselineScore: 0, delta: -1 });
    expect(sentence).toBe('Work days average noticeably lower than your typical day.');
    expect(sentence.toLowerCase()).not.toContain('causes');
    expect(sentence.toLowerCase()).not.toContain('makes you');
  });
});

describe('tagZoneDistribution', () => {
  it('shows the real zone mix behind a tag, not just a single average', () => {
    const entries: FeelingCheckIn[] = [
      checkIn('2026-09-01', 'tense', ['Work']),
      checkIn('2026-09-02', 'tense', ['Work']),
      checkIn('2026-09-03', 'low', ['Work']),
      checkIn('2026-09-04', 'okay', ['Work']),
      checkIn('2026-09-05', 'calm', ['Work']),
    ];
    const dist = tagZoneDistribution(entries, 'Work');
    expect(dist?.count).toBe(5);
    expect(dist?.percentages.tense).toBe(40);
    expect(dist?.percentages.low).toBe(20);
    expect(dist?.percentages.okay).toBe(20);
    expect(dist?.percentages.calm).toBe(20);
  });

  it('returns undefined for a tag with no check-ins at all', () => {
    expect(tagZoneDistribution([checkIn('2026-09-01', 'okay')], 'Money')).toBeUndefined();
  });
});

describe('tagFeelingBreakdown (the specific feeling words behind a tag, not just its zone)', () => {
  it('breaks a tag down by the actual feelings chosen, most common first', () => {
    const entries: FeelingCheckIn[] = [
      checkIn('2026-09-01', 'tense', ['Work'], ['tense-stressed']),
      checkIn('2026-09-02', 'tense', ['Work'], ['tense-stressed']),
      checkIn('2026-09-03', 'calm', ['Work'], ['calm-calm']),
      checkIn('2026-09-04', 'tense', ['Work'], ['tense-stressed']),
    ];
    const breakdown = tagFeelingBreakdown(entries, 'Work');
    expect(breakdown[0]).toEqual({ feeling: 'Stressed', count: 3, percentage: 75, notes: [] });
    expect(breakdown[1]).toEqual({ feeling: 'Calm', count: 1, percentage: 25, notes: [] });
  });

  it('counts a blended two-feeling check-in under both feelings', () => {
    const entries: FeelingCheckIn[] = [checkIn('2026-09-01', 'tense', ['Work'], ['tense-stressed', 'scared-anxious'])];
    const breakdown = tagFeelingBreakdown(entries, 'Work');
    expect(breakdown.map((r) => r.feeling).sort()).toEqual(['Anxious', 'Stressed']);
  });

  it('returns an empty list for a tag with no check-ins at all', () => {
    expect(tagFeelingBreakdown([checkIn('2026-09-01', 'okay')], 'Money')).toEqual([]);
  });

  it('carries along any note left on a check-in, under the feeling it belongs to', () => {
    const entries: FeelingCheckIn[] = [
      checkIn('2026-09-01', 'tense', ['Work'], ['tense-stressed'], 'Deadline moved up again'),
      checkIn('2026-09-02', 'tense', ['Work'], ['tense-stressed']), // no note
      checkIn('2026-09-03', 'calm', ['Work'], ['calm-calm'], 'Finished the big task'),
    ];
    const breakdown = tagFeelingBreakdown(entries, 'Work');
    const stressed = breakdown.find((r) => r.feeling === 'Stressed');
    const calm = breakdown.find((r) => r.feeling === 'Calm');
    expect(stressed?.notes).toEqual(['Deadline moved up again']);
    expect(calm?.notes).toEqual(['Finished the big task']);
  });
});

describe('tagTrend', () => {
  it('reports a factual percent change between two periods', () => {
    const current = [checkIn('2026-09-01', 'low', ['Sleep']), checkIn('2026-09-02', 'low', ['Sleep']), checkIn('2026-09-03', 'okay', ['Sleep'])];
    const previous = [checkIn('2026-08-01', 'low', ['Sleep']), checkIn('2026-08-02', 'low', ['Sleep'])];
    const trend = tagTrend(current, previous, 'Sleep');
    expect(trend.currentCount).toBe(3);
    expect(trend.previousCount).toBe(2);
    expect(trend.percentChange).toBe(50);
    expect(trend.direction).toBe('more');
  });

  it('has no percent figure when there was no previous-period baseline', () => {
    const trend = tagTrend([checkIn('2026-09-01', 'low', ['Sleep'])], [], 'Sleep');
    expect(trend.percentChange).toBeNull();
    expect(trend.direction).toBe('more');
  });
});

describe('tagCooccurrences', () => {
  it('flags a pair that co-occurs more than chance alone would predict', () => {
    const entries: FeelingCheckIn[] = [
      ...Array.from({ length: 6 }, (_, i) => checkIn(`2026-09-${String(i + 1).padStart(2, '0')}`, 'tense', ['Work', 'Sleep'])),
      ...Array.from({ length: 10 }, (_, i) => checkIn(`2026-08-${String(i + 1).padStart(2, '0')}`, 'okay', ['Weather'])),
    ];
    const pairs = tagCooccurrences(entries);
    expect(pairs.some((p) => (p.tagA === 'Sleep' && p.tagB === 'Work') || (p.tagA === 'Work' && p.tagB === 'Sleep'))).toBe(true);
  });

  it('does not flag a pair below the minimum sample size', () => {
    const entries: FeelingCheckIn[] = [checkIn('2026-09-01', 'tense', ['Work', 'Sleep']), checkIn('2026-09-02', 'tense', ['Work', 'Sleep'])];
    expect(tagCooccurrences(entries)).toHaveLength(0);
  });
});

describe('tagPrimaryZone and describeTagHeadline (bold "Biggest impact" cards)', () => {
  it('picks the dominant zone and a concrete recent count, not a raw percentage', () => {
    const entries: FeelingCheckIn[] = [
      checkIn('2026-09-01', 'tense', ['Work']),
      checkIn('2026-09-02', 'tense', ['Work']),
      checkIn('2026-09-03', 'tense', ['Work']),
      checkIn('2026-09-04', 'tense', ['Work']),
      checkIn('2026-09-05', 'low', ['Work']),
    ];
    const primary = tagPrimaryZone(entries, 'Work');
    expect(primary?.zone).toBe('tense');
    expect(primary?.recentCount).toBe(4);
    expect(primary?.recentOf).toBe(5);
  });

  it('caps the recent count at the configured window even with much more history', () => {
    const entries: FeelingCheckIn[] = Array.from({ length: 15 }, (_, i) => checkIn(`2026-08-${String(i + 1).padStart(2, '0')}`, 'tense', ['Work']));
    const primary = tagPrimaryZone(entries, 'Work', 10);
    expect(primary?.recentOf).toBe(10);
    expect(primary?.recentCount).toBe(10);
  });

  it('returns undefined for a tag that was never tagged', () => {
    expect(tagPrimaryZone([checkIn('2026-09-01', 'okay')], 'Money')).toBeUndefined();
  });

  it('states the headline confidently but never as causation', () => {
    const headline = describeTagHeadline('Work', { tag: 'Work', zone: 'tense', recentCount: 8, recentOf: 10 });
    expect(headline).toBe('Work is your strongest link to feeling Tense.');
    expect(headline.toLowerCase()).not.toMatch(/causes|makes you|is why/);
  });
});

describe('analysisMinCount (flat 3-repeat bar for Week/Month/Custom/All)', () => {
  it('uses the same bar of 3 for a week-long window', () => {
    expect(analysisMinCount(7)).toBe(3);
  });

  it('uses the same bar of 3 for a month-long window', () => {
    expect(analysisMinCount(30)).toBe(3);
  });

  it('uses the same bar of 3 for a long custom range or all-time history', () => {
    expect(analysisMinCount(90)).toBe(3);
    expect(analysisMinCount(365)).toBe(3);
  });

  it('lets a tag repeated 3 times in a week surface in the ranking', () => {
    const entries: FeelingCheckIn[] = [
      ...Array.from({ length: 4 }, (_, i) => checkIn(`2026-09-${String(i + 20).padStart(2, '0')}`, 'okay')),
      checkIn('2026-09-24', 'tense', ['Work']),
      checkIn('2026-09-25', 'tense', ['Work']),
      checkIn('2026-09-26', 'tense', ['Work']),
    ];
    const withWeekThreshold = tagImpactRanking(entries, analysisMinCount(7));
    expect(withWeekThreshold.map((r) => r.tag)).toEqual(['Work']); // 3 uses now clears the flat minimum of 3
  });
});
