// Letters to Myself through the whole app (the real navigator, the offer host,
// the Back key), turned on as it will be once live: writing a letter; the
// offer after a matching feeling from any section (Read it now / Later / Not
// now, once per feeling, "See another", "Hide this letter for now"); a very
// strong feeling; a dated letter waiting; Back on a half-written letter; a
// letter from a reflection's answer.
// IDs: docs/test-cases/integration.md (LETTER-UI-*)
jest.mock('../../utils/notifications', () => ({ ...jest.requireActual('../../utils/notifications'), cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []), scheduleAt: jest.fn(async () => []) }));
jest.mock('../../data/sectionsMeta', () => {
  const actual = jest.requireActual('../../data/sectionsMeta');
  for (const id of ['letters', 'reflection']) actual.sectionsMeta.find((m: { id: string }) => m.id === id).status = 'live';
  return actual;
});
jest.mock('../../screens/PlanningInsightsScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return { PlanningInsightsScreen: () => <Text>Planning insights</Text> };
});
jest.setTimeout(60_000);

import { act, screen } from '@testing-library/react-native';
import { resetAll, useClock, restoreClock } from '../../test-utils';
import { renderApp } from '../../test-utils/renderApp';
import { openSection } from '../../navigation/navigationRef';
import { useLettersStore } from '../../store/useLettersStore';
import { useReflectionStore } from '../../store/useReflectionStore';
import { useJournalStore } from '../../store/useJournalStore';
import { logFeeling } from '../../feelings/logFeeling';
import { OFFER_DELAY_MS } from '../../letters/LetterOfferHost';
import { LETTERS } from '../../content';
import { LETTERS_COPY } from '../LettersScreen';
import { formatDisplayDate } from '../../utils/date';

const writtenOn = (iso: string) => `You wrote this on ${formatDisplayDate(iso)}.`;
import type { Letter } from '../../types/sections';

let clock: ReturnType<typeof useClock>;
beforeEach(async () => {
  await resetAll();
  clock = useClock('2026-11-01T19:00');
});
afterEach(() => restoreClock());

