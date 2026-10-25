// The craving toolkit as a person uses it: choosing what you're quitting
// (and the one-time notes), the one-time offer, My toolkit (pin, order, hide,
// your own tool with a timer, an if-then plan), and all of it showing up first
// in a craving. IDs: docs/test-cases/integration.md (QUIT-TK-UI-*)
jest.mock('../../utils/notifications', () => ({
  cancelReminders: jest.fn(async () => {}),
  scheduleReminder: jest.fn(async () => []),
  scheduleTaskReminders: jest.fn(async () => []),
}));
jest.setTimeout(30_000);

import { fireEvent, screen } from '@testing-library/react-native';
import { resetAll, useClock, restoreClock, makeQuitHabit, makeTrack } from '../../test-utils';
import { renderScreen } from '../../test-utils/render';
import { useQuitHabitsStore } from '../../store/useQuitHabitsStore';
import { QuitHabitScreen, CRAVING_COPY } from '../QuitHabitScreen';
import { TOOLKIT_COPY } from '../../quit/toolkit';
import type { QuitHabit } from '../../types/sections';

let clock: ReturnType<typeof useClock>;
beforeEach(async () => {
  await resetAll();
  clock = useClock('2026-10-25T20:00');
});
afterEach(() => restoreClock());

const st = () => useQuitHabitsStore.getState();
function oneHabit(over: Partial<QuitHabit> = {}) {
  const habit = makeQuitHabit({ id: 'q1', name: 'Vaping', ...over });
  useQuitHabitsStore.setState({ habits: [habit], tracks: [makeTrack({ id: 't1', quitHabitId: 'q1', startDate: '2026-10-15' })], feelingEntries: [], slips: [], cravingSessions: [] } as never);
  return habit.id;
}

test('QUIT-TK-UI-001 a new habit: what you are quitting is optional; alcohol or drugs shows the calm note once; the toolkit is offered once', async () => {
  const r = await renderScreen('quitHabit', QuitHabitScreen);
  await r.user.press(await screen.findByText('Start quitting something'));
  await r.user.type(screen.getByPlaceholderText(/Smoking, nail biting/), 'Drinking');
  await r.user.press(screen.getByLabelText('Alcohol or drugs'));
  await r.user.press(screen.getByText('Start'));
  expect(await screen.findByText(TOOLKIT_COPY.substanceNote)).toBeTruthy();
  await r.user.press(screen.getByText('OK'));
  expect(st().habits[0]).toMatchObject({ habitType: 'alcoholDrugs', substanceNoteShown: true, toolkitOffered: false });
  expect(await screen.findByText(TOOLKIT_COPY.offerTitle)).toBeTruthy();
  await r.user.press(screen.getByText(TOOLKIT_COPY.offerNo));
  expect(screen.queryByText(TOOLKIT_COPY.offerTitle)).toBeNull();
  expect(st().habits[0].toolkitOffered).toBe(true);
  expect(screen.getByLabelText(TOOLKIT_COPY.title)).toBeTruthy(); // still on the journey
});

test('QUIT-TK-UI-002 without a type: no note; older habits are never offered the toolkit', async () => {
  oneHabit();
  await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: 'q1' });
  expect(await screen.findByText('Day 11 of your journey')).toBeTruthy();
  expect(screen.queryByText(TOOLKIT_COPY.offerTitle)).toBeNull();
  expect(screen.queryByText(TOOLKIT_COPY.substanceNote)).toBeNull();
});

test('QUIT-TK-UI-003 "Set it up" opens My toolkit; your own tool with a timer and an evening plan, then a craving at 20:00 offers the plan first', async () => {
  oneHabit({ toolkitOffered: false });
  const r = await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: 'q1' });
  await r.user.press(await screen.findByText(TOOLKIT_COPY.offerYes));
  expect(await screen.findByText(TOOLKIT_COPY.mineEmpty)).toBeTruthy();

  await r.user.type(screen.getByLabelText(TOOLKIT_COPY.ownName), 'Play guitar');
  await r.user.press(screen.getByLabelText('5 min'));
  await r.user.press(screen.getByText(TOOLKIT_COPY.addOwn));
  expect(screen.getAllByLabelText(TOOLKIT_COPY.unpin('Play guitar'))).toHaveLength(2); // pinned straight away (My toolkit, All tools)

  await r.user.type(screen.getByLabelText(TOOLKIT_COPY.planWhen), "it's evening and I'm bored");
  await r.user.press(screen.getByLabelText('Evening'));
  await r.user.press(screen.getAllByLabelText('Play guitar').at(-1)!);
  await r.user.press(screen.getByText(TOOLKIT_COPY.addPlan));
  expect(screen.getByText(TOOLKIT_COPY.plan("it's evening and I'm bored", 'Play guitar'))).toBeTruthy();

  await r.user.press(screen.getByText(' Vaping'));
  await r.user.press(await screen.findByText("I'm craving it"));
  await r.user.press(screen.getByText(CRAVING_COPY.skip));
  expect(screen.getByText(TOOLKIT_COPY.suggestPlan)).toBeTruthy();
  expect(screen.getByText(TOOLKIT_COPY.plan("it's evening and I'm bored", 'Play guitar'))).toBeTruthy();

  // Your own tool, with its gentle timer (read from when it was picked).
  await r.user.press(screen.getByLabelText('Play guitar'));
  expect(screen.getByText('5:00')).toBeTruthy();
  clock.advance(60_000);
  await r.user.press(screen.getByText(CRAVING_COPY.tryElse));
  await r.user.press(screen.getByLabelText('Play guitar'));
  expect(await screen.findByText('4:00')).toBeTruthy();
  clock.advance(5 * 60_000);
  expect(await screen.findByText(TOOLKIT_COPY.ownTimerDone, {}, { timeout: 3000 })).toBeTruthy();
  await r.user.press(screen.getByText('Done'));
  await r.user.press(screen.getByText(CRAVING_COPY.passed));
  expect(st().feelingEntries[0]).toMatchObject({ isResistedUrge: true, approach: 'Play guitar' });
});

