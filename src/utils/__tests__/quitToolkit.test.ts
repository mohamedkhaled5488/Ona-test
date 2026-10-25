// The craving toolkit's rules (quit/toolkit.ts) and the store actions that
// edit it: what's offered first, what's visible for which habit, "Surprise
// me", and pin / order / hide / your own tools / if-then plans.
// IDs: docs/test-cases/integration.md (QUIT-TK-*)
import { resetAll } from '../../test-utils';
import { makeQuitHabit } from '../../test-utils';
import { useQuitHabitsStore } from '../../store/useQuitHabitsStore';
import {
  BUILT_IN_TOOLS,
  TOOLKIT_COPY,
  gamesHidden,
  myToolkit,
  suggestionFor,
  surpriseFor,
  timeOfDayOf,
  visibleTools,
  type ToolDef,
} from '../../quit/toolkit';
import type { QuitCravingSession, QuitHabit } from '../../types/sections';

// The rules are tested on a fixed catalog (the first four tools and one
// game), so adding content never changes what these tests mean.
const FOUR = BUILT_IN_TOOLS.filter((t) => ['rideItOut', 'doSomethingInstead', 'checkFacts', 'reachOut'].includes(t.id)).sort((a, b) => ['rideItOut', 'doSomethingInstead', 'checkFacts', 'reachOut'].indexOf(a.id) - ['rideItOut', 'doSomethingInstead', 'checkFacts', 'reachOut'].indexOf(b.id));
const GAME = BUILT_IN_TOOLS.find((t) => t.id === 'memoryMatch')!;
const CATALOG = [...FOUR, GAME];
const at = (hhmm: string) => new Date(`2026-10-25T${hhmm}:00`);
const ids = (tools: ToolDef[]) => tools.map((t) => t.id);
const habit = (over: Partial<QuitHabit> = {}) => makeQuitHabit({ id: 'q1', name: 'Vaping', ...over });
const st = () => useQuitHabitsStore.getState();

beforeEach(async () => {
  await resetAll();
});

describe('what is offered first', () => {
  test('QUIT-TK-001 nothing set up: the calm default (breathing)', () => {
    expect(suggestionFor(habit(), at('20:00'))).toMatchObject({ source: 'default', tool: { id: 'rideItOut' } });
  });

  test('QUIT-TK-002 a pinned favorite beats the default; the first pinned, in the user\'s order', () => {
    const h = habit({ toolkit: { pinned: ['reachOut', 'checkFacts'], hidden: [], custom: [] } });
    expect(suggestionFor(h, at('20:00'))).toMatchObject({ source: 'pinned', tool: { id: 'reachOut' } });
  });

  test('QUIT-TK-003 an if-then plan for this time of day comes first; a plan for another time is not offered', () => {
    const h = habit({
      toolkit: { pinned: ['reachOut'], hidden: [], custom: [] },
      plans: [
        { id: 'p1', when: "it's morning and I'm restless", timeOfDay: 'morning', toolId: 'checkFacts' },
        { id: 'p2', when: "it's evening and I'm bored", timeOfDay: 'evening', toolId: 'doSomethingInstead' },
      ],
    });
    expect(suggestionFor(h, at('20:00'))).toMatchObject({ source: 'plan', plan: { id: 'p2' }, tool: { id: 'doSomethingInstead' } });
    expect(suggestionFor(h, at('08:00'))).toMatchObject({ source: 'plan', plan: { id: 'p1' } });
    expect(suggestionFor(h, at('14:00'))).toMatchObject({ source: 'pinned', tool: { id: 'reachOut' } });
  });

  test('QUIT-TK-004 an any-time plan is used when no timed one fits; a timed one that fits wins over it', () => {
    const plans = [
      { id: 'any', when: 'I feel the pull', toolId: 'reachOut' },
      { id: 'eve', when: "it's evening", timeOfDay: 'evening' as const, toolId: 'checkFacts' },
    ];
    expect(suggestionFor(habit({ plans }), at('14:00'))).toMatchObject({ plan: { id: 'any' } });
    expect(suggestionFor(habit({ plans }), at('19:00'))).toMatchObject({ plan: { id: 'eve' } });
  });

  test('QUIT-TK-005 a plan or pin for a hidden tool is skipped; with the default hidden, the first visible tool', () => {
    const h = habit({ toolkit: { pinned: ['checkFacts'], hidden: ['checkFacts', 'rideItOut'], custom: [] }, plans: [{ id: 'p', when: 'x', toolId: 'checkFacts' }] });
    expect(suggestionFor(h, at('20:00'), FOUR)).toMatchObject({ source: 'default', tool: { id: 'doSomethingInstead' } });
  });

  test('QUIT-TK-006 time of day by the phone\'s clock, at the edges', () => {
    expect(['04:59', '05:00', '11:59', '12:00', '16:59', '17:00', '21:59', '22:00', '00:00'].map((t) => timeOfDayOf(at(t)))).toEqual([
      'night', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night',
    ]);
  });
});

