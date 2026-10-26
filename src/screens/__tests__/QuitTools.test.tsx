// The craving tools themselves (QuitTools.tsx): each opens from the craving
// menu, the timer keeps going, and the design rules hold: no scores or clocks
// that punish, nothing saved as a result, sound off until chosen, vibration
// off by default, reduce motion respected, "Why this can help" shown, a quiet
// check-in after a long stay, games hidden for screen habits.
// IDs: docs/test-cases/integration.md (QUIT-TOOL-*)
jest.mock('../../utils/notifications', () => ({
  cancelReminders: jest.fn(async () => {}),
  scheduleReminder: jest.fn(async () => []),
  scheduleTaskReminders: jest.fn(async () => []),
}));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(async () => {}), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file:///photos/beach.jpg' }] })),
}));
jest.setTimeout(30_000);

import { AccessibilityInfo, Animated } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { resetAll, useClock, restoreClock, makeQuitHabit, makeTrack } from '../../test-utils';
import { renderScreen } from '../../test-utils/render';
import { useQuitHabitsStore } from '../../store/useQuitHabitsStore';
import { useMindGamesStore } from '../../store/useMindGamesStore';
import { QuitHabitScreen, CRAVING_COPY } from '../QuitHabitScreen';
import { BUILT_IN_TOOLS, TOOLKIT_COPY } from '../../quit/toolkit';
import { BREATHING_PATTERNS, GUIDED_STEPS, TOOL_VIEW_COPY } from '../../quit/toolContent';
import { TOOL_VIEWS, LONG_STAY_MS } from '../QuitTools';
import { isLayerActive, playLayer, stopAllLayers } from '../../utils/audioEngine';
import * as slidePuzzle from '../../games/slidePuzzle';
import type { QuitHabit } from '../../types/sections';

let clock: ReturnType<typeof useClock>;
beforeEach(async () => {
  await resetAll();
  clock = useClock('2026-10-26T20:00');
  (Haptics.impactAsync as jest.Mock).mockClear();
});
afterEach(() => {
  stopAllLayers('quit');
  stopAllLayers('sleep');
  restoreClock();
  jest.restoreAllMocks();
});

const st = () => useQuitHabitsStore.getState();
function oneHabit(over: Partial<QuitHabit> = {}) {
  const habit = makeQuitHabit({ id: 'q1', name: 'Vaping', ...over });
  useQuitHabitsStore.setState({ habits: [habit], tracks: [makeTrack({ id: 't1', quitHabitId: 'q1', startDate: '2026-10-15' })], feelingEntries: [], slips: [], cravingSessions: [] } as never);
}
// Opens a craving and the tool, from "See all options".
async function openTool(title: string, over: Partial<QuitHabit> = {}) {
  oneHabit(over);
  const r = await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: 'q1' });
  await r.user.press(await screen.findByText("I'm craving it"));
  await r.user.press(screen.getByText(CRAVING_COPY.skip));
  await r.user.press(screen.getByText(TOOLKIT_COPY.seeAll));
  await r.user.press(screen.getAllByLabelText(title).at(-1)!);
  return r;
}
const LEGACY = ['rideItOut', 'doSomethingInstead', 'checkFacts', 'reachOut'];

test('QUIT-TOOL-001 every tool has a title, a line, an Analysis label, a category and a "why"; ids and labels are unique; each has a view', () => {
  for (const t of BUILT_IN_TOOLS) {
    expect(t.title && t.line && t.label && t.category && t.why).toBeTruthy();
    expect(LEGACY.includes(t.id) || TOOL_VIEWS.has(t.id)).toBe(true);
  }
  expect(new Set(BUILT_IN_TOOLS.map((t) => t.id)).size).toBe(BUILT_IN_TOOLS.length);
  expect(new Set(BUILT_IN_TOOLS.map((t) => t.label)).size).toBe(BUILT_IN_TOOLS.length);
  // The first four keep their Analysis labels, so past urges group the same.
  expect(BUILT_IN_TOOLS.filter((t) => LEGACY.includes(t.id)).map((t) => t.label).sort()).toEqual(['Checking the facts', 'Doing something instead', 'Reaching out', 'Riding it out']);
});

