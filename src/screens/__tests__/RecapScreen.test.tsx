// A2 on screen: Recap's Home and area pages are drawn from the registry.
// Quit appears under Grow as a gentle journey; with "Hide sensitive areas on
// Home" it's gone. IDs: docs/test-cases/integration.md (RECAP-C-*)
jest.mock('../../utils/notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));
jest.setTimeout(30_000);

import { act, screen, userEvent } from '@testing-library/react-native';
import { resetAll, useClock, restoreClock, makeQuitHabit, makeTrack, makeQuitEntry } from '../../test-utils';
import { renderScreen } from '../../test-utils/render';
import { RecapScreen } from '../RecapScreen';
import { useQuitHabitsStore } from '../../store/useQuitHabitsStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useThoughtsStore } from '../../store/useThoughtsStore';

beforeEach(async () => {
  await resetAll();
  useClock('2026-10-24T12:00');
  useQuitHabitsStore.setState({
    habits: [makeQuitHabit({ id: 'q1', name: 'Scrolling' })],
    tracks: [makeTrack({ id: 'tr1', quitHabitId: 'q1', startDate: '2026-10-20' })],
    feelingEntries: [makeQuitEntry({ trackId: 'tr1', date: '2026-10-22', isResistedUrge: true })],
  } as never);
});
afterEach(() => restoreClock());

test('RECAP-C-001 Quit shows under Grow on Home, and its card on the Grow page, in gentle words', async () => {
  await renderScreen('Main', RecapScreen);
  expect(await screen.findByText('Days on your journey')).toBeTruthy(); // the Grow tile
  const user = userEvent.setup();
  await user.press(screen.getByText('Grow'));
  expect(await screen.findByTestId('recap-card-quitHabit')).toBeTruthy();
  expect(screen.getByText('Scrolling')).toBeTruthy();
  expect(screen.queryByText(/fail|relapse/i)).toBeNull();
});

test('RECAP-C-002 "Hide sensitive areas on Home" takes Quit (and Feelings) off Home', async () => {
  useSettingsStore.setState({ hideSensitiveOnHome: true });
  await renderScreen('Main', RecapScreen);
  await screen.findByText('Grow');
  expect(screen.queryByText('Days on your journey')).toBeNull();
});

test('RECAP-C-003 something logged in another section appears straight away (Catch a Feeling or Idea under Reflect)', async () => {
  await renderScreen('Main', RecapScreen);
  await screen.findByText('Reflect');
  expect(screen.queryByText('Thoughts caught')).toBeNull();
  await act(async () => {
    useThoughtsStore.getState().addThought('idea', 'A new idea');
  });
  expect(await screen.findByText('Thoughts caught')).toBeTruthy();
});
