// Where Back goes, everywhere in Ona (docs/navigation.md), through the real
// navigator and Android's Back key (test-utils/renderApp):
// 1. From a screen or sub-page: the screen you came from, as it was.
// 2. Opened from another section (Recap, a folder, Discover, a link between
//    sections): pushed on top of where you were, so Back returns there.
// 3. A tab's root: Home. Home: "Press Back again to close Ona", then closes.
// 4. Unsaved changes: asked first. Sheets close first.
// 5. First run, Demo mode, sign-in and the account choice: explicit, never stuck.
// Found on a phone (2026-10-29): Back on a Recap area page closed the app.
// IDs: docs/test-cases/integration.md (NAV-*)
jest.mock('../../utils/notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []), initNotifications: jest.fn() }));
// Insights loads its graph lazily (a dynamic import Jest can't run here);
// this test is about where Back goes, so that one screen is a plain stand-in.
jest.mock('../../screens/PlanningInsightsScreen', () => {
  const { Text } = require('react-native');
  return { PlanningInsightsScreen: () => <Text>Insights</Text> };
});
jest.setTimeout(120_000);

import { act, screen } from '@testing-library/react-native';
import { resetAll, useClock, restoreClock } from '../../test-utils';
import { renderApp } from '../../test-utils/renderApp';
import { seededSections } from '../../test-utils/realSeed';
import { LOCAL_DATA } from '../../utils/localData';
import { AREA_TITLES } from '../../utils/recapStats';
import { openSection } from '../navigationRef';
import { EXIT_HINT } from '../RootNavigator';
import { usePlanStore } from '../../store/usePlanStore';
import { useQuitHabitsStore } from '../../store/useQuitHabitsStore';
import type { RootStackParamList } from '../types';

let clock: ReturnType<typeof useClock>;
beforeEach(async () => {
  await resetAll();
  clock = useClock('2026-10-21T18:00');
  for (const [section, state] of Object.entries(seededSections())) LOCAL_DATA[section]?.store.setState(state as never);
});
afterEach(() => restoreClock());

const HOME = { name: 'Main', tab: 'home', depth: 1 };
const open = (route: keyof RootStackParamList, params?: object) => act(() => openSection(route, params));

describe('1-2. every screen opened from Home goes back to Home', () => {
  const plan = () => usePlanStore.getState().plans[0];
  const cases: [keyof RootStackParamList, () => object | undefined][] = [
    ['planBuilder', () => undefined], ['dailyPlanning', () => undefined], ['taskEditor', () => ({ date: '2026-10-21' })], ['planningInsights', () => undefined],
    ['journaling', () => undefined], ['catchAThought', () => undefined], ['studySession', () => undefined], ['dietPlanning', () => undefined], ['songwriting', () => undefined],
    ['mindGames', () => undefined], ['moodCheck', () => undefined], ['sleep', () => undefined], ['book', () => undefined], ['skills', () => undefined], ['habitBuilder', () => undefined],
    ['budget', () => undefined], ['quitHabit', () => undefined], ['habitsHub', () => undefined], ['discover', () => undefined], ['discoverTour', () => ({})],
    ['journalWrite', () => ({ date: '2026-10-21' })], ['planDetail', () => ({ planId: plan().id })], ['settings', () => undefined], ['signIn', () => undefined],
  ];
  test.each(cases)('NAV-001 %s: opened from Home, Back returns to Home', async (route, params) => {
    const app = await renderApp();
    await open(route, params());
    expect(app.route()).toMatchObject({ name: route, depth: 2 });
    expect(await app.pressBack()).toBe('handled');
    expect(app.route()).toEqual(HOME);
  });
});

test('NAV-002 a tab\'s root goes to Home; Home says how to close Ona, and a second Back within 2 seconds closes it', async () => {
  const app = await renderApp();
  for (const tab of ['Plan', 'Reflect', 'Grow', 'Learn']) {
    await app.user.press(screen.getAllByText(tab).at(-1)!);
    expect(app.route().tab).not.toBe('home');
    expect(await app.pressBack()).toBe('handled');
    expect(app.route()).toEqual(HOME);
  }
  expect(await app.pressBack()).toBe('handled');
  expect(await screen.findByText(EXIT_HINT)).toBeTruthy();
  expect(await app.pressBack()).toBe('exit');
  clock.advance(3000);
  expect(await app.pressBack()).toBe('handled'); // a while later: the hint again, not a surprise close
});

test('NAV-003 a Recap area page: Back returns to Home\'s overview (the app stays open); a section opened from it comes back to the area page', async () => {
  const app = await renderApp();
  await app.user.press((await screen.findAllByText(AREA_TITLES.grow))[0]);
  expect(screen.queryByTestId('home-settings')).toBeNull(); // on the area page (Home's own header is gone)
  expect(await app.pressBack()).toBe('handled');
  expect(screen.getByTestId('home-settings')).toBeTruthy(); // Home's own header: the overview
  expect(app.route()).toEqual(HOME);
  // Area page → a section → Back: the area page, as it was.
  await app.user.press((await screen.findAllByText(AREA_TITLES.grow))[0]);
  await act(() => openSection('quitHabit'));
  expect(app.route()).toMatchObject({ name: 'quitHabit' });
  expect(await app.pressBack()).toBe('handled');
  expect(app.route()).toEqual(HOME);
  expect(screen.queryByTestId('home-settings')).toBeNull(); // still on the area page
  expect(await app.pressBack()).toBe('handled');
  expect(screen.getByTestId('home-settings')).toBeTruthy();
});

test('NAV-004 from a folder tab: a section, then Back, returns to that folder (not Home)', async () => {
  const app = await renderApp();
  await app.user.press(screen.getAllByText('Reflect').at(-1)!);
  await app.user.press(await screen.findByText('Journaling'));
  expect(app.route()).toMatchObject({ name: 'journaling' });
  expect(await app.pressBack()).toBe('handled');
  expect(app.route()).toEqual({ name: 'Main', tab: 'reflectFolder', depth: 1 });
});

test('NAV-005 a link from one section to another (Quit\'s support lines): Back returns to the Quit journey as it was', async () => {
  const app = await renderApp();
  const habit = useQuitHabitsStore.getState().habits[0];
  await open('quitHabit', { openHabitId: habit.id });
  await app.user.press(await screen.findByText('Doing instead')); // its paired Build habit, in Habit Builder
  expect(app.route()).toMatchObject({ name: 'habitBuilder', depth: 3 });
  expect(await app.pressBack()).toBe('handled');
  expect(app.route()).toMatchObject({ name: 'quitHabit', depth: 2 });
  expect(screen.getByText("I'm craving it")).toBeTruthy(); // the journey, not the list
  // Inside Quit: journey → the list → Home, one step at a time.
  expect(await app.pressBack()).toBe('handled');
  expect(screen.queryByText("I'm craving it")).toBeNull();
  expect(await app.pressBack()).toBe('handled');
  expect(app.route()).toEqual(HOME);
});

test('NAV-006 a Feelings sub-page (Analysis): Back to Feelings, then to where Feelings was opened from', async () => {
  const app = await renderApp();
  await open('moodCheck');
  await app.user.press(await screen.findByText('Analysis'));
  expect(await screen.findByText('What came up together. Never what caused what.')).toBeTruthy();
  expect(await app.pressBack()).toBe('handled');
  expect(screen.queryByText('What came up together. Never what caused what.')).toBeNull();
  expect(app.route()).toMatchObject({ name: 'moodCheck' });
  expect(await app.pressBack()).toBe('handled');
  expect(app.route()).toEqual(HOME);
});

test('NAV-007 Discover → the tour → Back: Discover', async () => {
  const app = await renderApp();
  await app.user.press(screen.getByTestId('home-discover'));
  await open('discoverTour', {});
  expect(app.route()).toMatchObject({ name: 'discoverTour', depth: 3 });
  expect(await app.pressBack()).toBe('handled');
  expect(app.route()).toMatchObject({ name: 'discover', depth: 2 });
});

test('NAV-008 Settings → a page → Back: Settings, then Home', async () => {
  const app = await renderApp();
  await app.user.press(screen.getByTestId('home-settings'));
  await app.user.press(await screen.findByText(/Help/));
  expect(app.route()).toMatchObject({ name: 'settings', depth: 3 });
  expect(await app.pressBack()).toBe('handled');
  expect(app.route()).toMatchObject({ name: 'settings', depth: 2 });
  expect(await app.pressBack()).toBe('handled');
  expect(app.route()).toEqual(HOME);
});

test('NAV-009 unsaved writing: Back asks first; "Keep editing" stays', async () => {
  const app = await renderApp();
  await open('journalWrite', { date: '2026-10-25' });
  await app.user.type(await screen.findByPlaceholderText('Start writing...'), 'Half a thought');
  await app.pressBack();
  expect(await screen.findByText('Save your changes before leaving?')).toBeTruthy();
  await app.user.press(screen.getByText('Keep editing'));
  expect(app.route()).toMatchObject({ name: 'journalWrite' });
});

test('NAV-010 the same screen reached two ways keeps both on the way back (pushed, never jumped back to)', async () => {
  const app = await renderApp();
  await open('journaling');
  await open('catchAThought');
  await open('journaling'); // e.g. a link back into Journaling from Catch a thought
  expect(app.route()).toMatchObject({ name: 'journaling', depth: 4 });
  await app.pressBack();
  expect(app.route()).toMatchObject({ name: 'catchAThought', depth: 3 });
  await app.pressBack();
  expect(app.route()).toMatchObject({ name: 'journaling', depth: 2 });
});

test('NAV-011 first run: Welcome → sign in → Back: Welcome; Back on Welcome says how to close Ona', async () => {
  const app = await renderApp({ start: 'welcome' });
  await app.user.press(await screen.findByText('Sign in or create an account'));
  expect(app.route()).toMatchObject({ name: 'signIn' });
  expect(await app.pressBack()).toBe('handled');
  expect(app.route()).toMatchObject({ name: 'welcome' });
  expect(await app.pressBack()).toBe('handled');
  expect(await screen.findByText(EXIT_HINT)).toBeTruthy();
});

// NAV-012 (the account choice: Back is "Decide later") is with the sheet's own
// tests: src/screens/__tests__/AccountChoiceSheet.test.tsx.
