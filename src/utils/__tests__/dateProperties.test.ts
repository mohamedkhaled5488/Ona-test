// Stage 2: date, streak and analysis maths as properties that must hold for
// any date, range and week start (fast-check tries hundreds of cases,
// including leap days, month and year ends, and both DST changes, which this
// zone has). IDs match docs/test-cases/date-time.md.
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import fc from 'fast-check';
import { addDaysISO, addMonthsISO, dayOfYear, daysBetweenISODates, daysInMonthISO, getMonthGrid, weekdayOfISO } from '../date';
import { datesInRange, domainIndexForDate, domainSlotCount, monthsBetweenISO, patternsNaturalRange, periodRange, weekStartFor } from '../feelingsStats';
import { completionRate, frequencyStreak, longestFrequencyStreak } from '../habitFrequency';
import { buildDayStatuses, milestoneBar, weeklyCompletion } from '../habitPattern';
import { buckets, insightRange } from '../planningInsights';
import { occursOn } from '../taskRepeat';
import { overviewInsight, tagInsight, ZONE_ORDER } from '../feelingsInsights';
import { confidenceFor } from '../../config/feelingsAnalysis';
import { estimateServerNow } from '../entitlement';
import type { FeelingZone, HabitFrequency } from '../../types/sections';
import { makeCheckIn, makeFeeling, makeHabit, makeTask } from '../../test-utils';

const RUNS = { numRuns: 300 };

// Any calendar date 1990–2100, built without the code under test.
const isoDate = fc.date({ min: new Date(Date.UTC(1990, 0, 1)), max: new Date(Date.UTC(2100, 11, 31)) }).map((d) => d.toISOString().slice(0, 10));
// Dates near the edges past bugs tripped on.
const trickyDate = fc.constantFrom('2026-03-07', '2026-03-08', '2026-03-09', '2026-10-31', '2026-11-01', '2026-11-02', '2028-02-28', '2028-02-29', '2028-03-01', '2027-02-28', '2026-12-31', '2027-01-01', '2026-09-30', '2026-01-31');
const anyDate = fc.oneof(isoDate, trickyDate);
const weekStart = fc.integer({ min: 0, max: 6 });
const span = fc.integer({ min: 0, max: 400 });

describe('DATE-P: calendar arithmetic', () => {
  test('DATE-P-001 adding days: back and forth, in steps, and the gap agree', () => {
    fc.assert(
      fc.property(anyDate, fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: -1000, max: 1000 }), (d, a, b) => {
        expect(addDaysISO(addDaysISO(d, a), -a)).toBe(d);
        expect(addDaysISO(addDaysISO(d, a), b)).toBe(addDaysISO(d, a + b));
        expect(daysBetweenISODates(d, addDaysISO(d, a))).toBe(a);
      }),
      RUNS
    );
  });

  test('DATE-P-002 the weekday moves on by exactly the days added', () => {
    fc.assert(fc.property(anyDate, fc.integer({ min: -800, max: 800 }), (d, n) => expect(weekdayOfISO(addDaysISO(d, n))).toBe((((weekdayOfISO(d) + n) % 7) + 7) % 7)), RUNS);
  });

  test('DATE-P-003 month length is 28–31 and the day after the last is the 1st', () => {
    fc.assert(
      fc.property(anyDate, (d) => {
        const len = daysInMonthISO(d);
        expect(len).toBeGreaterThanOrEqual(28);
        expect(len).toBeLessThanOrEqual(31);
        expect(addDaysISO(`${d.slice(0, 7)}-${String(len).padStart(2, '0')}`, 1).slice(8)).toBe('01');
      }),
      RUNS
    );
  });

  test('DATE-P-004 adding months lands on the 1st, the right number of months away', () => {
    fc.assert(
      fc.property(anyDate, fc.integer({ min: -60, max: 60 }), (d, m) => {
        const r = addMonthsISO(d, m);
        expect(r.slice(8)).toBe('01');
        expect(monthsBetweenISO(`${d.slice(0, 7)}-01`, r)).toBe(m);
      }),
      RUNS
    );
  });

  test('DATE-P-005 a month grid has every day once, in order, under the right weekday', () => {
    fc.assert(
      fc.property(anyDate, weekStart, (d, ws) => {
        const grid = getMonthGrid(d, ws);
        const lead = grid.findIndex((x) => x !== null);
        const days = grid.filter((x): x is string => !!x);
        expect(lead).toBeLessThan(7);
        expect(days).toHaveLength(daysInMonthISO(d));
        days.forEach((x, i) => expect(x).toBe(`${d.slice(0, 7)}-${String(i + 1).padStart(2, '0')}`));
        expect(weekdayOfISO(days[0])).toBe((ws + lead) % 7);
      }),
      RUNS
    );
  });

  test('DATE-P-006 day of the year goes 0, 1, 2… with no repeats or gaps', () => {
    fc.assert(
      fc.property(anyDate, (d) => {
        const next = addDaysISO(d, 1);
        if (next.slice(0, 4) === d.slice(0, 4)) expect(dayOfYear(next)).toBe(dayOfYear(d) + 1);
        else expect(dayOfYear(next)).toBe(0);
      }),
      RUNS
    );
  });

  test('DATE-P-007 the week a date belongs to starts on the chosen weekday, at most 6 days before', () => {
    fc.assert(
      fc.property(anyDate, weekStart, (d, ws) => {
        const s = weekStartFor(d, ws);
        expect(weekdayOfISO(s)).toBe(ws);
        const gap = daysBetweenISODates(s, d);
        expect(gap).toBeGreaterThanOrEqual(0);
        expect(gap).toBeLessThanOrEqual(6);
      }),
      RUNS
    );
  });
});