test('QUIT-TOOL-002 the words: no promises, cures, medical advice, shame or chance; no exact durations given as facts', () => {
  const words = JSON.stringify([
    BUILT_IN_TOOLS.map((t) => [t.title, t.line, t.why]),
    GUIDED_STEPS,
    BREATHING_PATTERNS.map((p) => [p.name, p.line]),
    Object.values(TOOL_VIEW_COPY).map((v) => (typeof v === 'function' ? (v as (...a: unknown[]) => string)(3, 4) : v)),
  ]);
  expect(words).not.toMatch(/\b(guarantee[ds]?|cure[ds]?|will (stop|pass|go away)|always works|proven|treatment|diagnos\w*|withdrawal|dose|medication|fail(ed|ure)?|weak|shame|lucky|luck|win(ner|s)?|prize|reward|jackpot|spin|streak)\b/i);
  // A "why" line never states how long something takes.
  for (const t of BUILT_IN_TOOLS) expect(t.why).not.toMatch(/\d+\s*(min|minute|second|hour)/i);
});

test('QUIT-TOOL-010 grounding, one step at a time; Done goes to "how is it now"; the timer keeps going; the approach is recorded', async () => {
  const r = await openTool('Grounding: 5-4-3-2-1');
  expect(screen.getByText('Step 1 of 5')).toBeTruthy();
  expect(screen.getByText('5 things you can see')).toBeTruthy();
  expect(screen.getByText(/Why this can help: Naming what you can see/)).toBeTruthy();
  for (let i = 0; i < 4; i++) await r.user.press(screen.getByText(TOOL_VIEW_COPY.next));
  expect(screen.getByText('1 thing you can taste')).toBeTruthy();
  await r.user.press(screen.getByText(TOOL_VIEW_COPY.back));
  expect(screen.getByText('2 things you can smell')).toBeTruthy();
  await r.user.press(screen.getByText(TOOL_VIEW_COPY.next));
  clock.advance(90_000);
  await r.user.press(screen.getByText(TOOL_VIEW_COPY.done));
  expect(await screen.findByText(CRAVING_COPY.afterTitle)).toBeTruthy();
  expect(screen.getByText(/Riding it out: 1:3\d/)).toBeTruthy();
  await r.user.press(screen.getByText(CRAVING_COPY.passed));
  expect(st().feelingEntries[0].approach).toBe('Grounding');
  expect(st().cravingSessions[0].tools.map((t) => t.toolId)).toEqual(['grounding']);
});

test.each(Object.keys(GUIDED_STEPS))('QUIT-TOOL-011 the guided tool "%s" opens and can be finished', async (id) => {
  const tool = BUILT_IN_TOOLS.find((t) => t.id === id)!;
  const r = await openTool(tool.title);
  for (let i = 1; i < GUIDED_STEPS[id].length; i++) await r.user.press(screen.getByText(TOOL_VIEW_COPY.next));
  await r.user.press(screen.getByText(TOOL_VIEW_COPY.done));
  expect(await screen.findByText(CRAVING_COPY.afterTitle)).toBeTruthy();
});

test('QUIT-TOOL-020 paced breathing: three patterns, in and out on the clock, box holds; vibration off unless switched on', async () => {
  oneHabit();
  const r = await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: 'q1' });
  await r.user.press(await screen.findByText("I'm craving it"));
  await r.user.press(screen.getByText(CRAVING_COPY.skip));
  await r.user.press(screen.getByLabelText('Breathe and ride it out'));
  expect(screen.getByText('Breathe in')).toBeTruthy();
  await act(async () => {
    clock.advance(4_500);
  });
  expect(await screen.findByText('Breathe out')).toBeTruthy();
  expect(Haptics.impactAsync).not.toHaveBeenCalled();
  await r.user.press(screen.getByLabelText('Box'));
  expect(screen.getByLabelText(TOOL_VIEW_COPY.vibration).props.accessibilityState).toEqual({ checked: false });
  await r.user.press(screen.getByLabelText(TOOL_VIEW_COPY.vibration));
  await act(async () => {
    clock.advance(4_500);
  });
  expect(await screen.findByText('Hold')).toBeTruthy();
  expect(Haptics.impactAsync).toHaveBeenCalled();
  await r.user.press(screen.getByText(TOOL_VIEW_COPY.pauseBreathing));
  expect(await screen.findByText(TOOL_VIEW_COPY.startBreathing)).toBeTruthy();
});

test('QUIT-TOOL-021 reduce motion on: the circle doesn\'t animate, the words still change', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const timing = jest.spyOn(Animated, 'timing');
  oneHabit();
  const r = await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: 'q1' });
  await r.user.press(await screen.findByText("I'm craving it"));
  await r.user.press(screen.getByText(CRAVING_COPY.skip));
  await r.user.press(screen.getByLabelText('Breathe and ride it out'));
  await act(async () => {
    clock.advance(4_500);
  });
  expect(await screen.findByText('Breathe out')).toBeTruthy();
  expect(timing).not.toHaveBeenCalled();
});

