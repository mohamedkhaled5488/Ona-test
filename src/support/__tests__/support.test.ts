// Support for this feeling, below the screen: every zone and every one of the
// 89 words gives a real answer at every strength (the word's own lines, else
// the zone's); hard-feeling mode; danger in the person's own words; heavy
// pieces hidden until reviewed; personal order from "Did this help?", hidden
// suggestions, no repeats twice in a row; "Last time…" only from real data;
// nights; and privacy (this phone only, nothing to analytics, a check-in with
// no feeling in it).
// IDs: docs/test-cases/integration.md (SUP-*)
jest.mock('../../utils/notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import { CHECK_IN, INSIGHT, SAFE_TOOLS, inDanger, planSupport, type SupportMemory, type SupportShown } from '../engine';
import { WORD_SUPPORT, ZONE_SUPPORT } from '../../content';
import { feelings as wheel, feelingZones } from '../../data/feelingsWheel';
import { syncedCollections } from '../../sync/records';
import { ALLOWED_EVENTS } from '../../utils/analytics';
import type { FeelingCheckIn, FeelingZone } from '../../types/sections';

const EMPTY: SupportMemory = { votes: {}, hidden: [], history: [] };
const NOON = new Date(2026, 10, 1, 12, 0);
const ctx = (memory: SupportMemory = EMPTY, feelings: FeelingCheckIn[] = [], now = NOON) => ({ memory, feelings, now });

describe('a real answer for every feeling', () => {
  test.each(feelingZones.map((z) => z.id))('SUP-001 %s, at every strength: an acknowledgement and 2–4 options of different kinds (or hard-feeling mode)', (zone) => {
    for (let i = 1; i <= 5; i++) {
      const p = planSupport({ zone: zone as FeelingZone, feelingIds: [], intensity: i }, ctx());
      if (p.mode === 'hard') {
        expect(p.options[0].tool && SAFE_TOOLS.has(p.options[0].tool)).toBe(true);
        expect(p.options.some((o) => o.support)).toBe(true);
        continue;
      }
      expect({ zone, i, ack: !!p.acknowledge }).toEqual({ zone, i, ack: true });
      const own = p.options.filter((o) => !o.support);
      expect(own.length).toBeGreaterThanOrEqual(2);
      expect(own.length).toBeLessThanOrEqual(4);
      expect(new Set(own.map((o) => o.kind)).size).toBe(own.length);
    }
  });

  test('SUP-002 every one of the 89 words: its own acknowledgement and options first (unless heavy and not yet reviewed); never empty', () => {
    for (const f of wheel) {
      const p = planSupport({ zone: f.zone, feelingIds: [f.id], intensity: 2 }, ctx());
      const w = WORD_SUPPORT[f.id];
      expect({ id: f.id, options: p.options.length >= 2 }).toEqual({ id: f.id, options: true });
      if (w.sensitivity === 'standard') {
        expect({ id: f.id, ack: p.acknowledge?.id }).toEqual({ id: f.id, ack: w.acknowledge[0].id });
        expect(p.options.some((o) => w.options.includes(o))).toBe(true);
      } else {
        expect(p.mode).toBe('hard');
        expect(p.acknowledge?.sensitivity ?? 'standard').toBe('standard'); // the heavy line waits for review
        expect(p.options.every((o) => o.sensitivity === 'standard')).toBe(true);
      }
    }
  });

  test('SUP-003 an unfinished word falls back to its zone, never a blank or generic line', () => {
    const w = WORD_SUPPORT['sad-lonely'];
    w.written = false;
    try {
      const p = planSupport({ zone: 'low', feelingIds: ['sad-lonely'], intensity: 2 }, ctx());
      expect(p.acknowledge?.id).toMatch(/^low\.ack\./);
      expect(p.options.every((o) => o.id.startsWith('low.'))).toBe(true);
    } finally {
      w.written = true;
    }
  });

  test('SUP-004 the strength matters: Tense at 2 has its everyday lines; at 5, hard-feeling mode', () => {
    expect(planSupport({ zone: 'tense', feelingIds: [], intensity: 2 }, ctx()).acknowledge?.intensity).toEqual([1, 3]);
    expect(planSupport({ zone: 'tense', feelingIds: [], intensity: 5 }, ctx()).mode).toBe('hard');
    expect(planSupport({ zone: 'lively', feelingIds: [], intensity: 5 }, ctx()).mode).toBe('gentle');
  });
});

describe('hard-feeling mode and danger', () => {
  test('SUP-005 hard-feeling mode: breathing and grounding first, "Talk to someone", fewer words; its heavy lines only once reviewed', () => {
    const p = planSupport({ zone: 'low', feelingIds: [], intensity: 5 }, ctx());
    expect(p.mode).toBe('hard');
    expect(p.understand).toBeUndefined();
    expect(p.options.slice(0, -1).every((o) => o.kind === 'body' && SAFE_TOOLS.has(o.tool!))).toBe(true);
    expect(p.options[p.options.length - 1].support).toBe(true);
    expect(p.lines).toEqual([]); // "You don't have to fix this right now" waits for review
    expect(p.acknowledge).toBeUndefined(); // so does the strong Low line
    // Once a clinician has reviewed them, they're shown.
    const z = ZONE_SUPPORT.low.acknowledge.find((a) => a.id === 'low.ack.04')!;
    z.reviewed = true;
    try {
      expect(planSupport({ zone: 'low', feelingIds: [], intensity: 5 }, ctx()).acknowledge?.id).toBe('low.ack.04');
    } finally {
      z.reviewed = false;
    }
  });

  test('SUP-006 heavy feelings on 3 of the last 7 days also bring hard-feeling mode, even at a lower strength', () => {
    const day = (d: string): FeelingCheckIn => ({ id: d, zone: 'low', feelingIds: [], date: d, createdAt: `${d}T09:00:00.000Z` });
    const p = planSupport({ zone: 'low', feelingIds: [], intensity: 2 }, ctx(EMPTY, [day('2026-10-30'), day('2026-10-31'), day('2026-11-01')]));
    expect(p.mode).toBe('hard');
  });

  test.each([["I don't want to be here anymore"], ['thinking about ending my life'], ['I want to end it all'], ['I want to hurt myself'], ['suicidal']])('SUP-007 the person\'s own words point to danger ("%s"): only the support card, nothing else', (note) => {
    const p = planSupport({ zone: 'low', feelingIds: [], intensity: 2, note }, ctx());
    expect(p.mode).toBe('danger');
    expect(p.options.map((o) => !!o.support)).toEqual([true]);
    expect(p.acknowledge).toBeUndefined();
  });

  test('SUP-008 ordinary words are not danger ("killing it at work", "dying to see them", "this end of the week")', () => {
    for (const note of ['killing it at work', 'dying to see them', 'this end of the week', 'hurt my knee', 'I want to end it with him']) expect({ note, danger: inDanger({ zone: 'low', feelingIds: [], note }) }).toEqual({ note, danger: false });
    expect(inDanger({ zone: 'low', feelingIds: [], tags: ['self harm'] })).toBe(true);
  });
});

describe('personal, quietly', () => {
  const shown = (over: Partial<SupportShown>): SupportShown => ({ at: '2026-10-31T10:00:00.000Z', zone: 'tense', intensity: 3, optionIds: [], used: [], ...over });

  test('SUP-010 what the person said helped comes first; "Not really" goes last; a hidden one never', () => {
    const base = planSupport({ zone: 'tense', feelingIds: [], intensity: 2 }, ctx());
    const liked = ZONE_SUPPORT.tense.options.find((o) => o.id === 'tense.do.sound')!;
    const p = planSupport({ zone: 'tense', feelingIds: [], intensity: 2 }, ctx({ votes: { [liked.id]: { yes: 3, aLittle: 0, notReally: 0 } }, hidden: [], history: [] }));
    expect(p.options[0].id).toBe(liked.id);
    const first = base.options[0];
    const down = planSupport({ zone: 'tense', feelingIds: [], intensity: 2 }, ctx({ votes: { [first.id]: { yes: 0, aLittle: 0, notReally: 2 } }, hidden: [], history: [] }));
    expect(down.options[0].id).not.toBe(first.id);
    const gone = planSupport({ zone: 'tense', feelingIds: [], intensity: 2 }, ctx({ votes: {}, hidden: [first.id], history: [] }));
    expect(gone.options.map((o) => o.id)).not.toContain(first.id);
  });

  test('SUP-011 never the same wording twice in a row: a different acknowledgement and a different set of options from last time', () => {
    const one = planSupport({ zone: 'tense', feelingIds: [], intensity: 2 }, ctx());
    const two = planSupport({ zone: 'tense', feelingIds: [], intensity: 2 }, ctx({ votes: {}, hidden: [], history: [shown({ ackId: one.acknowledge!.id, optionIds: one.options.map((o) => o.id) })] }));
    expect(two.acknowledge!.id).not.toBe(one.acknowledge!.id);
    expect(two.options.map((o) => o.id)).not.toEqual(one.options.map((o) => o.id));
  });

  test('SUP-012 "Last time you tried this…" only from the person\'s own history: a lighter feeling logged after trying it', () => {
    const walk = ZONE_SUPPORT.tense.options.find((o) => o.id === 'tense.do.walk')!;
    const tried = shown({ at: '2026-10-31T10:00:00.000Z', zone: 'tense', intensity: 4, optionIds: [walk.id], used: [walk.id] });
    const after: FeelingCheckIn = { id: 'later', zone: 'calm', feelingIds: [], date: '2026-10-31', createdAt: '2026-10-31T11:00:00.000Z' };
    const p = planSupport({ zone: 'tense', feelingIds: [], intensity: 2 }, ctx({ votes: {}, hidden: [], history: [tried] }, [after]));
    expect(p.insights[walk.id]).toBe(INSIGHT.lighter);
    // No later feeling, or one that wasn't lighter: nothing claimed.
    expect(planSupport({ zone: 'tense', feelingIds: [], intensity: 2 }, ctx({ votes: {}, hidden: [], history: [tried] }, [])).insights[walk.id]).toBeUndefined();
    expect(planSupport({ zone: 'tense', feelingIds: [], intensity: 2 }, ctx({ votes: {}, hidden: [], history: [tried] }, [{ ...after, zone: 'low' }])).insights[walk.id]).toBeUndefined();
    // Correlational words only: no "because", no "it works".
    expect(INSIGHT.lighter).not.toMatch(/because|works|caused|made you/i);
  });

  test('SUP-013 at night, a walk outside isn\'t the first idea', () => {
    const memory = { votes: { 'tense.do.walk': { yes: 1, aLittle: 0, notReally: 0 } }, hidden: [], history: [] };
    expect(planSupport({ zone: 'tense', feelingIds: [], intensity: 2 }, ctx(memory, [], NOON)).options[0].id).toBe('tense.do.walk');
    expect(planSupport({ zone: 'tense', feelingIds: [], intensity: 2 }, ctx(memory, [], new Date(2026, 10, 1, 23, 30))).options[0].id).not.toBe('tense.do.walk');
  });
});

test('SUP-020 privacy: Support\'s memory never syncs, nothing about it can reach analytics, and the check-in names no feeling', () => {
  const keys = syncedCollections().map((c) => c.key);
  for (const k of ['support.votes', 'support.hidden', 'support.history']) expect(keys).not.toContain(k);
  expect(ALLOWED_EVENTS.filter((e) => /support|feeling|letter|reflect/i.test(e))).toEqual([]);
  const words = `${CHECK_IN.title} ${CHECK_IN.body}`.toLowerCase();
  for (const f of wheel) expect(words.includes(f.name.toLowerCase())).toBe(false);
  for (const z of feelingZones) expect(new RegExp(`\\b${z.label.toLowerCase()}\\b`).test(words)).toBe(false);
});