describe('DATE-P: ranges and the graph x-axis (the "cut off after day 21" bug)', () => {
  test('DATE-P-010 a range lists every day once, start to end', () => {
    fc.assert(
      fc.property(anyDate, span, (start, n) => {
        const end = addDaysISO(start, n);
        const days = datesInRange(start, end);
        expect(days).toHaveLength(n + 1);
        expect(days[0]).toBe(start);
        expect(days[days.length - 1]).toBe(end);
        days.slice(1).forEach((x, i) => expect(daysBetweenISODates(days[i], x)).toBe(1));
      }),
      RUNS
    );
  });

  test('DATE-P-011 every day of a range has its own slot, and the last day is the last slot', () => {
    fc.assert(
      fc.property(anyDate, span, (start, n) => {
        const end = addDaysISO(start, n);
        const slots = domainSlotCount(start, end, 'day');
        const idx = datesInRange(start, end).map((x) => domainIndexForDate(start, x, 'day'));
        expect(idx).toEqual(Array.from({ length: slots }, (_, i) => i));
        expect(domainIndexForDate(start, end, 'day')).toBe(slots - 1);
      }),
      RUNS
    );
  });

  test('DATE-P-012 by month: the last month of a range is the last slot', () => {
    fc.assert(
      fc.property(anyDate, fc.integer({ min: 0, max: 900 }), (start, n) => {
        const end = addDaysISO(start, n);
        expect(domainIndexForDate(start, end, 'month')).toBe(domainSlotCount(start, end, 'month') - 1);
      }),
      RUNS
    );
  });

  test('DATE-P-013 the month view covers the whole month: days 25–31 always have a slot', () => {
    fc.assert(
      fc.property(anyDate, (d) => {
        const r = patternsNaturalRange('month', d, { start: d, end: d }, d);
        expect(r.start).toBe(`${d.slice(0, 7)}-01`);
        expect(r.end).toBe(`${d.slice(0, 7)}-${String(daysInMonthISO(d)).padStart(2, '0')}`);
        for (const day of [25, 27, 29, daysInMonthISO(d)]) {
          if (day > daysInMonthISO(d)) continue;
          const date = `${d.slice(0, 7)}-${String(day).padStart(2, '0')}`;
          expect(domainIndexForDate(r.start, date, 'day')).toBe(day - 1);
          expect(day - 1).toBeLessThan(domainSlotCount(r.start, r.end, 'day'));
        }
      }),
      RUNS
    );
  });

  test('DATE-P-014 a week period is 7 days that include the anchor, starting on the week start', () => {
    fc.assert(
      fc.property(anyDate, weekStart, (d, ws) => {
        const r = periodRange('week', d, { start: d, end: d }, ws);
        expect(daysBetweenISODates(r.start, r.end)).toBe(6);
        expect(weekdayOfISO(r.start)).toBe(ws);
        expect(d >= r.start && d <= r.end).toBe(true);
      }),
      RUNS
    );
  });

  test('DATE-P-015 Insights buckets cover a range exactly: no gaps, no overlaps', () => {
    fc.assert(
      fc.property(anyDate, span, weekStart, fc.constantFrom('day', 'week') as fc.Arbitrary<'day' | 'week'>, (start, n, ws, g) => {
        const r = { start, end: addDaysISO(start, n) };
        const bs = buckets(r, g, ws);
        expect(bs[0].start).toBe(r.start);
        expect(bs[bs.length - 1].end).toBe(r.end);
        bs.slice(1).forEach((b, i) => expect(daysBetweenISODates(bs[i].end, b.start)).toBe(1));
      }),
      RUNS
    );
  });

  test('DATE-P-016 Insights month and quarter ranges run from a 1st to a month end', () => {
    fc.assert(
      fc.property(anyDate, weekStart, (d, ws) => {
        for (const kind of ['month', 'quarter'] as const) {
          const r = insightRange(kind, d, ws);
          expect(r.start.slice(8)).toBe('01');
          expect(r.end).toBe(`${d.slice(0, 7)}-${String(daysInMonthISO(d)).padStart(2, '0')}`);
        }
      }),
      RUNS
    );
  });
});