const st = () => useLettersStore.getState();
const open = (route: string, params?: object) => act(async () => openSection(route as never, params));
const letter = (over: Partial<Letter> = {}): Letter => ({ id: 'l1', kind: 'feeling', zones: ['low'], feelingIds: [], text: 'You have got through days like this before. Text Sam.', createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z', timesShown: 0, ...over });
async function log(input: Parameters<typeof logFeeling>[0]) {
  let id = '';
  await act(async () => {
    id = logFeeling(input);
  });
  await act(async () => {
    jest.advanceTimersByTime(OFFER_DELAY_MS + 10);
  });
  return id;
}

test('LETTER-UI-001 writing a letter for Low: the gentle tip, a starter if wanted, saved; read mode says when it was written', async () => {
  const app = await renderApp();
  await open('letters');
  await app.user.press(await screen.findByTestId('letters-write'));
  await app.user.press(screen.getByTestId('letter-zone-low'));
  expect(screen.getByText(LETTERS.hardFeelingTip)).toBeTruthy();
  await app.user.press(screen.getByText('Remind yourself what has helped before.'));
  await app.user.type(screen.getByTestId('letter-text'), 'A walk, and Sam.');
  await app.user.press(screen.getByTestId('letter-save'));
  expect(st().letters[0]).toMatchObject({ kind: 'feeling', zones: ['low'] });
  expect(st().letters[0].text).toContain('Remind yourself what has helped before.');
  expect(st().letters[0].text).toContain('A walk, and Sam.');
  expect(st().letters[0].showWhenIntense).toBeUndefined(); // "Don't show when very strong" starts on
  expect(await screen.findByText(writtenOn('2026-11-01'))).toBeTruthy();
});

test('LETTER-UI-002 a matching feeling from another section: offered once, opened only by choice; "See another"; read counts', async () => {
  useLettersStore.setState({ letters: [letter(), letter({ id: 'l2', text: 'Rest is allowed.', createdAt: '2026-10-02T10:00:00.000Z' })] });
  const app = await renderApp();
  await log({ source: { kind: 'quitHabit', refId: 'q', trackId: 't' }, zone: 'low' });
  expect(await screen.findByText(LETTERS.offer)).toBeTruthy();
  expect(screen.queryByText('Rest is allowed.')).toBeNull(); // not opened unasked
  await app.user.press(screen.getByTestId('letter-offer-read'));
  expect(screen.getByText(letter().text)).toBeTruthy();
  expect(screen.getByText(writtenOn('2026-10-01'))).toBeTruthy();
  await app.user.press(screen.getByText('See another'));
  expect(screen.getByText('Rest is allowed.')).toBeTruthy();
  expect(st().letters.map((l) => l.timesShown)).toEqual([1, 1]);
  await app.user.press(screen.getByText('Close'));
  expect(screen.queryByText(LETTERS.offer)).toBeNull();
});

test('LETTER-UI-003 one offer per feeling: the journal saving the same feeling again brings no second offer', async () => {
  useLettersStore.setState({ letters: [letter({ zones: ['tense'] })] });
  const app = await renderApp();
  useJournalStore.getState().upsertEntry('2026-11-01', 'tense', 'Long day', [], { feelingChosen: true });
  const jid = useJournalStore.getState().entries[0].id;
  await log({ source: { kind: 'journal', refId: jid }, zone: 'tense' });
  expect(await screen.findByText(LETTERS.offer)).toBeTruthy();
  await app.user.press(screen.getByText(LETTERS.offerNotNow));
  await log({ source: { kind: 'journal', refId: jid }, zone: 'tense' });
  expect(screen.queryByText(LETTERS.offer)).toBeNull();
});

test('LETTER-UI-004 "Later": kept under "Waiting for you"; "Hide this letter for now": not offered again', async () => {
  useLettersStore.setState({ letters: [letter()] });
  const app = await renderApp();
  await log({ zone: 'low' });
  await app.user.press(await screen.findByText(LETTERS.offerLater));
  expect(st().later).toEqual(['l1']);
  await open('letters');
  expect(await screen.findByText(LETTERS_COPY.waiting)).toBeTruthy();
  await log({ zone: 'low', feelingIds: ['sad-lonely'] });
  await app.user.press(await screen.findByTestId('letter-offer-read'));
  await app.user.press(screen.getByText(LETTERS.hideForNow));
  expect(st().letters[0].hidden).toBe(true);
  await log({ zone: 'low' });
  expect(screen.queryByText(LETTERS.offer)).toBeNull();
});

test('LETTER-UI-005 a very strong feeling: no offer, unless the letter says it may be shown then', async () => {
  useLettersStore.setState({ letters: [letter({ zones: ['tense'] })] });
  await renderApp();
  await log({ zone: 'tense', feelingIds: ['scared-anxious'], intensities: { 'scared-anxious': 5 } });
  expect(screen.queryByText(LETTERS.offer)).toBeNull();
  useLettersStore.setState({ letters: [letter({ zones: ['tense'], showWhenIntense: true })], offeredFor: undefined });
  await log({ zone: 'tense', feelingIds: ['scared-anxious'], intensities: { 'scared-anxious': 5 } });
  expect(await screen.findByText(LETTERS.offer)).toBeTruthy();
});

test('LETTER-UI-006 a dated letter on its day: waiting in Letters; opening it marks it delivered', async () => {
  useLettersStore.setState({ letters: [letter({ id: 'd', kind: 'date', zones: [], deliverOn: '2026-11-01', text: 'Happy November, me.' })] });
  const app = await renderApp();
  await open('letters');
  expect(await screen.findByText(LETTERS_COPY.waiting)).toBeTruthy();
  await app.user.press(screen.getAllByLabelText(new RegExp(`^On ${formatDisplayDate('2026-11-01')}`))[0]);
  expect(screen.getByText('Happy November, me.')).toBeTruthy();
  expect(st().letters[0].deliveredAt).toBeTruthy();
  void clock;
});

test('LETTER-UI-007 Back on a half-written letter asks first: Save, Discard, Keep editing', async () => {
  const app = await renderApp();
  await open('letters');
  await app.user.press(await screen.findByTestId('letters-write'));
  await app.user.press(screen.getByTestId('letter-zone-calm'));
  await app.user.type(screen.getByTestId('letter-text'), 'Half a thought');
  await app.pressBack();
  expect(await screen.findByText('Save your changes before leaving?')).toBeTruthy();
  await app.user.press(screen.getByText('Discard'));
  expect(st().letters).toEqual([]);
  expect(screen.getByText(LETTERS_COPY.yours)).toBeTruthy();
});

test('LETTER-UI-008 from a reflection: "Turn one of today\'s answers into a letter" opens a new letter with that answer', async () => {
  const id = useReflectionStore.getState().start({ mode: 'free', title: 'Mine', questions: [{ question: 'What helps?' }] });
  useReflectionStore.getState().setAnswer(id, useReflectionStore.getState().sessions[0].answers[0].id, 'Walking by the river');
  const app = await renderApp();
  await open('reflection', { openSessionId: id, page: 'session' });
  // Already begun, so the feeling before isn't asked again.
  await app.user.press(await screen.findByTestId('reflect-next'));
  await app.user.press(screen.getByTestId('reflect-finish'));
  await app.user.press(screen.getByTestId('reflect-to-letter'));
  await app.user.press(screen.getByText('Walking by the river'));
  expect(await screen.findByDisplayValue('Walking by the river')).toBeTruthy();
  expect(app.route()).toMatchObject({ name: 'letters' });
});