test('QUIT-TK-UI-004 pinned tools come first in a craving, in your order; "See all" shows the categories', async () => {
  oneHabit({ toolkit: { pinned: ['checkFacts', 'reachOut'], hidden: [], custom: [] } });
  const r = await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: 'q1' });
  await r.user.press(await screen.findByLabelText(TOOLKIT_COPY.title));
  await r.user.press(screen.getByLabelText(TOOLKIT_COPY.up('Reach out')));
  expect(st().habits[0].toolkit?.pinned).toEqual(['reachOut', 'checkFacts']);
  await r.user.press(screen.getByText(' Vaping'));
  await r.user.press(await screen.findByText("I'm craving it"));
  await r.user.press(screen.getByText(CRAVING_COPY.skip));
  expect(screen.getByText(TOOLKIT_COPY.suggestPinned)).toBeTruthy();
  expect(screen.getByLabelText('Reach out')).toBeTruthy();
  expect(screen.queryByText('Calm the body')).toBeNull();
  await r.user.press(screen.getByText(TOOLKIT_COPY.seeAll));
  for (const c of ['Calm the body', 'Move', 'Think and choose', 'Connect']) expect(screen.getByText(c)).toBeTruthy();
});

test('QUIT-TK-UI-005 a hidden tool is gone from the craving menu; the last one can\'t be hidden', async () => {
  oneHabit({ toolkit: { pinned: [], hidden: ['rideItOut', 'doSomethingInstead', 'checkFacts'], custom: [] } });
  const r = await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: 'q1' });
  await r.user.press(await screen.findByLabelText(TOOLKIT_COPY.title));
  await r.user.press(screen.getByLabelText(TOOLKIT_COPY.hide('Reach out')));
  expect(await screen.findByText(TOOLKIT_COPY.keepOne)).toBeTruthy();
  expect(st().habits[0].toolkit?.hidden).not.toContain('reachOut');
  await r.user.press(screen.getByLabelText(TOOLKIT_COPY.show('Check the facts')));
  await r.user.press(screen.getByText(' Vaping'));
  await r.user.press(await screen.findByText("I'm craving it"));
  await r.user.press(screen.getByText(CRAVING_COPY.skip));
  await r.user.press(screen.getByText(TOOLKIT_COPY.seeAll));
  expect(screen.queryByLabelText('Breathe and ride it out')).toBeNull();
  expect(screen.getAllByLabelText('Check the facts').length).toBeGreaterThan(0);
});

test('QUIT-TK-UI-006 "Surprise me" picks a tool you haven\'t used in a while, and the timer keeps going', async () => {
  oneHabit();
  const r = await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: 'q1' });
  await r.user.press(await screen.findByText("I'm craving it"));
  await r.user.press(screen.getByText(CRAVING_COPY.skip));
  await r.user.press(screen.getByLabelText('Breathe and ride it out'));
  clock.advance(30_000);
  await r.user.press(screen.getByText(CRAVING_COPY.tryElse));
  await r.user.press(screen.getByText(TOOLKIT_COPY.surprise));
  expect(st().cravingSessions[0].tools.map((t) => t.toolId)).toEqual(['rideItOut', 'doSomethingInstead']);
  expect(screen.getByText(/Riding it out: 0:3\d/)).toBeTruthy();
});

test('QUIT-TK-UI-007 quitting gaming: the note about games and "Show games anyway" in My toolkit', async () => {
  oneHabit({ habitType: 'gaming' });
  const r = await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: 'q1' });
  await r.user.press(await screen.findByLabelText(TOOLKIT_COPY.title));
  expect(screen.getByText(TOOLKIT_COPY.gamesNote)).toBeTruthy();
  fireEvent(screen.getByLabelText(TOOLKIT_COPY.showGames), 'valueChange', true);
  expect(st().habits[0].toolkit?.showGames).toBe(true);
});

test('QUIT-TK-UI-008 changing the type to alcohol or drugs in My toolkit: the note once, and it stays in the toolkit\'s help', async () => {
  oneHabit();
  const r = await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: 'q1' });
  await r.user.press(await screen.findByLabelText(TOOLKIT_COPY.title));
  await r.user.press(screen.getByLabelText('Alcohol or drugs'));
  expect(await screen.findByText(TOOLKIT_COPY.substanceTitle)).toBeTruthy();
  await r.user.press(screen.getByText('OK'));
  expect(screen.getByText(TOOLKIT_COPY.substanceNote)).toBeTruthy(); // the help card
  await r.user.press(screen.getByLabelText('Caffeine'));
  await r.user.press(screen.getByLabelText('Alcohol or drugs'));
  expect(screen.queryByText(TOOLKIT_COPY.substanceTitle)).toBeNull(); // not a second time
});