describe('HAB-P: streaks, rates and the habit pattern', () => {
  const freq = fc.oneof(
    fc.constant(undefined as HabitFrequency | undefined),
    fc.constant({ kind: 'daily' } as HabitFrequency),
    fc.uniqueArray(fc.integer({ min: 0, max: 6 }), { minLength: 1, maxLength: 7 }).map((days) => ({ kind: 'weekdays', days }) as HabitFrequency),
    fc.integer({ min: 1, max: 7 }).map((count) => ({ kind: 'perWeek', count }) as HabitFrequency)
  );
  // A habit's history: a start date and done/missed/nothing for each day after.
  const history = fc.record({
    start: anyDate,
    marks: fc.array(fc.constantFrom('done', 'missed', 'none'), { minLength: 1, maxLength: 90 }),
    freq,
  });
  const build = (h: { start: string; marks: string[] }) =>
    h.marks.flatMap((m, i) => (m === 'none' ? [] : [makeCheckIn({ habitId: 'h', date: addDaysISO(h.start, i), done: m === 'done' })]));

  test('HAB-P-001 a completion rate is 0–100 (or nothing planned); all planned days done is 100', () => {
    fc.assert(
      fc.property(history, (h) => {
        const end = addDaysISO(h.start, h.marks.length - 1);
        const rate = completionRate(build(h), 'h', h.freq, h.start, end);
        if (rate !== null) {
          expect(rate).toBeGreaterThanOrEqual(0);
          expect(rate).toBeLessThanOrEqual(100);
        }
        const allDone = h.marks.map((_, i) => makeCheckIn({ habitId: 'h', date: addDaysISO(h.start, i), done: true }));
        const full = completionRate(allDone, 'h', h.freq, h.start, end);
        if (full !== null && h.freq?.kind !== 'perWeek') expect(full).toBe(100);
      }),
      RUNS
    );
  });

  test('HAB-P-002 the current streak is never longer than the longest, and never negative', () => {
    fc.assert(
      fc.property(history, (h) => {
        const list = build(h);
        const today = addDaysISO(h.start, h.marks.length - 1);
        const cur = frequencyStreak(list, 'h', h.freq, today);
        const best = longestFrequencyStreak(list, 'h', h.freq);
        expect(cur.current).toBeGreaterThanOrEqual(0);
        expect(cur.current).toBeLessThanOrEqual(best.current);
      }),
      RUNS
    );
  });

  test('HAB-P-003 doing it on one more day never shortens the longest streak', () => {
    fc.assert(
      fc.property(history, fc.nat(), (h, k) => {
        const list = build(h);
        const day = addDaysISO(h.start, k % h.marks.length);
        const more = [...list.filter((c) => c.date !== day), makeCheckIn({ habitId: 'h', date: day, done: true })];
        expect(longestFrequencyStreak(more, 'h', h.freq).current).toBeGreaterThanOrEqual(longestFrequencyStreak(list, 'h', h.freq).current);
      }),
      RUNS
    );
  });

  test('HAB-P-004 the day pattern has one cell per day and matches every check-in', () => {
    fc.assert(
      fc.property(history, (h) => {
        const list = build(h);
        const end = addDaysISO(h.start, h.marks.length - 1);
        const cells = buildDayStatuses(makeHabit({ id: 'h', createdAt: h.start, frequency: h.freq }), list, h.start, end, end);
        expect(cells).toHaveLength(h.marks.length);
        for (const c of list) expect(cells.find((x) => x.date === c.date)!.status).toBe(c.done ? 'done' : 'missed');
      }),
      RUNS
    );
  });

  test('HAB-P-005 weekly rates are 0–100, and a week never counts more done than planned (scheduled habits)', () => {
    fc.assert(
      fc.property(history, (h) => {
        if (h.freq?.kind === 'perWeek') return;
        const end = addDaysISO(h.start, h.marks.length - 1);
        for (const w of weeklyCompletion(makeHabit({ id: 'h', createdAt: h.start, frequency: h.freq }), build(h), h.start, end, end)) {
          if (w.rate !== null) {
            expect(w.rate).toBeGreaterThanOrEqual(0);
            expect(w.rate).toBeLessThanOrEqual(100);
            expect(w.done).toBeLessThanOrEqual(w.planned);
          }
        }
      }),
      RUNS
    );
  });

  test('HAB-P-006 the milestone bar only moves forward and stays between 0 and 1', () => {
    fc.assert(
      fc.property(anyDate, fc.integer({ min: 7, max: 400 }), fc.integer({ min: 0, max: 500 }), (start, target, n) => {
        const habit = makeHabit({ createdAt: start, targetDays: target });
        const a = milestoneBar(habit, addDaysISO(start, n));
        const b = milestoneBar(habit, addDaysISO(start, n + 1));
        expect(a.progress).toBeGreaterThanOrEqual(0);
        expect(b.progress).toBeLessThanOrEqual(1);
        expect(b.progress).toBeGreaterThanOrEqual(a.progress);
        expect(b.day).toBe(a.day + 1);
        // Reached markers come first, then the rest.
        const reached = a.markers.map((m) => m.reached);
        expect(reached).toEqual([...reached].sort((x, y) => Number(y) - Number(x)));
      }),
      RUNS
    );
  });
});

