// "What helps you" (quit/whatHelps.ts), under the owner's rules (2026-10-24):
// counts and average change in the menu's fixed order; "tends to" only at or
// above the threshold, "Not enough uses yet" below it; a comparison only when
// meaningful; correlational words, never causal or diagnostic.
// IDs: docs/test-cases/integration.md (WHAT-HELPS-*)
import fc from 'fast-check';
import { makeQuitHabit } from '../../test-utils';
import { reasonTagOptions } from '../../data/feelingsWheel';
import { MEANINGFUL_POINTS, TIMING_MIN_TOTAL, WHAT_HELPS_COPY, WHAT_HELPS_MIN_RATED, toolLine, whatHelps, type ToolHelp } from '../../quit/whatHelps';
import type { QuitCravingSession, QuitFeelingEntry, QuitHabit, QuitSlip, QuitTrack } from '../../types/sections';

const HABIT = makeQuitHabit({ id: 'q1', name: 'Vaping' });
const TRACKS: QuitTrack[] = [{ id: 't1', quitHabitId: 'q1', startDate: '2026-09-01', createdAt: '2026-09-01T08:00:00.000Z', status: 'active' }];
let n = 0;
// A craving at a local time, with tools, ratings and an outcome.
function craving(tools: string[], over: Partial<QuitCravingSession> & { hour?: number } = {}): QuitCravingSession {
  const { hour = 20, ...rest } = over;
  const startedAt = new Date(2026, 9, 1 + (n % 20), hour, 0).toISOString();
  return { id: `c${++n}`, quitHabitId: 'q1', trackId: 't1', startedAt, endedAt: startedAt, tools: tools.map((toolId) => ({ toolId, startedAt })), outcome: 'passed', ...rest };
}
const rated = (tools: string[], before: number, after: number, over: Partial<QuitCravingSession> = {}) => craving(tools, { ratingBefore: before, ratingAfter: after, ...over });
const run = (sessions: QuitCravingSession[], entries: QuitFeelingEntry[] = [], slips: QuitSlip[] = [], habit: QuitHabit = HABIT) => whatHelps(habit, sessions, entries, TRACKS, slips);
const CAUSAL = /\b(because|caus(e|es|ed|ing)|works?|worked|makes?|made|effective|proven|fix(es|ed)?|cures?|diagnos\w*|treat\w*|therap\w*|symptom\w*|disorder)\b/i;

beforeEach(() => {
  n = 0;
});

test('WHAT-HELPS-001 nothing yet: no tools, no comparison, no timing line', () => {
  const r = run([]);
  expect(r).toMatchObject({ tools: [], comparison: undefined, timingTotal: 0, timingPeak: undefined, triggers: [], sessions: 0 });
});

test('WHAT-HELPS-002 each tool counted once per craving; passed counted; the average change uses only cravings rated before and after', () => {
  const r = run([
    rated(['grounding', 'grounding'], 8, 4), // the same tool twice in one craving: one use
    craving(['grounding'], { ratingBefore: 7 }), // only before: a use, not rated
    craving(['grounding'], { ratingAfter: 2, outcome: 'stillHere' }), // only after
    rated(['grounding'], 6, 5, { outcome: 'slipped' }),
  ]);
  expect(r.tools).toEqual([{ label: 'Grounding', uses: 4, passed: 2, rated: 2, avgChange: -2.5 }]);
});

test('WHAT-HELPS-003 a craving with two tools counts its change for each (the card says so)', () => {
  const r = run([rated(['rideItOut', 'walk'], 9, 3)]);
  expect(r.tools.map((t) => [t.label, t.avgChange])).toEqual([['Riding it out', -6], ['A short walk', -6]]);
  expect(WHAT_HELPS_COPY.footnote).toMatch(/more than one tool in a craving, its change counts for each/);
});

test('WHAT-HELPS-004 a craving still going (no outcome) isn\'t counted; other habits\' cravings aren\'t either', () => {
  const r = run([craving(['grounding'], { outcome: undefined, endedAt: undefined }), craving(['grounding'], { quitHabitId: 'q2' })]);
  expect(r.tools).toEqual([]);
  expect(r.sessions).toBe(1); // still counted for when cravings came
});

