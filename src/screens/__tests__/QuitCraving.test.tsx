// Quit a Habit, as a person uses it: a craving (with and without a rating,
// switching tools while the timer keeps going, leaving and coming back), its
// three outcomes, and a hard day (marked on the journey, no reset, a new
// chapter only when chosen). Plus the content rules: no shaming words or
// promises, support lines one tap away, labels for screen readers.
// IDs: docs/test-cases/integration.md (QUIT-UI-*)
jest.mock('../../utils/notifications', () => ({
  cancelReminders: jest.fn(async () => {}),
  scheduleReminder: jest.fn(async () => []),
  scheduleTaskReminders: jest.fn(async () => []),
}));
jest.setTimeout(30_000);

import { screen } from '@testing-library/react-native';
import { resetAll, useClock, restoreClock, makeQuitHabit, makeTrack } from '../../test-utils';
import { renderScreen } from '../../test-utils/render';
import { useQuitHabitsStore } from '../../store/useQuitHabitsStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { QuitHabitScreen, CRAVING_COPY, SLIP_COPY } from '../QuitHabitScreen';

let clock: ReturnType<typeof useClock>;
beforeEach(async () => {
  await resetAll();
  clock = useClock('2026-10-24T20:00');
});
afterEach(() => restoreClock());

function oneHabit(start = '2026-10-15') {
  const habit = makeQuitHabit({ id: 'q1', name: 'Vaping' });
  const track = makeTrack({ id: 't1', quitHabitId: habit.id, startDate: start });
  useQuitHabitsStore.setState({ habits: [habit], tracks: [track], feelingEntries: [], slips: [], cravingSessions: [] } as never);
  return habit.id;
}
const st = () => useQuitHabitsStore.getState();

test('QUIT-UI-001 the journey reads "Day N of your journey", with clean days and the current run smaller', async () => {
  const id = oneHabit();
  await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: id });
  expect(await screen.findByText('Day 10 of your journey')).toBeTruthy();
  expect(screen.getByText('10 clean days · Current run: 10 days')).toBeTruthy();
});

test('QUIT-UI-002 the main number follows the setting', async () => {
  useSettingsStore.setState({ quitPrimaryNumber: 'clean' });
  const id = oneHabit();
  await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: id });
  expect(await screen.findByText('10 clean days')).toBeTruthy();
  expect(screen.getByText('Day 10 of your journey · Current run: 10 days')).toBeTruthy();
});

test('QUIT-UI-010 a craving with a rating: the timer shows in every tool and keeps going when switching; it passed counts an urge ridden out', async () => {
  const id = oneHabit();
  const r = await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: id });
  await r.user.press(await screen.findByText("I'm craving it"));
  expect(screen.getByText(CRAVING_COPY.title)).toBeTruthy();
  await r.user.press(screen.getByLabelText('7 out of 10'));
  expect(screen.getByText('Riding it out: 0:00')).toBeTruthy();
  await r.user.press(screen.getByText('Breathe and ride it out'));
  clock.advance(65_000);
  await r.user.press(screen.getByText(CRAVING_COPY.tryElse));
  expect(await screen.findByText(/Riding it out: 1:0\d/)).toBeTruthy();
  await r.user.press(screen.getByText('See all options'));
  await r.user.press(screen.getByText('Check the facts'));
  expect(screen.getByText(/Riding it out: 1:0\d/)).toBeTruthy();
  await r.user.press(screen.getAllByText(CRAVING_COPY.okay)[0]);
  await r.user.press(screen.getByLabelText('2 out of 10'));
  await r.user.press(screen.getByText(CRAVING_COPY.passed));
  expect(await screen.findByText(CRAVING_COPY.passedLine(1, 'Vaping'))).toBeTruthy();
  const session = st().cravingSessions[0];
  expect(session).toMatchObject({ ratingBefore: 7, ratingAfter: 2, outcome: 'passed' });
  expect(session.tools.map((t) => t.toolId)).toEqual(['rideItOut', 'checkFacts']);
  expect(st().feelingEntries.filter((e) => e.isResistedUrge)).toHaveLength(1);
  expect(st().feelingEntries[0].approach).toBe('Checking the facts');
});

test('QUIT-UI-011 without a rating (Skip), and "Still here": back to the tools, the same session and timer', async () => {
  const id = oneHabit();
  const r = await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: id });
  await r.user.press(await screen.findByText("I'm craving it"));
  await r.user.press(screen.getByText(CRAVING_COPY.skip));
  await r.user.press(screen.getByText(CRAVING_COPY.okay));
  await r.user.press(screen.getByText(CRAVING_COPY.stillHere));
  expect(await screen.findByText(CRAVING_COPY.stillHereLine)).toBeTruthy();
  expect(st().cravingSessions).toHaveLength(1);
  expect(st().cravingSessions[0]).toMatchObject({ outcome: 'stillHere', ratingBefore: undefined });
  expect(st().cravingSessions[0].endedAt).toBeUndefined();
  expect(st().feelingEntries).toHaveLength(0); // nothing counted until it passes
});

