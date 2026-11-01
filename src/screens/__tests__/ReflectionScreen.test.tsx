// Reflection, as a person uses it: a guided session from start to "Saved",
// with the optional feeling before and after (into the Feelings log, source
// "Reflection"); skip, swap, come back later; leaving and picking it up again;
// Ona killed mid-answer; Ask me anything and Free; reading a session, editing
// its title, answering a question again beside the old answer, deleting; the
// library's search; support lines on every page; the gentle support card.
// IDs: docs/test-cases/integration.md (REFLECT-UI-*)
jest.mock('../../utils/notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));
jest.setTimeout(60_000);
let mockPlus = true;
jest.mock('../../plans/access', () => ({ ...jest.requireActual('../../plans/access'), usePlus: () => mockPlus, isPlusNow: () => mockPlus }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, screen } from '@testing-library/react-native';
import { resetAll, useClock, restoreClock } from '../../test-utils';
import { renderScreen } from '../../test-utils/render';
import { ReflectionScreen, REFLECTION_HOME_COPY } from '../ReflectionScreen';
import { REFLECT_COPY } from '../ReflectionSession';
import { useReflectionStore } from '../../store/useReflectionStore';
import { useFeelingsStore } from '../../store/useFeelingsStore';
import { SUPPORT_LINK_TEXT } from '../../components/SupportLink';
import { SUPPORT_CARD_COPY } from '../../reflect/revisit';
import { setDataSpace } from '../../utils/dataSpace';
import { __flushForTests, __resetForTests, startAppData } from '../../utils/dataSpaceController';
import type { ReflectSession } from '../../types/sections';
import { PLUS_FEATURES } from '../../config/plans';

const storage = AsyncStorage as unknown as { clear: () => Promise<void> };
beforeEach(async () => {
  await resetAll();
  mockPlus = true;
  useClock('2026-11-01T19:00');
});
afterEach(() => restoreClock());

const st = () => useReflectionStore.getState();
const open = (params?: object) => renderScreen('reflection', ReflectionScreen, params);

async function startGuidedShort(r: Awaited<ReturnType<typeof open>>) {
  await r.user.press(await screen.findByTestId('reflect-start-guided'));
  await r.user.press(screen.getByTestId('reflect-theme-know-myself'));
  await r.user.press(screen.getByTestId('reflect-length-short'));
  await r.user.press(screen.getByTestId('reflect-depth-light'));
  await r.user.press(screen.getByText(REFLECT_COPY.start));
}

test('REFLECT-UI-001 a guided session, start to "Saved": one question at a time, a quiet "Question 1 of 3", the theme\'s opening and closing; then read mode', async () => {
  const r = await open();
  await startGuidedShort(r);
  // The optional feeling first: skipped.
  expect(await screen.findByText(REFLECT_COPY.arriving)).toBeTruthy();
  await r.user.press(screen.getByTestId('feeling-sheet-skip'));
  expect(screen.getByText(REFLECT_COPY.progress(1, 3))).toBeTruthy();
  expect(screen.getByText('Questions about you, from you. There are no wrong answers here, only your own.')).toBeTruthy();
  await r.user.type(screen.getByTestId('reflect-answer'), 'Mornings, with tea');
  await r.user.press(screen.getByTestId('reflect-next'));
  expect(screen.getByText(REFLECT_COPY.progress(2, 3))).toBeTruthy();
  await r.user.press(screen.getByTestId('reflect-skip'));
  await r.user.type(screen.getByTestId('reflect-answer'), 'That I like quiet');
  await r.user.press(screen.getByTestId('reflect-next'));
  await r.user.press(screen.getByTestId('reflect-finish'));
  expect(screen.getByText('You know yourself a little better than you did a few questions ago. That counts.')).toBeTruthy();
  await r.user.type(screen.getByTestId('reflect-takeaway'), 'Quiet mornings help');
  await r.user.press(screen.getByTestId('reflect-save'));
  expect(await screen.findByText(REFLECT_COPY.leaving)).toBeTruthy();
  await r.user.press(screen.getByTestId('feeling-sheet-skip'));
  const s = st().sessions[0];
  expect(s).toMatchObject({ status: 'done', theme: 'know-myself', takeaway: 'Quiet mornings help' });
  expect(s.answers.map((a) => [a.answer, !!a.skipped])).toEqual([['Mornings, with tea', false], ['', true], ['That I like quiet', false]]);
  // Read mode: the title (editable) and the answers.
  expect(await screen.findByTestId('reflect-title')).toBeTruthy();
  expect(screen.getByText('Mornings, with tea')).toBeTruthy();
  expect(screen.getByText('Quiet mornings help')).toBeTruthy();
});

test('REFLECT-UI-002 the feeling before and after: in the Feelings log, source "Reflection", linked to the session', async () => {
  const r = await open();
  await startGuidedShort(r);
  await r.user.press(await screen.findByLabelText(/^Tense:/));
  await r.user.press(screen.getByTestId('feeling-sheet-save'));
  const id = st().sessions[0].id;
  await r.user.press(screen.getByTestId('reflect-next'));
  await r.user.press(screen.getByTestId('reflect-next'));
  await r.user.press(screen.getByTestId('reflect-next'));
  await r.user.press(screen.getByTestId('reflect-finish'));
  await r.user.press(screen.getByTestId('reflect-save'));
  await r.user.press(await screen.findByLabelText(/^Calm:/));
  await r.user.press(screen.getByTestId('feeling-sheet-save'));
  const feelings = useFeelingsStore.getState().entries.filter((e) => e.source?.kind === 'reflect');
  expect(feelings.map((f) => [f.zone, f.source?.phase, f.source?.refId])).toEqual([['tense', 'before', id], ['calm', 'after', id]]);
  expect(st().sessions[0]).toMatchObject({ feelingBefore: feelings[0].id, feelingAfter: feelings[1].id });
});

test('REFLECT-UI-003 swap and "Come back later": another question in the same place; the saved-for-later one is offered again at the end', async () => {
  const r = await open();
  await startGuidedShort(r);
  await r.user.press(await screen.findByTestId('feeling-sheet-skip'));
  const first = st().sessions[0].answers[0].question;
  await r.user.press(screen.getByTestId('reflect-swap'));
  expect(st().sessions[0].answers[0].question).not.toBe(first);
  expect(screen.getByText(st().sessions[0].answers[0].question)).toBeTruthy();
  await r.user.press(screen.getByTestId('reflect-later'));
  await r.user.press(screen.getByTestId('reflect-next'));
  await r.user.press(screen.getByTestId('reflect-next'));
  await r.user.press(screen.getByTestId('reflect-finish'));
  expect(screen.getByText(REFLECT_COPY.laterTitle(1))).toBeTruthy();
  await r.user.press(screen.getByText(st().sessions[0].answers[0].question));
  expect(screen.getByText(REFLECT_COPY.progress(1, 3))).toBeTruthy();
});

test('REFLECT-UI-004 leaving mid-session keeps it as a draft; it\'s offered on the home page and opens where it was', async () => {
  const r = await open();
  await startGuidedShort(r);
  await r.user.press(await screen.findByTestId('feeling-sheet-skip'));
  await r.user.type(screen.getByTestId('reflect-answer'), 'Half a thought');
  await r.user.press(screen.getByTestId('reflect-next'));
  await r.user.press(screen.getByTestId('reflect-leave'));
  expect(await screen.findByText(REFLECTION_HOME_COPY.continue)).toBeTruthy();
  expect(screen.getByText(/1 of 3 answered/)).toBeTruthy();
  await r.user.press(screen.getByText(/1 of 3 answered/));
  expect(screen.getByText(REFLECT_COPY.progress(2, 3))).toBeTruthy();
  expect(st().sessions).toHaveLength(1);
});

test('REFLECT-UI-005 Ona killed mid-answer: the words typed so far are there when it opens again', async () => {
  await storage.clear();
  __resetForTests();
  setDataSpace('real');
  await startAppData(storage as never, false);
  const id = st().start({ mode: 'free', title: 'Mine', questions: [{ question: 'What now?' }] });
  st().setAnswer(id, st().sessions[0].answers[0].id, 'Typed before the crash');
  await __flushForTests();
  __resetForTests();
  useReflectionStore.setState({ sessions: [] });
  await startAppData(storage as never, false);
  expect(st().sessions[0].answers[0].answer).toBe('Typed before the crash');
  const r = await open();
  await r.user.press(await screen.findByText(/0 of 1 answered|1 of 1 answered/));
  expect(screen.getByDisplayValue('Typed before the crash')).toBeTruthy();
});

test('REFLECT-UI-006 Ask me anything: a question at a time, Next brings another; Free: your own question on a blank page', async () => {
  const r = await open();
  await r.user.press(await screen.findByTestId('reflect-start-ask'));
  await r.user.press(await screen.findByTestId('feeling-sheet-skip'));
  await r.user.type(screen.getByTestId('reflect-answer'), 'One');
  await r.user.press(screen.getByTestId('reflect-next'));
  expect(st().sessions[0].answers).toHaveLength(2);
  expect(st().sessions[0].answers[1].questionId).not.toBe(st().sessions[0].answers[0].questionId);
  await r.user.press(screen.getByText(REFLECT_COPY.finish));
  await r.user.press(screen.getByTestId('reflect-finish'));
  await r.user.press(screen.getByTestId('reflect-save'));
  await r.user.press(await screen.findByTestId('feeling-sheet-skip'));
  expect(st().sessions[0].status).toBe('done');

  const r2 = await open();
  await r2.user.press(await screen.findByTestId('reflect-start-free'));
  await r2.user.press(await screen.findByTestId('feeling-sheet-skip'));
  await r2.user.type(screen.getByTestId('reflect-own-question'), 'What am I avoiding?');
  await r2.user.press(screen.getByText(REFLECT_COPY.start));
  expect(screen.getByText('What am I avoiding?')).toBeTruthy();
  await r2.user.type(screen.getByTestId('reflect-answer'), 'The phone call');
  expect(st().sessions.find((s) => s.mode === 'free')!.answers[0]).toMatchObject({ question: 'What am I avoiding?', answer: 'The phone call', questionId: undefined });
});

function savedSession(over: Partial<ReflectSession> = {}): ReflectSession {
  return {
    id: 'old',
    mode: 'guided',
    theme: 'know-myself',
    depth: 'light',
    length: 'short',
    title: 'Know myself',
    status: 'done',
    startedAt: '2025-11-02T09:00:00.000Z',
    updatedAt: '2025-11-02T09:20:00.000Z',
    seconds: 900,
    position: 3,
    tags: ['self'],
    takeaway: 'I need quiet',
    answers: [{ id: 'oa1', questionId: 'know-myself.light.03', question: 'What do people tend to come to you for?', answer: 'Advice, mostly' }],
    ...over,
  };
}

test('REFLECT-UI-007 "Answer this again": a new answer, with the old one beside it when asked for (never shown unasked)', async () => {
  useReflectionStore.setState({ sessions: [savedSession()] });
  const r = await open({ openSessionId: 'old' });
  await r.user.press(await screen.findByTestId('reflect-again-oa1'));
  await r.user.press(await screen.findByTestId('feeling-sheet-skip'));
  expect(screen.getByText('What do people tend to come to you for?')).toBeTruthy();
  expect(screen.queryByText('Advice, mostly')).toBeNull();
  await r.user.press(screen.getByTestId('reflect-past'));
  expect(screen.getByText('Advice, mostly')).toBeTruthy();
  await r.user.type(screen.getByTestId('reflect-answer'), 'Calm, now');
  const again = st().sessions.find((s) => s.id !== 'old')!;
  expect(again.answers[0]).toMatchObject({ questionId: 'know-myself.light.03', againOf: 'oa1', answer: 'Calm, now' });
});

test('REFLECT-UI-014 in Essentials mode, "Answer this again" is free, and the earlier answer beside it is Plus (a lock card, nothing removed)', async () => {
  mockPlus = false;
  useReflectionStore.setState({ sessions: [savedSession()] });
  const r = await open({ openSessionId: 'old' });
  await r.user.press(await screen.findByTestId('reflect-again-oa1'));
  await r.user.press(await screen.findByTestId('feeling-sheet-skip'));
  await r.user.press(screen.getByTestId('reflect-past'));
  expect(screen.getByText(PLUS_FEATURES.reflectAnswerAgain.title)).toBeTruthy();
  expect(screen.queryByText('Advice, mostly')).toBeNull();
  await r.user.type(screen.getByTestId('reflect-answer'), 'Still writing');
  expect(st().sessions.find((s) => s.id !== 'old')!.answers[0].answer).toBe('Still writing');
  expect(st().sessions.find((s) => s.id === 'old')!.answers[0].answer).toBe('Advice, mostly');
});

test('REFLECT-UI-008 a year ago: a gentle prompt with the date and title only; the answers open when the person taps', async () => {
  useReflectionStore.setState({ sessions: [savedSession()] });
  const r = await open();
  expect(await screen.findByText(REFLECTION_HOME_COPY.yearAgo('Know myself'))).toBeTruthy();
  expect(screen.queryByText('Advice, mostly')).toBeNull();
  await r.user.press(screen.getByText(REFLECTION_HOME_COPY.yearAgoOpen));
  expect(screen.getByText('Advice, mostly')).toBeTruthy();
});

test('REFLECT-UI-009 read mode: rename, favourite an answer, do the set again, delete (with Undo)', async () => {
  useReflectionStore.setState({ sessions: [savedSession()] });
  const r = await open({ openSessionId: 'old' });
  const title = await screen.findByTestId('reflect-title');
  await r.user.clear(title);
  await r.user.type(title, 'Who I am, Nov');
  await act(async () => title.props.onBlur?.());
  expect(st().sessions[0].title).toBe('Who I am, Nov');
  await r.user.press(screen.getByLabelText('Add to favourites'));
  expect(st().sessions[0].answers[0].favorite).toBe(true);
  await r.user.press(screen.getByText(REFLECTION_HOME_COPY.redo));
  expect(st().sessions).toHaveLength(2);
  expect(st().sessions[1]).toMatchObject({ redoOf: 'old', status: 'draft' });
  expect(st().sessions[1].answers.map((a) => a.questionId)).toEqual(['know-myself.light.03']);
});

test('REFLECT-UI-010 delete asks first, and can be undone', async () => {
  useReflectionStore.setState({ sessions: [savedSession()] });
  const r = await open({ openSessionId: 'old' });
  await r.user.press(await screen.findByTestId('reflect-delete'));
  expect(screen.getByText(REFLECTION_HOME_COPY.deleteConfirm)).toBeTruthy();
  await r.user.press(screen.getAllByText('Delete').slice(-1)[0]);
  expect(st().sessions).toEqual([]);
  await r.user.press(await screen.findByText('Undo'));
  expect(st().sessions.map((s) => s.id)).toEqual(['old']);
});

test('REFLECT-UI-011 the library: search finds words in answers; a theme filter', async () => {
  useReflectionStore.setState({ sessions: [savedSession(), savedSession({ id: 'b', theme: 'where-i-am', title: 'Where I am right now', startedAt: '2026-10-20T09:00:00.000Z', answers: [{ id: 'b1', question: 'Weather?', answer: 'Grey, then sun' }] })] });
  const r = await open();
  await r.user.press(await screen.findByTestId('reflect-library'));
  await r.user.type(screen.getByTestId('reflect-search'), 'sun');
  // Sessions are rows labelled "title, date…"; the theme chips are filters.
  expect(screen.getByLabelText(/^Where I am right now, /)).toBeTruthy();
  expect(screen.queryByLabelText(/^Know myself, /)).toBeNull();
  await r.user.clear(screen.getByTestId('reflect-search'));
  await r.user.press(screen.getByRole('checkbox', { name: 'Know myself' }));
  expect(screen.getByLabelText(/^Know myself, /)).toBeTruthy();
  expect(screen.queryByLabelText(/^Where I am right now, /)).toBeNull();
});

test('REFLECT-UI-012 support lines are one tap from every Reflection page', async () => {
  useReflectionStore.setState({ sessions: [savedSession()] });
  const r = await open();
  expect(await screen.findByText(` ${SUPPORT_LINK_TEXT}`)).toBeTruthy(); // home
  await r.user.press(screen.getByTestId('reflect-library'));
  expect(screen.getByText(` ${SUPPORT_LINK_TEXT}`)).toBeTruthy();
  const r2 = await open({ openSessionId: 'old' });
  expect(await screen.findByText(` ${SUPPORT_LINK_TEXT}`)).toBeTruthy(); // read
  const r3 = await open();
  await startGuidedShort(r3);
  await r3.user.press(await screen.findByTestId('feeling-sheet-skip'));
  expect(screen.getByText(` ${SUPPORT_LINK_TEXT}`)).toBeTruthy(); // a question
  await r3.user.press(screen.getByTestId('reflect-next'));
  await r3.user.press(screen.getByTestId('reflect-next'));
  await r3.user.press(screen.getByTestId('reflect-next'));
  await r3.user.press(screen.getByTestId('reflect-finish'));
  expect(screen.getByText(` ${SUPPORT_LINK_TEXT}`)).toBeTruthy(); // closing
  await r3.user.press(screen.getByText(` ${SUPPORT_LINK_TEXT}`));
  expect(await screen.findByText(/Opened: settings .*"page":"safety"/)).toBeTruthy();
  void r2;
});

test('REFLECT-UI-013 heavy feelings on three of the last days: a gentle card offering support, once (not again the same week)', async () => {
  const f = (date: string) => ({ id: date, zone: 'low' as const, feelingIds: [], date, createdAt: `${date}T09:00:00.000Z` });
  useFeelingsStore.setState({ entries: [f('2026-10-30'), f('2026-10-31'), f('2026-11-01')] } as never);
  await open();
  expect(await screen.findByText(SUPPORT_CARD_COPY.title)).toBeTruthy();
  expect(screen.queryByText(/depress|diagnos|disorder/i)).toBeNull();
  expect(st().supportCardShownAt).toBe('2026-11-01');
  await open();
  await screen.findByText(REFLECTION_HOME_COPY.title);
  expect(screen.queryByText(SUPPORT_CARD_COPY.title)).toBeNull();
});