test('WHAT-HELPS-005 urges logged before the toolkit count too (passed, no ratings); one linked to a craving isn\'t counted twice', () => {
  const entries: QuitFeelingEntry[] = [
    { id: 'e1', trackId: 't1', isRelapseMoment: false, isResistedUrge: true, approach: 'Step outside for a minute', urgePassed: true, createdAt: '2026-09-10T20:00:00.000Z' },
    { id: 'e2', trackId: 't1', isRelapseMoment: false, isResistedUrge: true, approach: 'Riding it out', urgePassed: true, createdAt: '2026-10-02T20:00:00.000Z' },
    { id: 'e3', trackId: 'other', isRelapseMoment: false, isResistedUrge: true, approach: 'Riding it out', urgePassed: true, createdAt: '2026-10-02T20:00:00.000Z' },
  ];
  const r = run([craving(['rideItOut'], { resistedEntryId: 'e2' })], entries);
  expect(r.tools).toEqual([
    { label: 'Riding it out', uses: 1, passed: 1, rated: 0, avgChange: undefined },
    { label: 'Step outside for a minute', uses: 1, passed: 1, rated: 0, avgChange: undefined },
  ]);
});

test('WHAT-HELPS-006 always the menu\'s order, whatever the counts or changes; your own tools after; older names A to Z at the end', () => {
  const habit = makeQuitHabit({ id: 'q1', toolkit: { pinned: [], hidden: [], custom: [{ id: 'tea', name: 'Make tea' }] } });
  const sessions = [
    ...Array.from({ length: 9 }, () => rated(['reachOut'], 9, 1)),
    rated(['tea'], 5, 5),
    rated(['rideItOut'], 5, 6),
    rated(['grounding'], 5, 5),
  ];
  const entries: QuitFeelingEntry[] = [{ id: 'old', trackId: 't1', isRelapseMoment: false, isResistedUrge: true, approach: 'Chew gum', urgePassed: true, createdAt: '2026-09-10T20:00:00.000Z' }];
  expect(run(sessions, entries, [], habit).tools.map((t) => t.label)).toEqual(['Riding it out', 'Grounding', 'Reaching out', 'Make tea', 'Chew gum']);
});

test('WHAT-HELPS-007 below the threshold: counts and "Not enough uses yet", never "tends to"; at it: "tends to ease / rise / stay about the same"', () => {
  const below: ToolHelp = { label: 'Grounding', uses: 9, passed: 7, rated: WHAT_HELPS_MIN_RATED - 1, avgChange: -3 };
  expect(toolLine(below)).toBe('Used 9 times, passed 7 of 9. Not enough uses yet to say more.');
  expect(toolLine({ ...below, rated: WHAT_HELPS_MIN_RATED })).toBe(`Used 9 times, passed 7 of 9. With it, the craving's strength tends to ease by 3 points (${WHAT_HELPS_MIN_RATED} rated).`);
  expect(toolLine({ ...below, rated: 6, avgChange: 1 })).toMatch(/tends to rise by 1 point \(6 rated\)/);
  expect(toolLine({ ...below, rated: 6, avgChange: -0.4 })).toMatch(/tends to stay about the same/);
  expect(toolLine({ label: 'Walk', uses: 1, passed: 0, rated: 0 })).toBe('Used 1 time, passed 0 of 1. Not enough uses yet to say more.');
});

test('WHAT-HELPS-008 "tends to" appears only with enough rated uses, for any history (property)', () => {
  const tools = ['rideItOut', 'grounding', 'walk', 'delayIt'];
  const session = fc.record({
    tools: fc.subarray(tools, { minLength: 1 }),
    before: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
    after: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
    outcome: fc.constantFrom('passed' as const, 'stillHere' as const, 'slipped' as const),
  });
  fc.assert(
    fc.property(fc.array(session, { maxLength: 30 }), (list) => {
      n = 0;
      const r = run(list.map((s) => craving(s.tools, { ratingBefore: s.before, ratingAfter: s.after, outcome: s.outcome })));
      for (const t of r.tools) {
        const line = toolLine(t);
        expect(/tends to/.test(line)).toBe(t.rated >= WHAT_HELPS_MIN_RATED);
        expect(line).not.toMatch(CAUSAL);
      }
      if (r.comparison) {
        expect(r.comparison.easier.rated).toBeGreaterThanOrEqual(WHAT_HELPS_MIN_RATED);
        expect(r.comparison.harder.rated).toBeGreaterThanOrEqual(WHAT_HELPS_MIN_RATED);
        expect(r.comparison.harder.avgChange! - r.comparison.easier.avgChange!).toBeGreaterThanOrEqual(MEANINGFUL_POINTS);
      }
    }),
    { numRuns: 200 }
  );
});