test('QUIT-TOOL-030 calm sounds: nothing plays until one is chosen; leaving the tool stops it', async () => {
  const r = await openTool('Calm sounds');
  expect(isLayerActive('rain', 'quit')).toBe(false);
  expect(screen.getByText(TOOL_VIEW_COPY.soundsLine)).toBeTruthy();
  await r.user.press(screen.getByLabelText('Rain'));
  expect(isLayerActive('rain', 'quit')).toBe(true);
  await r.user.press(screen.getByLabelText('Waves'));
  expect(isLayerActive('rain', 'quit')).toBe(false);
  expect(isLayerActive('ocean-waves', 'quit')).toBe(true);
  await r.user.press(screen.getByText(CRAVING_COPY.tryElse));
  expect(isLayerActive('ocean-waves', 'quit')).toBe(false);
});

test('QUIT-TOOL-031 one sound at a time: a calm sound stops Sleep\'s, with a notice', async () => {
  await playLayer('brown-noise', 0.5, 'sleep');
  const r = await openTool('Calm sounds');
  await r.user.press(screen.getByLabelText('Rain'));
  expect(isLayerActive('brown-noise', 'sleep')).toBe(false);
  expect(await screen.findByText(TOOL_VIEW_COPY.soundsReplaced('Sleep'))).toBeTruthy();
});

test('QUIT-TOOL-040 match pairs, gently: no moves, no score, nothing saved; all found: a quiet "nice" and another round', async () => {
  jest.spyOn(Math, 'random').mockReturnValue(0.5); // the deck stays in order: card i pairs with i + 6
  const r = await openTool('Match pairs');
  expect(screen.queryByText(/move|score|best|seconds|left/i)).toBeNull();
  // A mismatch just turns back over.
  await r.user.press(screen.getByLabelText('Card 1, face down'));
  await r.user.press(screen.getByLabelText('Card 2, face down'));
  await act(async () => {
    jest.advanceTimersByTime?.(1000);
    clock.advance(1000);
  });
  for (let i = 1; i <= 6; i++) {
    await r.user.press(await screen.findByLabelText(`Card ${i}, face down`));
    await r.user.press(screen.getByLabelText(`Card ${i + 6}, face down`));
  }
  expect(await screen.findByText(TOOL_VIEW_COPY.memoryNice)).toBeTruthy();
  expect(useMindGamesStore.getState().results).toEqual([]);
  await r.user.press(screen.getByText(TOOL_VIEW_COPY.memoryAgain));
  expect(screen.getAllByLabelText(/face down/)).toHaveLength(12);
});

test('QUIT-TOOL-044 the slide puzzle: no moves or clock; tiles say which can slide; solved: a quiet "nice" and another', async () => {
  jest.spyOn(slidePuzzle, 'shuffledBoard').mockReturnValueOnce([1, 2, 3, 4, 5, 6, 7, 0, 8]);
  const r = await openTool('Slide puzzle');
  expect(screen.queryByText(/move|score|best|seconds|left/i)).toBeNull();
  expect(screen.getByLabelText('Tile 1')).toBeTruthy(); // not next to the gap
  await r.user.press(screen.getByLabelText('Tile 1')); // nothing happens
  expect(screen.queryByText(TOOL_VIEW_COPY.slideNice)).toBeNull();
  await r.user.press(screen.getByLabelText('Tile 8, can slide'));
  expect(await screen.findByText(TOOL_VIEW_COPY.slideNice)).toBeTruthy();
  await r.user.press(screen.getByText(TOOL_VIEW_COPY.slideAgain));
  expect(screen.queryByText(TOOL_VIEW_COPY.slideNice)).toBeNull();
  expect(screen.getAllByLabelText(/^Tile \d/)).toHaveLength(8);
  expect(useMindGamesStore.getState().results).toEqual([]);
});