describe('TASK-P: repeating tasks', () => {
  test('TASK-P-001 a daily task is on every day from its start, never before', () => {
    fc.assert(
      fc.property(anyDate, fc.integer({ min: -30, max: 400 }), (start, n) => {
        const t = makeTask({ date: start, repeat: 'daily' });
        expect(occursOn(t, addDaysISO(start, n))).toBe(n >= 0);
      }),
      RUNS
    );
  });

  test('TASK-P-002 a weekly task is on the same weekday every week from its start', () => {
    fc.assert(
      fc.property(anyDate, fc.integer({ min: 0, max: 400 }), (start, n) => {
        const t = makeTask({ date: start, repeat: 'weekly' });
        expect(occursOn(t, addDaysISO(start, n))).toBe(n % 7 === 0);
      }),
      RUNS
    );
  });
});

describe('FEEL-P: analysis wording', () => {
  const zone = fc.constantFrom(...(ZONE_ORDER as FeelingZone[]));
  const entries = fc.array(fc.record({ zone, day: fc.integer({ min: 0, max: 60 }), tag: fc.constantFrom('Work', 'Sleep', 'Family') }), { minLength: 1, maxLength: 40 });
  const BANNED = /\b(caus(e|es|ed|ing)|because|makes? you|due to|leads? to|diagnos\w*|disorder|most|best|least|usually|tends? to|mostly)\b/i;

  test('FEEL-P-001 the counts add up to the entries, in the zone order, with no ranking or causal words', () => {
    fc.assert(
      fc.property(entries, (list) => {
        const fs = list.map((e) => makeFeeling({ zone: e.zone, date: addDaysISO('2026-09-01', e.day), reasonTags: [e.tag] }));
        const o = overviewInsight(fs, () => undefined)!;
        expect(o.n).toBe(fs.length);
        expect(o.level).toBe(confidenceFor(fs.length));
        expect(o.headline).not.toMatch(BANNED);
        if (o.level !== 'facts') {
          const counts = [...o.headline.matchAll(/(Lively|Calm|Tense|Low|Okay) (\d+)/g)];
          expect(counts.reduce((s, m) => s + Number(m[2]), 0)).toBe(fs.length);
          const order = counts.map((m) => m[1].toLowerCase());
          expect(order).toEqual(ZONE_ORDER.filter((z) => order.includes(z)));
        }
        const t = tagInsight(fs, 'Work');
        if (t) expect(t.headline).not.toMatch(BANNED);
      }),
      RUNS
    );
  });

  test('FEEL-P-002 the wording level only grows with more entries (1–2 facts, 3–6 so far, 7+)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 500 }), (n) => {
        const rank = { facts: 0, soFar: 1, tends: 2 } as const;
        expect(rank[confidenceFor(n + 1)]).toBeGreaterThanOrEqual(rank[confidenceFor(n)]);
      }),
      RUNS
    );
    expect([1, 2, 3, 6, 7].map(confidenceFor)).toEqual(['facts', 'facts', 'soFar', 'soFar', 'tends']);
  });
});

describe('ENT-P: the trial follows the server clock', () => {
  test('ENT-P-001 moving the phone clock back never moves "now" before the server time; forward moves it with real time only', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1_700_000_000_000, max: 1_900_000_000_000 }), fc.integer({ min: -30 * 86_400_000, max: 30 * 86_400_000 }), (fetchedAt, drift) => {
        const serverTime = new Date(fetchedAt + 5_000).toISOString(); // the server's clock when it answered
        const n = estimateServerNow({ serverTime, fetchedAt }, fetchedAt + drift);
        expect(n).toBeGreaterThanOrEqual(Date.parse(serverTime));
        if (drift > 0) expect(n).toBe(Date.parse(serverTime) + drift);
      }),
      RUNS
    );
  });
});