test('WHAT-HELPS-009 a comparison only when meaningful: both above the threshold and 2+ points apart', () => {
  const five = (tool: string, before: number, after: number) => Array.from({ length: 5 }, () => rated([tool], before, after));
  const meaningful = run([...five('grounding', 8, 4), ...five('delayIt', 8, 6)]);
  expect(meaningful.comparison).toMatchObject({ easier: { label: 'Grounding', avgChange: -4 }, harder: { label: 'Delaying it', avgChange: -2 } });
  expect(WHAT_HELPS_COPY.comparison(meaningful.comparison!)).toBe("Of the tools you've rated enough, the craving tends to ease more with Grounding (-4) than with Delaying it (-2).");
  expect(run([...five('grounding', 8, 4), ...five('delayIt', 8, 5)]).comparison).toBeUndefined(); // 1 point apart
  expect(run([...five('grounding', 8, 1), ...five('delayIt', 8, 8).slice(0, 4)]).comparison).toBeUndefined(); // one below the threshold
});

test('WHAT-HELPS-010 when cravings came: counts morning to night; "tend to come" only with enough and a clear gap', () => {
  const at = (hour: number, k: number) => Array.from({ length: k }, () => craving(['grounding'], { hour }));
  const clear = run([...at(8, 2), ...at(14, 1), ...at(20, 8), ...at(23, 1)]);
  expect(clear.timing.map((t) => [t.id, t.count])).toEqual([['morning', 2], ['afternoon', 1], ['evening', 8], ['night', 1]]);
  expect(WHAT_HELPS_COPY.timingPeak(clear.timingPeak!, clear.timingTotal)).toBe('Cravings tend to come in the evening (8 of 12).');
  expect(run([...at(8, 5), ...at(20, 6)]).timingPeak).toBeUndefined(); // a small difference
  expect(run([...at(20, TIMING_MIN_TOTAL - 1)]).timingPeak).toBeUndefined(); // too few
  expect(WHAT_HELPS_COPY.timingCounts(clear.timing)).toBe('Morning 2 · Afternoon 1 · Evening 8 · Night 1');
});

test('WHAT-HELPS-011 what set them off: craving tags and hard-day tags, in the tag list\'s order, only this habit', () => {
  const slips: QuitSlip[] = [
    { id: 's1', quitHabitId: 'q1', trackId: 't1', date: '2026-10-03', createdAt: '2026-10-03T21:00:00.000Z', reasonTags: ['Work', 'Sleep'] },
    { id: 's2', quitHabitId: 'q2', trackId: 'x', date: '2026-10-03', createdAt: '2026-10-03T21:00:00.000Z', reasonTags: ['Work'] },
  ];
  const r = run([craving(['grounding'], { triggerTag: 'Work' }), craving(['grounding'], { triggerTag: 'Zzz custom' })], [], slips);
  const listed = r.triggers.map((t) => t.tag).filter((t) => (reasonTagOptions as readonly string[]).includes(t));
  expect(listed).toEqual(['Work', 'Sleep'].sort((a, b) => reasonTagOptions.indexOf(a as never) - reasonTagOptions.indexOf(b as never)));
  expect(Object.fromEntries(r.triggers.map((t) => [t.tag, t.count]))).toEqual({ Work: 2, Sleep: 1, 'Zzz custom': 1 });
  expect(r.triggers[r.triggers.length - 1].tag).toBe('Zzz custom'); // not in the list: after it
});

test('WHAT-HELPS-012 the card\'s words: correlational, never causal or diagnostic', () => {
  const words = Object.values(WHAT_HELPS_COPY).map((v) => (typeof v === 'string' ? v : '')).join(' ');
  expect(words).not.toMatch(CAUSAL);
  expect(WHAT_HELPS_COPY.footnote).toMatch(/went along with/);
});