test('QUIT-TOOL-045 draw what you feel: a finger draws, colours and widths change, undo and clear; offered for screen habits too; nothing saved', async () => {
  const r = await openTool('Draw what you feel', { habitType: 'scrolling' });
  const canvas = screen.getByTestId('doodle-canvas');
  expect(canvas.props.accessibilityLabel).toBe(TOOL_VIEW_COPY.doodleCanvas);
  const at = (x: number, y: number) => ({ nativeEvent: { locationX: x, locationY: y, touches: [], changedTouches: [] }, touchHistory: { touchBank: [] } });
  const draw = async (points: [number, number][]) =>
    act(async () => {
      fireEvent(canvas, 'responderGrant', at(...points[0]));
      for (const p of points.slice(1)) fireEvent(canvas, 'responderMove', at(...p));
      fireEvent(canvas, 'responderRelease', at(...points[points.length - 1]));
    });
  // The drawn paths, from the rendered tree.
  type Node = { props?: Record<string, unknown>; children?: unknown[] | null };
  const paths = () => {
    const out: Node[] = [];
    const walk = (n: unknown) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach(walk);
      const node = n as Node;
      if (typeof node.props?.d === 'string' && node.props?.strokeWidth !== undefined) out.push(node);
      node.children?.forEach(walk);
    };
    walk(screen.toJSON());
    return out as { props: Record<string, unknown> }[];
  };
  expect(screen.getByRole('button', { name: TOOL_VIEW_COPY.doodleUndo }).props.accessibilityState).toEqual({ disabled: true });
  await draw([[10, 10], [40, 40], [80, 60]]);
  await r.user.press(screen.getByLabelText(TOOL_VIEW_COPY.doodleThick));
  await r.user.press(screen.getByLabelText(TOOL_VIEW_COPY.doodleColour('Amber')));
  await draw([[100, 100], [140, 120]]);
  const drawn = [...new Map(paths().map((p: { props: Record<string, unknown> }) => [p.props.d, Number(p.props.strokeWidth)])).values()];
  expect(drawn).toEqual([4, 10]);
  await r.user.press(screen.getByText(TOOL_VIEW_COPY.doodleUndo));
  expect(new Set(paths().map((p: { props: Record<string, unknown> }) => p.props.d)).size).toBe(1);
  await r.user.press(screen.getByText(TOOL_VIEW_COPY.doodleClear));
  expect(paths()).toHaveLength(0);
  expect(JSON.stringify(useQuitHabitsStore.getState())).not.toMatch(/M 10 10/);
});

test('QUIT-TOOL-041 gentle sums: no clock, no count; a wrong answer shows the right one and moves on; nothing saved', async () => {
  const r = await openTool('Gentle sums');
  expect(screen.queryByText(/s left|correct|score/i)).toBeNull();
  const question = screen.getByText(/ = \?$/).props.children.join('');
  const [, a, op, b] = question.match(/(\d+) ([+-]) (\d+)/)!;
  const answer = op === '+' ? Number(a) + Number(b) : Number(a) - Number(b);
  const wrong = screen.getAllByRole('button').map((x) => x.props.accessibilityLabel).find((l) => /^-?\d+$/.test(l ?? '') && Number(l) !== answer)!;
  await r.user.press(screen.getByLabelText(wrong));
  expect(screen.getByText(TOOL_VIEW_COPY.mathShow(answer))).toBeTruthy();
  expect(useMindGamesStore.getState().results).toEqual([]);
});

test('QUIT-TOOL-042 quitting gaming: no games in the menu, a note says so, the rest stays', async () => {
  oneHabit({ habitType: 'gaming' });
  const r = await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: 'q1' });
  await r.user.press(await screen.findByText("I'm craving it"));
  await r.user.press(screen.getByText(CRAVING_COPY.skip));
  await r.user.press(screen.getByText(TOOLKIT_COPY.seeAll));
  expect(screen.queryByLabelText('Match pairs')).toBeNull();
  expect(screen.queryByLabelText('Gentle sums')).toBeNull();
  expect(screen.getByText(TOOLKIT_COPY.gamesHiddenInMenu)).toBeTruthy();
  expect(screen.getByLabelText('Calm sounds')).toBeTruthy();
});

test('QUIT-TOOL-043 quitting smoking: the games are there', async () => {
  await openTool('Match pairs', { habitType: 'smoking' });
  expect(screen.getAllByLabelText(/face down/).length).toBe(12);
});

test('QUIT-TOOL-050 delay it: a 10-minute "decide later", read from when it was picked; then a gentle check-in line', async () => {
  const r = await openTool('Delay it');
  expect(screen.getByText('10:00')).toBeTruthy();
  await act(async () => {
    clock.advance(3 * 60_000);
  });
  await r.user.press(screen.getByText(CRAVING_COPY.tryElse));
  await r.user.press(screen.getByText(TOOLKIT_COPY.seeAll));
  await r.user.press(screen.getAllByLabelText('Delay it').at(-1)!);
  expect(await screen.findByText('7:00')).toBeTruthy(); // back to it straight away: the same pause goes on
  await act(async () => {
    clock.advance(7 * 60_000);
  });
  expect(await screen.findByText(TOOL_VIEW_COPY.delayDone, {}, { timeout: 3000 })).toBeTruthy();
});

