// The Quit journey's numbers across hard days (slips), migrated chapters,
// daylight saving and time zones (tests run in America/New_York).
// IDs: docs/test-cases/integration.md (QUIT-J-*)
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import fc from 'fast-check';
import { EMPTY_COUNTS, journeyCounts, journeyHeadline, localDateOf, formatRideTimer, sessionSeconds } from '../../quit/journey';
import { useQuitHabitsStore, openCravingFor } from '../../store/useQuitHabitsStore';
import { quitJourneySeries } from '../habitStats';
import { addDaysISO } from '../date';
import { resetAll, useClock, restoreClock } from '../../test-utils';
import type { QuitSlip, QuitTrack } from '../../types/sections';

const H = 'q1';
const track = (id: string, startDate: string, endDate?: string): QuitTrack => ({ id, quitHabitId: H, startDate, endDate, createdAt: `${startDate}T08:00:00.000Z`, status: endDate ? 'archived' : 'active' });
const slip = (date: string, trackId = 't1'): QuitSlip => ({ id: `s-${date}`, quitHabitId: H, trackId, date, createdAt: `${date}T15:00:00.000Z` });

beforeEach(async () => {
  await resetAll();
  useClock('2026-10-24T12:00');
});
afterEach(() => restoreClock());

describe('QUIT-J: the counts', () => {
  test('QUIT-J-001 no hard days: the journey, clean days and the run are the same, today included', () => {
    expect(journeyCounts([track('t1', '2026-10-15')], [], H, '2026-10-24')).toEqual({ journeyDays: 10, cleanDays: 10, currentRun: 10, longestRun: 10, hardDays: 0, running: true });
  });

  test('QUIT-J-002 a hard day today: the journey carries on; the run is 0; that day isn\'t clean', () => {
    expect(journeyCounts([track('t1', '2026-10-15')], [slip('2026-10-24')], H, '2026-10-24')).toMatchObject({ journeyDays: 10, cleanDays: 9, currentRun: 0, longestRun: 9, hardDays: 1 });
  });

  test('QUIT-J-003 a hard day yesterday: the run is 1 today; two marks on one day are one hard day', () => {
    const c = journeyCounts([track('t1', '2026-10-15')], [slip('2026-10-23'), { ...slip('2026-10-23'), id: 'again' }], H, '2026-10-24');
    expect(c).toMatchObject({ journeyDays: 10, cleanDays: 9, currentRun: 1, longestRun: 8, hardDays: 1 });
  });

  test('QUIT-J-004 chapters from before this change count the same way, without rewriting them: a chapter\'s end is a hard day', () => {
    const tracks = [track('t1', '2026-10-01', '2026-10-10'), { ...track('t2', '2026-10-10'), createdAt: '2026-10-10T20:00:00.000Z' }];
    const before = JSON.stringify(tracks);
    expect(journeyCounts(tracks, [], H, '2026-10-24')).toMatchObject({ journeyDays: 24, cleanDays: 23, currentRun: 14, longestRun: 14, hardDays: 1 });
    expect(JSON.stringify(tracks)).toBe(before); // nothing stored or changed
  });

  test('QUIT-J-005 a gap between old chapters (no chapter running) is part of the journey, but not clean days', () => {
    const tracks = [track('t1', '2026-10-01', '2026-10-05'), { ...track('t2', '2026-10-08'), createdAt: '2026-10-08T08:00:00.000Z' }];
    // Oct 1-4 clean, 5 hard, 6-7 no chapter, 8-24 clean (17).
    expect(journeyCounts(tracks, [], H, '2026-10-24')).toMatchObject({ journeyDays: 24, cleanDays: 21, currentRun: 17, longestRun: 17, hardDays: 1 });
  });

  test('QUIT-J-006 no chapter running now (old data, "not right now"): the run is 0, the journey still counts', () => {
    expect(journeyCounts([track('t1', '2026-10-01', '2026-10-20')], [], H, '2026-10-24')).toMatchObject({ journeyDays: 24, currentRun: 0, running: false, cleanDays: 19 });
  });

  test('QUIT-J-007 starting a new chapter after a hard day changes no number', () => {
    const s = useQuitHabitsStore.getState();
    useClock('2026-10-15T09:00');
    const { habitId } = s.addQuitHabit('Scrolling', undefined);
    useClock('2026-10-24T09:00');
    const trackId = useQuitHabitsStore.getState().tracks[0].id;
    const slipId = s.markHardDay(habitId, trackId, { reflection: 'Long day', reasonTags: ['Work'] });
    const st = () => useQuitHabitsStore.getState();
    const counted = journeyCounts(st().tracks, st().slips, habitId, '2026-10-24');
    expect(counted).toMatchObject({ journeyDays: 10, currentRun: 0, hardDays: 1 });
    s.startNewChapter(habitId, slipId);
    expect(st().tracks.find((t) => t.id === trackId)).toMatchObject({ status: 'archived', endDate: '2026-10-24', relapseReflection: 'Long day', relapseReasonTags: ['Work'] });
    expect(journeyCounts(st().tracks, st().slips, habitId, '2026-10-24')).toEqual(counted);
    expect(journeyCounts(st().tracks, st().slips, habitId, '2026-10-25')).toMatchObject({ journeyDays: 11, currentRun: 1 });
  });

  test('QUIT-J-008 across the daylight-saving change (Nov 1 in New York): every calendar day counts once', () => {
    expect(journeyCounts([track('t1', '2026-10-30')], [], H, '2026-11-03')).toMatchObject({ journeyDays: 5, cleanDays: 5, currentRun: 5 });
    expect(journeyCounts([track('t1', '2026-03-07')], [], H, '2026-03-09')).toMatchObject({ journeyDays: 3 });
  });

  test('QUIT-J-009 time zones: a hard day is the phone\'s date when it was marked; urges count on their local day, not UTC', () => {
    useClock('2026-10-24T23:30'); // 03:30 UTC on the 25th
    const s = useQuitHabitsStore.getState();
    const { habitId, trackId } = s.addQuitHabit('Sugar', undefined);
    s.markHardDay(habitId, trackId);
    expect(useQuitHabitsStore.getState().slips[0].date).toBe('2026-10-24');
    expect(localDateOf('2026-10-25T03:30:00.000Z')).toBe('2026-10-24');
    s.addFeelingEntry(trackId, undefined, undefined, undefined, false, true);
    const st = useQuitHabitsStore.getState();
    const series = quitJourneySeries(st.tracks, st.feelingEntries, habitId, '2026-10-24', st.slips);
    expect(series.find((d) => d.date === '2026-10-24')).toMatchObject({ resistedCount: 1, hardDay: true });
  });

  test('QUIT-J-010 before the first chapter, and with nothing at all: zeros, never negative', () => {
    expect(journeyCounts([], [], H, '2026-10-24')).toEqual(EMPTY_COUNTS);
    expect(journeyCounts([track('t1', '2026-10-30')], [], H, '2026-10-24')).toEqual(EMPTY_COUNTS);
  });

  test('QUIT-J-011 property: clean days + hard days + days with no chapter = journey days; runs never exceed clean days', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 120 }), fc.array(fc.integer({ min: 0, max: 119 }), { maxLength: 15 }), (length, slipOffsets) => {
        const start = '2026-06-01';
        const today = addDaysISO(start, length - 1);
        const slips = slipOffsets.filter((o) => o < length).map((o) => slip(addDaysISO(start, o)));
        const c = journeyCounts([track('t1', start)], slips, H, today);
        expect(c.journeyDays).toBe(length);
        expect(c.cleanDays + c.hardDays).toBe(length);
        expect(c.currentRun).toBeLessThanOrEqual(c.longestRun);
        expect(c.longestRun).toBeLessThanOrEqual(c.cleanDays);
      })
    );
  });
});

