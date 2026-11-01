// The written content of Reflect, Letters and Support (src/content): its shape
// and its words. This is the product, so the rules are checked, not hoped:
// open, plain, warm; no shame, no diagnosis, no promises, no commands, no
// comparisons, no exact durations as facts, no medication or substance
// advice, never cold-water, pain or shock techniques. Every piece has an id,
// a review flag and a sensitivity; nothing is marked reviewed until a
// clinician has read it.
// IDs: docs/test-cases/integration.md (CONTENT-*)
import { allReviewable, allText, BREATHING_TOOL, FOLLOW_UPS, HARD_MODE, LETTERS, REFLECT_QUESTIONS, REFLECT_THEMES, WORD_SUPPORT, ZONE_SUPPORT } from '../index';
import { BUILT_IN_TOOLS } from '../../quit/toolkit';
import { feelingZones, feelings as wheel } from '../../data/feelingsWheel';
import type { Depth } from '../types';

const DEPTHS: Depth[] = ['light', 'medium', 'deep'];

describe('shape', () => {
  test('CONTENT-001 every piece has a unique id, a review flag and a sensitivity', () => {
    const items = allReviewable();
    const ids = items.map((i) => i.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    for (const i of items) {
      expect(typeof i.reviewed).toBe('boolean');
      expect(['standard', 'heavy']).toContain(i.sensitivity);
    }
  });

  test('CONTENT-002 nothing is marked reviewed yet (the clinician review is open, docs/support-content-review.md)', () => {
    expect(allReviewable().filter((i) => i.reviewed).map((i) => i.id)).toEqual([]);
    expect(REFLECT_THEMES.filter((t) => t.reviewed).map((t) => t.id)).toEqual([]);
  });

  test('CONTENT-003 Reflect: twelve themes, each with its own opening and closing; a written theme has at least 12 questions per depth, with a whole arc', () => {
    expect(REFLECT_THEMES).toHaveLength(12);
    for (const t of REFLECT_THEMES) {
      expect(t.opening).not.toBe(t.closing);
      const mine = REFLECT_QUESTIONS.filter((q) => q.theme === t.id);
      if (!t.written) {
        expect({ theme: t.id, questions: mine.length }).toEqual({ theme: t.id, questions: 0 });
        continue;
      }
      for (const d of DEPTHS) {
        const at = mine.filter((q) => q.depth === d);
        expect({ theme: t.id, d, enough: at.length >= 12 }).toEqual({ theme: t.id, d, enough: true });
        for (const stage of ['arrive', 'explore', 'close'] as const) expect({ theme: t.id, d, stage, has: at.some((q) => q.stage === stage) }).toEqual({ theme: t.id, d, stage, has: true });
      }
    }
    for (const q of REFLECT_QUESTIONS) expect(REFLECT_THEMES.some((t) => t.id === q.theme && t.written)).toBe(true);
  });

  test('CONTENT-004 questions are questions, and the heavy ones (loss, the past) are only in Deep', () => {
    for (const q of REFLECT_QUESTIONS) {
      expect({ id: q.id, asks: /\?$|:$/.test(q.text) }).toEqual({ id: q.id, asks: true });
      if (q.sensitivity === 'heavy') expect({ id: q.id, depth: q.depth }).toEqual({ id: q.id, depth: 'deep' });
    }
    // Light and Medium don't touch loss or the past.
    const probing = /\b(grie(f|ving)|loss|lost someone|died|death|trauma|abuse|hurt you|childhood)\b/i;
    for (const q of REFLECT_QUESTIONS.filter((x) => x.depth !== 'deep')) expect({ id: q.id, probing: probing.test(q.text) }).toEqual({ id: q.id, probing: false });
  });

  test('CONTENT-005 follow-ups: some for any theme, and some for each written theme', () => {
    expect(FOLLOW_UPS.filter((f) => f.themes.length === 0).length).toBeGreaterThanOrEqual(5);
    for (const t of REFLECT_THEMES.filter((x) => x.written)) expect(FOLLOW_UPS.some((f) => f.themes.includes(t.id))).toBe(true);
  });

  test('CONTENT-006 letters: every kind has a title and starters', () => {
    expect(LETTERS.kinds.map((k) => k.kind).sort()).toEqual(['date', 'doubt', 'feeling', 'hardDay', 'proud']);
    for (const k of LETTERS.kinds) expect(k.starters.texts.length).toBeGreaterThanOrEqual(2);
    expect(LETTERS.writtenOn).toContain('{date}');
  });

  test('CONTENT-007 Support: all five zones, each with acknowledgements for every intensity, an understanding note, and options of at least four kinds', () => {
    expect(Object.keys(ZONE_SUPPORT).sort()).toEqual(feelingZones.map((z) => z.id).sort());
    for (const z of Object.values(ZONE_SUPPORT)) {
      for (let i = 1; i <= 5; i++) {
        const fits = (r: [number, number]) => r[0] <= i && i <= r[1];
        expect({ zone: z.zone, i, ack: z.acknowledge.filter((a) => fits(a.intensity)).length >= 2 || z.acknowledge.some((a) => fits(a.intensity) && a.sensitivity === 'heavy') }).toEqual({ zone: z.zone, i, ack: true });
        expect({ zone: z.zone, i, und: z.understand.some((u) => fits(u.intensity)) }).toEqual({ zone: z.zone, i, und: true });
        expect({ zone: z.zone, i, options: z.options.filter((o) => fits(o.intensity)).length >= 3 }).toEqual({ zone: z.zone, i, options: true });
      }
      expect(new Set(z.options.map((o) => o.kind)).size).toBeGreaterThanOrEqual(4);
      for (const o of z.options) expect({ id: o.id, why: o.why.length > 0 }).toEqual({ id: o.id, why: true });
    }
  });

  test('CONTENT-008 the hard zones: at strong intensity, a safe body option and "Talk to someone" that need no review', () => {
    for (const zone of ['tense', 'low'] as const) {
      const strong = ZONE_SUPPORT[zone].options.filter((o) => o.intensity[1] >= 5 && o.sensitivity === 'standard');
      expect(strong.some((o) => o.kind === 'body' && (o.tool === BREATHING_TOOL || o.tool === 'grounding' || o.tool === 'noticeFive'))).toBe(true);
      expect(strong.some((o) => o.support)).toBe(true);
    }
    expect(HARD_MODE.lines.length).toBeGreaterThan(0);
  });

  test('CONTENT-009 every link goes somewhere real: a toolkit tool or the breathing exercise; a letter kind; one link at most', () => {
    const tools = new Set([BREATHING_TOOL, ...BUILT_IN_TOOLS.map((t) => t.id)]);
    const kinds = new Set(LETTERS.kinds.map((k) => k.kind));
    for (const z of Object.values(ZONE_SUPPORT))
      for (const o of z.options) {
        if (o.tool) expect({ id: o.id, tool: tools.has(o.tool) }).toEqual({ id: o.id, tool: true });
        if (o.letter) expect(kinds.has(o.letter)).toBe(true);
        expect({ id: o.id, links: [o.tool, o.letter, o.support].filter(Boolean).length <= 1 }).toEqual({ id: o.id, links: true });
      }
  });
});

test('CONTENT-013 every one of the 89 feeling words has its own lines, in its own zone file: an acknowledgement and two options or more; the heaviest are heavy (shown after review), with a safe body option and "Talk to someone"', () => {
  expect(wheel).toHaveLength(89);
  const tools = new Set([BREATHING_TOOL, ...BUILT_IN_TOOLS.map((t) => t.id)]);
  const files: Record<string, string[]> = {
    lively: require('../support/words/lively.json').map((w: { feelingId: string }) => w.feelingId),
    calm: require('../support/words/calm.json').map((w: { feelingId: string }) => w.feelingId),
    tense: require('../support/words/tense.json').map((w: { feelingId: string }) => w.feelingId),
    low: require('../support/words/low.json').map((w: { feelingId: string }) => w.feelingId),
    okay: require('../support/words/okay.json').map((w: { feelingId: string }) => w.feelingId),
  };
  for (const f of wheel) {
    const w = WORD_SUPPORT[f.id];
    expect({ id: f.id, has: !!w, inZone: files[f.zone].includes(f.id) }).toEqual({ id: f.id, has: true, inZone: true });
    if (!w.written) continue;
    expect({ id: f.id, ack: w.acknowledge.length >= 1, options: w.options.length >= 2 }).toEqual({ id: f.id, ack: true, options: true });
    for (const o of w.options) if (o.tool) expect({ id: o.id, tool: tools.has(o.tool) }).toEqual({ id: o.id, tool: true });
    if (w.sensitivity === 'heavy') {
      const safe = w.options.filter((o) => o.sensitivity === 'standard');
      expect({ id: f.id, safeSupport: safe.some((o) => o.support) || safe.some((o) => o.kind === 'body') }).toEqual({ id: f.id, safeSupport: true });
    }
  }
  const heavy = Object.values(WORD_SUPPORT).filter((w) => w.sensitivity === 'heavy').map((w) => w.feelingId).sort();
  expect(heavy).toEqual(['low-numb', 'mad-hateful', 'mad-rage', 'sad-ashamed', 'sad-depressed', 'sad-miserable', 'scared-helpless', 'scared-insignificant']);
});

describe('the words', () => {
  const text = allText();
  const find = (re: RegExp) => text.filter((t) => re.test(t.text)).map((t) => `${t.where}: ${t.text}`);

  test.each([
    ['shame', /\b(fail(ed|ure|ing)?|weak(ness)?|lazy|pathetic|shame(ful)?|your fault|should have|why did(n't)? you|give up)\b/i],
    ['diagnosis', /\b(depress(ion|ed)|anxiety disorder|disorder|diagnos\w*|symptom\w*|clinical|bipolar|ptsd|adhd|trauma response|normal for)\b/i],
    ['promises', /\b(guarantee[ds]?|cure[ds]?|will (fix|heal|stop|pass|make you)|always works|proven|instantly|100%|never fails)\b/i],
    ['commands', /\byou (should|must|need to|have to)\b|\bjust (think positive|relax|calm down|cheer up|get over)\b/i],
    ['comparisons', /\b(everyone|everybody|normal people|other people have it worse|at least you)\b/i],
    ['minimizing', /\b(it's not that bad|could be worse|don't (be|feel) (sad|upset|angry)|you shouldn't feel|toxic|good vibes only|positive vibes)\b/i],
    ['therapy or AI claims', /\b(therapy|therapist|treatment|I understand you|I'm here for you|as an AI|AI)\b/],
    ['medicine and substances', /\b(medication|medicine|pills?|dose|alcohol|drink(ing)? to|cannabis|supplement)\b/i],
    ['cold water, pain or shock', /\b(ice|cold water|cold shower|snap a (rubber )?band|rubber band|pinch|pain|shock|hold your breath)\b/i],
    ['self-harm', /\b(self[- ]harm|cut(ting)? yourself|hurt(ing)? yourself instead)\b/i],
    ['clichés', /\b(everything happens for a reason|good things come|look on the bright side|silver lining|journey of self|best self|live your truth)\b/i],
    ['exact durations as facts', /\b\d+\s*(minutes?|seconds?|hours?|days?|weeks?)\b/i],
  ])('CONTENT-010 no %s', (_name, re) => {
    // The danger line names hurting yourself on purpose: it's the safety copy.
    const hits = find(re).filter((h) => !h.startsWith('hardMode: If you\'re thinking about hurting yourself'));
    expect(hits).toEqual([]);
  });

  test('CONTENT-011 modest: an option says why with care ("often", "can", "many people"), never as a certainty', () => {
    for (const z of Object.values(ZONE_SUPPORT))
      for (const o of z.options) expect({ id: o.id, modest: /\b(often|can|may|might|tends? to|many people|a little|usually|helps you|a way of|is a way|deserve|don't have to)\b/i.test(o.why) }).toEqual({ id: o.id, modest: true });
  });

  test('CONTENT-012 a feeling isn\'t named in a way that blames: no "I\'m sorry you feel"', () => {
    expect(find(/sorry you('re| are)? feel/i)).toEqual([]);
  });
});

test('CONTENT-020 docs/support-content-review.md is the content as it is now (node scripts/content-review.js)', () => {
  const fs = require('fs') as { readFileSync: (p: string, e: string) => string };
  const { build } = require('../../../scripts/content-review.js') as { build: () => string };
  expect(fs.readFileSync(`${process.cwd()}/docs/support-content-review.md`, 'utf8').replace(/\r\n/g, '\n')).toBe(build());
});