describe('what each habit sees', () => {
  test('QUIT-TK-010 hidden tools are never offered (menu, My toolkit, suggestion)', () => {
    const h = habit({ toolkit: { pinned: ['reachOut'], hidden: ['reachOut'], custom: [] } });
    expect(ids(visibleTools(h))).not.toContain('reachOut');
    expect(myToolkit(h)).toEqual([]);
  });

  test.each(['gaming', 'gambling', 'scrolling'] as const)('QUIT-TK-011 quitting %s: games are hidden, everything else stays; "Show games anyway" brings them back', (habitType) => {
    const h = habit({ habitType });
    expect(gamesHidden(h)).toBe(true);
    expect(ids(visibleTools(h, CATALOG))).toEqual(ids(FOUR));
    expect(visibleTools(h).filter((t) => t.screenGame)).toEqual([]); // the real catalog too
    expect(ids(visibleTools(habit({ habitType, toolkit: { pinned: [], hidden: [], custom: [], showGames: true } }), CATALOG))).toContain('memoryMatch');
  });

  test.each(['smoking', 'alcoholDrugs', 'food', 'caffeine', 'other', undefined] as const)('QUIT-TK-012 quitting %s: games are offered', (habitType) => {
    expect(ids(visibleTools(habit({ habitType }), CATALOG))).toContain('memoryMatch');
  });

  test('QUIT-TK-013 a pinned game is not suggested while games are hidden', () => {
    const h = habit({ habitType: 'gambling', toolkit: { pinned: ['memoryMatch'], hidden: [], custom: [] } });
    expect(suggestionFor(h, at('20:00'), CATALOG)).toMatchObject({ source: 'default', tool: { id: 'rideItOut' } });
  });
});

describe('"Surprise me" (never random)', () => {
  const session = (tools: [string, string][], over: Partial<QuitCravingSession> = {}): QuitCravingSession => ({
    id: 's' + tools.length,
    quitHabitId: 'q1',
    trackId: 't1',
    startedAt: '2026-10-20T20:00:00.000Z',
    tools: tools.map(([toolId, startedAt]) => ({ toolId, startedAt })),
    ...over,
  });

  test('QUIT-TK-020 a tool never used comes first, in menu order; then the one used longest ago', () => {
    const past = [session([['rideItOut', '2026-10-20T20:00:00.000Z'], ['checkFacts', '2026-10-21T20:00:00.000Z']])];
    expect(surpriseFor(habit(), past, undefined, FOUR)?.id).toBe('doSomethingInstead');
    const all = [session([['doSomethingInstead', '2026-10-22T20:00:00.000Z'], ['reachOut', '2026-10-23T20:00:00.000Z']]), ...past];
    expect(surpriseFor(habit(), all, undefined, FOUR)?.id).toBe('rideItOut');
  });

  test('QUIT-TK-021 skips what was tried in this craving; with everything tried, any visible tool; the same answer every time', () => {
    const current = session([['rideItOut', '2026-10-25T20:00:00.000Z'], ['doSomethingInstead', '2026-10-25T20:01:00.000Z']]);
    const a = surpriseFor(habit(), [current], current, FOUR);
    expect(a?.id).toBe('checkFacts');
    expect(surpriseFor(habit(), [current], current, FOUR)?.id).toBe(a?.id);
    const everything = session(FOUR.map((t, i) => [t.id, `2026-10-25T20:0${i}:00.000Z`]));
    expect(surpriseFor(habit(), [everything], everything, FOUR)?.id).toBe('rideItOut');
  });

  test('QUIT-TK-022 other habits\' history doesn\'t count', () => {
    const other = session([['doSomethingInstead', '2026-10-25T20:00:00.000Z']], { quitHabitId: 'q2' });
    expect(surpriseFor(habit({ toolkit: { pinned: [], hidden: ['rideItOut'], custom: [] } }), [other], undefined, FOUR)?.id).toBe('doSomethingInstead');
  });
});

