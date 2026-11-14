// Found on a phone (2026-11-14), through the real screens:
// 1. Feelings → Patterns → Custom: the range calendar shows at once, like in
//    Analysis (tap the first day, then the last; months move).
// 2. Feelings logged from other sections with a colour only (the quick sheet)
//    are in Patterns' list too, under their colour.
// 4. Letters to Myself → a dated letter: future days can be picked (they were
//    all dimmed).
// (3, a deleted item's feelings: feelings/__tests__/removeWithItem.test.ts.)
// IDs: docs/test-cases/integration.md (PHONE-1114-*)
jest.mock('../../utils/notifications', () => ({ ...jest.requireActual('../../utils/notifications'), cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []), scheduleAt: jest.fn(async () => []) }));
jest.mock('../../data/sectionsMeta', () => {
  const actual = jest.requireActual('../../data/sectionsMeta');
  actual.sectionsMeta.find((m: { id: string }) => m.id === 'letters').status = 'live';
  return actual;
});
// The graph loads lazily (a dynamic import Jest can't run): drawn as nothing here.
jest.mock('react', () => ({ ...jest.requireActual('react'), lazy: () => () => null }));
jest.setTimeout(60_000);

import { screen } from '@testing-library/react-native';
import { resetAll, useClock, restoreClock } from '../../test-utils';
import { renderScreen } from '../../test-utils/render';
import { MoodCheckScreen } from '../MoodCheckScreen';
import { LettersScreen } from '../LettersScreen';
import { useFeelingsStore } from '../../store/useFeelingsStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useLettersStore } from '../../store/useLettersStore';
import { logFeeling } from '../../feelings/logFeeling';

beforeEach(async () => {
  await resetAll();
  useClock('2026-11-14T12:00');
});
afterEach(() => restoreClock());

test('PHONE-1114-001 Patterns → Custom: the calendar shows at once; two taps make the range; months move', async () => {
  useSettingsStore.setState({ feelingsPatternsDefault: 'week' } as never);
  const r = await renderScreen('moodCheck', MoodCheckScreen);
  await r.user.press(await screen.findByText('Patterns'));
  await r.user.press(screen.getAllByText('Custom')[0]);
  expect(screen.getByTestId('range-calendar')).toBeTruthy();
  await r.user.press(screen.getByTestId('day-2026-11-03'));
  expect(screen.getByText(/Pick the last day of the range/)).toBeTruthy();
  await r.user.press(screen.getByTestId('day-2026-11-09'));
  expect(screen.getByText(/· tap a day to start a new range/)).toBeTruthy();
  await r.user.press(screen.getByLabelText('Previous month'));
  expect(screen.getByTestId('day-2026-10-15')).toBeTruthy();
});

test('PHONE-1114-002 feelings from other sections with a colour only are in Patterns\' list, under their colour', async () => {
  logFeeling({ source: { kind: 'quitHabit', refId: 'q', trackId: 't' }, zone: 'tense', tags: ['Work'] });
  logFeeling({ source: { kind: 'study', refId: 's' }, zone: 'tense' });
  logFeeling({ zone: 'calm', feelingIds: ['peaceful-content'] });
  expect(useFeelingsStore.getState().entries).toHaveLength(3);
  useSettingsStore.setState({ feelingsPatternsDefault: 'week' } as never);
  const r = await renderScreen('moodCheck', MoodCheckScreen);
  await r.user.press(await screen.findByText('Patterns'));
  expect(screen.getByText('Tense (no word chosen)')).toBeTruthy();
  expect(screen.getByText('2 check-ins')).toBeTruthy();
  expect(screen.getByText('Content')).toBeTruthy();
});

test('PHONE-1114-003 a dated letter: a future day can be picked, today too; past days can\'t', async () => {
  const r = await renderScreen('letters', LettersScreen);
  await r.user.press(await screen.findByTestId('letters-write'));
  await r.user.press(screen.getByTestId('letter-kind-date'));
  // It opens a month ahead (December).
  const future = screen.getByTestId('day-2026-12-20');
  expect(future.props.accessibilityState?.disabled).toBe(false);
  await r.user.press(future);
  await r.user.type(screen.getByTestId('letter-text'), 'Hello, December me.');
  await r.user.press(screen.getByTestId('letter-save'));
  expect(useLettersStore.getState().letters[0]).toMatchObject({ kind: 'date', deliverOn: '2026-12-20' });
  // Past days stay unavailable: a dated letter is for a day ahead.
  await r.user.press(await screen.findByText('Edit'));
  await r.user.press(screen.getByLabelText('Previous month'));
  expect(screen.getByTestId('day-2026-11-13').props.accessibilityState?.disabled).toBe(true);
  expect(screen.getByTestId('day-2026-11-14').props.accessibilityState?.disabled).toBe(false);
});
