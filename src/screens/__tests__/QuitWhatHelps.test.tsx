// "What helps you" on Quit's Analysis page: with Plus, each tool in the
// menu's order with its counts, "Not enough uses yet" below the threshold,
// "tends to" above it, when cravings came and what set them off; without
// Plus, the lock card (the toolkit itself stays free).
// IDs: docs/test-cases/integration.md (WHAT-HELPS-UI-*)
jest.mock('../../utils/notifications', () => ({
  cancelReminders: jest.fn(async () => {}),
  scheduleReminder: jest.fn(async () => []),
  scheduleTaskReminders: jest.fn(async () => []),
}));
let mockPlus = true;
jest.mock('../../plans/access', () => ({ ...jest.requireActual('../../plans/access'), usePlus: () => mockPlus }));
jest.setTimeout(30_000);

import { screen } from '@testing-library/react-native';
import { resetAll, useClock, restoreClock, makeQuitHabit, makeTrack } from '../../test-utils';
import { renderScreen } from '../../test-utils/render';
import { useQuitHabitsStore } from '../../store/useQuitHabitsStore';
import { QuitHabitScreen } from '../QuitHabitScreen';
import { WHAT_HELPS_COPY } from '../../quit/whatHelps';
import type { QuitCravingSession } from '../../types/sections';

beforeEach(async () => {
  await resetAll();
  useClock('2026-10-26T12:00');
  mockPlus = true;
});
afterEach(() => restoreClock());

let n = 0;
function craving(toolId: string, before: number | undefined, after: number | undefined, hour = 20, triggerTag?: string): QuitCravingSession {
  const startedAt = new Date(2026, 9, 1 + (n++ % 20), hour, 0).toISOString();
  return { id: `c${n}`, quitHabitId: 'q1', trackId: 't1', startedAt, endedAt: startedAt, tools: [{ toolId, startedAt }], outcome: 'passed', ratingBefore: before, ratingAfter: after, triggerTag };
}
async function openAnalysis(sessions: QuitCravingSession[]) {
  useQuitHabitsStore.setState({
    habits: [makeQuitHabit({ id: 'q1', name: 'Vaping' })],
    tracks: [makeTrack({ id: 't1', quitHabitId: 'q1', startDate: '2026-09-15' })],
    feelingEntries: [],
    slips: [],
    cravingSessions: sessions,
  } as never);
  const r = await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: 'q1' });
  await r.user.press(await screen.findByText('Analysis'));
  return r;
}

test('WHAT-HELPS-UI-001 with Plus: tools in the menu\'s order; "Not enough uses yet" below the threshold, "tends to" above; timing and triggers as counts', async () => {
  await openAnalysis([
    ...Array.from({ length: 6 }, () => craving('grounding', 8, 4)),
    craving('rideItOut', 7, 6, 9, 'Work'),
    craving('rideItOut', 6, 6, 14),
  ]);
  expect(await screen.findByText(WHAT_HELPS_COPY.title)).toBeTruthy();
  const text = JSON.stringify(screen.toJSON());
  expect(text.indexOf('Riding it out')).toBeLessThan(text.indexOf('Grounding')); // the menu's order, not by results
  expect(screen.getByText('Used 2 times, passed 2 of 2. Not enough uses yet to say more.')).toBeTruthy();
  expect(screen.getByText("Used 6 times, passed 6 of 6. With it, the craving's strength tends to ease by 4 points (6 rated).")).toBeTruthy();
  expect(screen.getByText('Morning 1 · Afternoon 1 · Evening 6 · Night 0')).toBeTruthy();
  expect(screen.queryByText(/Cravings tend to come/)).toBeNull(); // 8 cravings: too few to say
  expect(screen.getByText('Work 1')).toBeTruthy();
  expect(screen.getByText(WHAT_HELPS_COPY.footnote)).toBeTruthy();
});

test('WHAT-HELPS-UI-002 without Plus: the lock card, not the card (the toolkit itself stays free)', async () => {
  mockPlus = false;
  await openAnalysis([craving('grounding', 8, 4)]);
  expect(await screen.findByText('Analysis')).toBeTruthy();
  expect(screen.queryByText(WHAT_HELPS_COPY.title)).toBeNull();
  expect(screen.queryByText(/Used \d+ time/)).toBeNull();
});

test('WHAT-HELPS-UI-003 no cravings yet: no card, and the gentle "patterns need a few moments" line', async () => {
  await openAnalysis([]);
  expect(await screen.findByText(/Patterns need at least 3 matching moments/)).toBeTruthy();
  expect(screen.queryByText(WHAT_HELPS_COPY.title)).toBeNull();
});