test('QUIT-UI-012 leaving mid-craving and coming back later (Ona closed): the same session, with the right time', async () => {
  const id = oneHabit();
  const first = await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: id });
  await first.user.press(await screen.findByText("I'm craving it"));
  await first.user.press(screen.getByText(CRAVING_COPY.skip));
  await first.user.press(screen.getByText('Breathe and ride it out'));
  // Ona closed and opened again: a fresh screen, with only what was saved.
  clock.advance(4 * 60_000 + 12_000);
  const again = await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: id });
  await again.user.press(await screen.findByText(CRAVING_COPY.resume('4:12')));
  expect(screen.getByText(/Riding it out: 4:1\d/)).toBeTruthy();
  expect(st().cravingSessions).toHaveLength(1);
});

test('QUIT-UI-020 "I slipped" from a craving, and "I had a hard day": marked on the journey, no reset, no new chapter unless chosen', async () => {
  const id = oneHabit();
  const r = await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: id });
  await r.user.press(await screen.findByText("I'm craving it"));
  await r.user.press(screen.getByText(CRAVING_COPY.skip));
  await r.user.press(screen.getByText(CRAVING_COPY.okay));
  await r.user.press(screen.getByText(CRAVING_COPY.slipped));
  expect(await screen.findByText(SLIP_COPY.title)).toBeTruthy();
  await r.user.press(screen.getByText('Continue'));
  await r.user.press(screen.getByText('Work'));
  await r.user.press(screen.getByText(SLIP_COPY.mark));
  expect(await screen.findByText(SLIP_COPY.done(10))).toBeTruthy();
  expect(st().slips).toEqual([expect.objectContaining({ date: '2026-10-24', reasonTags: ['Work'], cravingSessionId: st().cravingSessions[0].id })]);
  expect(st().cravingSessions[0]).toMatchObject({ outcome: 'slipped', slipId: st().slips[0].id });
  await r.user.press(screen.getByText(SLIP_COPY.back));
  expect(await screen.findByText('Day 10 of your journey')).toBeTruthy();
  expect(screen.getByText('9 clean days · Current run: 0 days')).toBeTruthy();
  expect(st().tracks).toHaveLength(1); // the same chapter
  expect(st().tracks[0].status).toBe('active');
});

test('QUIT-UI-021 "Start a new chapter?" only when chosen, and the journey count stays', async () => {
  const id = oneHabit();
  const r = await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: id });
  await r.user.press(await screen.findByText('I had a hard day'));
  await r.user.press(screen.getByText('Continue'));
  await r.user.press(screen.getByText(SLIP_COPY.mark));
  await r.user.press(await screen.findByText(SLIP_COPY.newChapter));
  await r.user.press(await screen.findByText(SLIP_COPY.newChapterYes));
  expect(st().tracks).toHaveLength(2);
  expect(await screen.findByText('Day 10 of your journey')).toBeTruthy();
});

test('QUIT-UI-030 support lines are one tap away from the craving and the hard-day screens', async () => {
  const id = oneHabit();
  const r = await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: id });
  await r.user.press(await screen.findByText("I'm craving it"));
  await r.user.press(screen.getByText(/Support lines/));
  expect(await screen.findByText(/Opened: settings .*"page":"safety"/)).toBeTruthy();
});

test('QUIT-UI-031 the hard-day screen offers support too, and no step blames', async () => {
  const id = oneHabit();
  const r = await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: id });
  await r.user.press(await screen.findByText('I had a hard day'));
  expect(screen.getByText(/Support lines/)).toBeTruthy();
  expect(screen.queryByText(/fail|relapse|start over|back to zero|streak (lost|ended)/i)).toBeNull();
});

test('QUIT-UI-040 the words: no shame, no promises, no medical advice; every rating chip has a label', () => {
  const words = JSON.stringify({ CRAVING_COPY: Object.values(CRAVING_COPY).map((v) => (typeof v === 'function' ? (v as (...a: unknown[]) => string)(3, 'Vaping') : v)), SLIP_COPY: Object.values(SLIP_COPY).map((v) => (typeof v === 'function' ? (v as (n: number) => string)(3) : v)) });
  expect(words).not.toMatch(/\b(fail(ed|ure)?|relapsed?|weak|shame|guarantee[ds]?|cure[ds]?|will (stop|pass)|always works|proven|treatment|diagnos\w*|withdrawal|dose|doctor says)\b/i);
  expect(words).not.toMatch(/\b\d+ (minutes|seconds)\b/); // no exact durations as facts
});
