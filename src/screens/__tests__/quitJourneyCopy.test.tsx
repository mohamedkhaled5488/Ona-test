// Quit a Habit: the journey's chapter lengths read naturally. Found by the
// first emulator run (E2E-005): a chapter that started and ended the same
// day showed "1 days". IDs: docs/audit-report.md (FIX-12)
jest.mock('../../utils/notifications', () => ({
  cancelReminders: jest.fn(async () => {}),
  scheduleReminder: jest.fn(async () => []),
  scheduleTaskReminders: jest.fn(async () => []),
}));
jest.setTimeout(20_000);

import { screen } from '@testing-library/react-native';
import { resetAll, useClock, restoreClock, makeQuitHabit, makeTrack } from '../../test-utils';
import { renderScreen } from '../../test-utils/render';
import { useQuitHabitsStore } from '../../store/useQuitHabitsStore';
import { QuitHabitScreen } from '../QuitHabitScreen';

beforeEach(async () => {
  await resetAll();
  useClock('2026-10-19T12:00');
});
afterEach(() => restoreClock());

function journey(lengths: { start: string; end: string }[]) {
  const habit = makeQuitHabit({ id: 'quit-1', name: 'late-night scrolling' });
  const ended = lengths.map((l, i) => makeTrack({ id: `t${i}`, quitHabitId: habit.id, startDate: l.start, endDate: l.end, status: 'archived' } as never));
  const active = makeTrack({ id: 'now', quitHabitId: habit.id, startDate: '2026-10-19' });
  useQuitHabitsStore.setState({ habits: [habit], tracks: [active, ...ended] } as never);
  return habit.id;
}

test('FIX-12a a one-day chapter says "1 day", never "1 days"', async () => {
  const id = journey([{ start: '2026-10-19', end: '2026-10-19' }]);
  await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: id });
  expect(await screen.findByText('Track 1')).toBeTruthy();
  expect(screen.queryByText(/\b1 days\b/)).toBeNull();
  expect(screen.getByText('1 day')).toBeTruthy();
});

test('FIX-12b longer chapters still say "days"', async () => {
  const id = journey([{ start: '2026-10-01', end: '2026-10-05' }]);
  await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: id });
  expect(await screen.findByText(/^\d+ days$/)).toBeTruthy();
});