describe('QUIT-J: the headline', () => {
  const c = { journeyDays: 12, cleanDays: 10, currentRun: 1, longestRun: 6, hardDays: 2, running: true };
  test('QUIT-J-020 by default "Day N of your journey", with clean days and the current run smaller', () => {
    expect(journeyHeadline(c)).toEqual({ headline: 'Day 12 of your journey', smaller: ['10 clean days', 'Current run: 1 day'] });
  });
  test('QUIT-J-021 the setting picks the main number; the others stay, smaller', () => {
    expect(journeyHeadline(c, 'clean')).toEqual({ headline: '10 clean days', smaller: ['Day 12 of your journey', 'Current run: 1 day'] });
    expect(journeyHeadline(c, 'run')).toEqual({ headline: 'Current run: 1 day', smaller: ['Day 12 of your journey', '10 clean days'] });
    expect(journeyHeadline({ ...c, cleanDays: 1 }).smaller[0]).toBe('1 clean day');
  });
});

describe('QUIT-J: craving sessions', () => {
  test('QUIT-J-030 the timer reads from the start: right after the phone was locked or Ona closed; tools switch, the timer doesn\'t', () => {
    const clock = useClock('2026-10-24T20:00');
    const s = useQuitHabitsStore.getState();
    const { habitId, trackId } = s.addQuitHabit('Vaping', undefined);
    const id = s.startCraving(habitId, trackId, 7);
    s.tryCravingTool(id, 'breathing');
    clock.advance(4 * 60_000 + 12_000); // locked for 4 min 12 s
    const open = openCravingFor(useQuitHabitsStore.getState().cravingSessions, habitId)!;
    expect(formatRideTimer(sessionSeconds(open, Date.now()))).toBe('4:12');
    s.tryCravingTool(id, 'sounds');
    s.endCraving(id, 'stillHere');
    expect(openCravingFor(useQuitHabitsStore.getState().cravingSessions, habitId)).toBeDefined(); // still going
    clock.advance(60_000);
    s.endCraving(id, 'passed');
    const done = useQuitHabitsStore.getState().cravingSessions[0];
    expect(done).toMatchObject({ outcome: 'passed', ratingBefore: 7 });
    expect(done.tools.map((t) => t.toolId)).toEqual(['breathing', 'sounds']);
    expect(done.tools.every((t) => t.endedAt)).toBe(true);
    expect(sessionSeconds(done, Date.now() + 999_999)).toBe(5 * 60 + 12);
  });
});

describe('QUIT-J: sync and privacy', () => {
  test('QUIT-J-040 hard days and craving sessions sync with the account like the rest of Quit, and never leave the phone in analytics', () => {
    const { syncedCollections } = require('../../sync/records') as typeof import('../../sync/records');
    const keys = syncedCollections().map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(['quitHabit.slips', 'quitHabit.cravingSessions']));
    const fs = require('fs') as { readFileSync: (p: string, e: string) => string };
    const analytics = fs.readFileSync(require('path').join(process.cwd(), 'src/utils/analytics.ts'), 'utf8');
    expect(analytics).not.toMatch(/craving|slip|hardDay/i);
  });
});