test('QUIT-TOOL-051 a mindful minute counts down one minute', async () => {
  await openTool('A mindful minute');
  expect(screen.getByText('1:00')).toBeTruthy();
  await act(async () => {
    clock.advance(61_000);
  });
  expect(await screen.findByText(TOOL_VIEW_COPY.mindfulDone, {}, { timeout: 3000 })).toBeTruthy();
});

test('QUIT-TOOL-052 count ten breaths: tap to count, then start again; no score', async () => {
  const r = await openTool('Count ten breaths');
  const circle = screen.getByLabelText(TOOL_VIEW_COPY.countTap);
  for (let i = 0; i < 10; i++) await r.user.press(circle);
  expect(screen.getByText(TOOL_VIEW_COPY.countAgain)).toBeTruthy();
  await r.user.press(circle);
  expect(screen.getByText(TOOL_VIEW_COPY.countOf(1))).toBeTruthy();
});

test('QUIT-TOOL-060 name the craving: the words and one trigger, saved on the craving for Analysis', async () => {
  const r = await openTool('Name the craving');
  const input = screen.getByLabelText(TOOL_VIEW_COPY.nameFeeling);
  await r.user.type(input, 'restless');
  fireEvent(input, 'blur');
  await r.user.press(screen.getByLabelText('Work'));
  expect(st().cravingSessions[0]).toMatchObject({ note: 'restless', triggerTag: 'Work' });
  await r.user.press(screen.getByLabelText('Work'));
  expect(st().cravingSessions[0].triggerTag).toBeUndefined();
});

test('QUIT-TOOL-061 my reasons: the why from the start, your own list, a note to your future self and a photo', async () => {
  const r = await openTool('My reasons', { why: 'To breathe easier on the stairs.' });
  expect(screen.getByText('To breathe easier on the stairs.')).toBeTruthy();
  await r.user.type(screen.getByLabelText(TOOL_VIEW_COPY.reasonsAdd), 'More money for trips');
  await r.user.press(screen.getByText(TOOL_VIEW_COPY.reasonsAdd));
  const note = screen.getByLabelText(TOOL_VIEW_COPY.reasonsNote);
  await r.user.type(note, 'You got through the last one.');
  fireEvent(note, 'blur');
  await r.user.press(screen.getByText(TOOL_VIEW_COPY.reasonsPhoto));
  expect(st().habits[0]).toMatchObject({ reasons: ['More money for trips'], futureNote: 'You got through the last one.', photoUri: 'file:///photos/beach.jpg' });
  await r.user.press(screen.getByLabelText(TOOLKIT_COPY.remove('More money for trips')));
  expect(st().habits[0].reasons).toEqual([]);
});

test('QUIT-TOOL-070 after a long time in one tool: "How are you feeling now?" once; Keep going hides it; I\'m okay now goes on', async () => {
  const r = await openTool('Count ten breaths');
  expect(screen.queryByText(TOOL_VIEW_COPY.longStay)).toBeNull();
  await act(async () => {
    clock.advance(LONG_STAY_MS + 20_000);
  });
  expect(await screen.findByText(TOOL_VIEW_COPY.longStay, {}, { timeout: 20_000 })).toBeTruthy();
  await r.user.press(screen.getByText(TOOL_VIEW_COPY.longStayKeep));
  expect(screen.queryByText(TOOL_VIEW_COPY.longStay)).toBeNull();
  await r.user.press(screen.getByText(CRAVING_COPY.tryElse));
  await r.user.press(screen.getByText(TOOLKIT_COPY.seeAll));
  await r.user.press(screen.getAllByLabelText('Grounding: 5-4-3-2-1').at(-1)!);
  await act(async () => {
    clock.advance(LONG_STAY_MS + 20_000);
  });
  await r.user.press(await screen.findByText(TOOL_VIEW_COPY.longStayOkay, {}, { timeout: 20_000 }));
  expect(await screen.findByText(CRAVING_COPY.afterTitle)).toBeTruthy();
});

test('QUIT-TOOL-080 every tool in the menu has a screen-reader label', async () => {
  oneHabit();
  const r = await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: 'q1' });
  await r.user.press(await screen.findByText("I'm craving it"));
  await r.user.press(screen.getByText(CRAVING_COPY.skip));
  await r.user.press(screen.getByText(TOOLKIT_COPY.seeAll));
  for (const t of BUILT_IN_TOOLS) expect(screen.getAllByLabelText(t.title).length).toBeGreaterThan(0);
});