describe('editing the toolkit (store)', () => {
  const setUp = (over: Partial<QuitHabit> = {}) => useQuitHabitsStore.setState({ habits: [habit(over)] } as never);
  const h = () => st().habits[0];

  test('QUIT-TK-030 an older habit (no toolkit yet) can pin, order and unpin', () => {
    setUp();
    st().pinTool('q1', 'checkFacts', true);
    st().pinTool('q1', 'reachOut', true);
    st().pinTool('q1', 'rideItOut', true);
    st().moveTool('q1', 'rideItOut', -1);
    expect(h().toolkit?.pinned).toEqual(['checkFacts', 'rideItOut', 'reachOut']);
    st().moveTool('q1', 'checkFacts', -1); // already first: nothing
    st().moveTool('q1', 'reachOut', 1); // already last: nothing
    expect(h().toolkit?.pinned).toEqual(['checkFacts', 'rideItOut', 'reachOut']);
    st().pinTool('q1', 'rideItOut', false);
    expect(h().toolkit?.pinned).toEqual(['checkFacts', 'reachOut']);
  });

  test('QUIT-TK-031 hiding unpins; pinning again shows it', () => {
    setUp();
    st().pinTool('q1', 'reachOut', true);
    st().hideTool('q1', 'reachOut', true);
    expect(h().toolkit).toMatchObject({ pinned: [], hidden: ['reachOut'] });
    st().pinTool('q1', 'reachOut', true);
    expect(h().toolkit).toMatchObject({ pinned: ['reachOut'], hidden: [] });
  });

  test('QUIT-TK-032 your own tool: pinned straight away, with its timer; removing it takes its plans with it', () => {
    setUp();
    const id = st().addCustomTool('q1', '  Play guitar ', 5);
    expect(h().toolkit?.custom).toEqual([{ id, name: 'Play guitar', minutes: 5 }]);
    expect(h().toolkit?.pinned).toEqual([id]);
    expect(myToolkit(h())).toMatchObject([{ id, title: 'Play guitar', label: 'Play guitar', category: 'own', minutes: 5 }]);
    st().addPlan('q1', { when: "it's evening", timeOfDay: 'evening', toolId: id });
    const keep = st().addPlan('q1', { when: 'any time', toolId: 'reachOut' });
    st().removeCustomTool('q1', id);
    expect(h().toolkit).toMatchObject({ custom: [], pinned: [] });
    expect(h().plans?.map((p) => p.id)).toEqual([keep]);
  });

  test('QUIT-TK-033 no timer, or a nonsense one, means no timer', () => {
    setUp();
    st().addCustomTool('q1', 'Make tea');
    st().addCustomTool('q1', 'Stretch', 0);
    expect(h().toolkit?.custom.map((c) => c.minutes)).toEqual([undefined, undefined]);
  });

  test('QUIT-TK-034 plans: added in order, words trimmed, removed by id', () => {
    setUp();
    const a = st().addPlan('q1', { when: "  it's evening and I'm bored ", timeOfDay: 'evening', toolId: 'doSomethingInstead' });
    st().addPlan('q1', { when: 'after dinner', toolId: 'reachOut' });
    expect(h().plans).toMatchObject([{ id: a, when: "it's evening and I'm bored", timeOfDay: 'evening' }, { when: 'after dinner', timeOfDay: undefined }]);
    st().removePlan('q1', a);
    expect(h().plans).toHaveLength(1);
  });

  test('QUIT-TK-035 a new habit carries its type and is offered the toolkit once; unknown ids change nothing', () => {
    const { habitId } = st().addQuitHabit('Drinking', undefined, 'alcoholDrugs');
    expect(st().habits[0]).toMatchObject({ id: habitId, habitType: 'alcoholDrugs', toolkitOffered: false });
    const before = JSON.stringify(st().habits);
    st().pinTool('nope', 'rideItOut', true);
    st().addPlan('nope', { when: 'x', toolId: 'rideItOut' });
    st().removeCustomTool('nope', 'x');
    expect(JSON.stringify(st().habits)).toBe(before);
  });
});

test('QUIT-TK-040 the toolkit\'s words: no shame, no promises, no medical claims beyond the one careful note', () => {
  const text = JSON.stringify([
    ...Object.values(TOOLKIT_COPY).map((v) => (typeof v === 'function' ? (v as (...a: string[]) => string)('x', 'y') : v)),
    ...BUILT_IN_TOOLS.flatMap((t) => [t.title, t.line, t.label]),
  ]);
  expect(text).not.toMatch(/\b(fail(ed|ure)?|relapsed?|weak|shame|guarantee[ds]?|cure[ds]?|will (stop|pass)|always works|proven|treatment|diagnos\w*|withdrawal|dose|lucky|win|prize|reward)\b/i);
  // The substances note is a suggestion to see a doctor, never advice itself.
  expect(TOOLKIT_COPY.substanceNote).toBe("If you've been using heavily, talk to a doctor before stopping suddenly.");
});
