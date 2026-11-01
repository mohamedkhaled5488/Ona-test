// Where Back goes in Reflection, through the real navigator and Android's
// Back key (docs/navigation.md), with Reflection turned on as it will be once
// it's live (it's held until the owner's review). Back goes one page at a
// time; opened at a session from elsewhere, Back returns there; a session
// left half-written stays as a draft.
// IDs: docs/test-cases/integration.md (NAV-REFLECT-*)
jest.mock('../../utils/notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));
jest.mock('../../data/sectionsMeta', () => {
  const actual = jest.requireActual('../../data/sectionsMeta');
  actual.sectionsMeta.find((m: { id: string }) => m.id === 'reflection').status = 'live';
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
import { openSection } from '../navigationRef';
import { useReflectionStore } from '../../store/useReflectionStore';
import { REFLECTION_HOME_COPY } from '../../screens/ReflectionScreen';
import { REFLECT_COPY } from '../../screens/ReflectionSession';

beforeEach(async () => {
  await resetAll();
  useClock('2026-11-01T19:00');
});
afterEach(() => restoreClock());

const open = (route: string, params?: object) => act(async () => openSection(route as never, params));

test('NAV-REFLECT-001 opened from Home: Guided setup → Back → Reflection → Back → Home', async () => {
  const app = await renderApp();
  await open('reflection');
  expect(app.route()).toMatchObject({ name: 'reflection', depth: 2 });
  await app.user.press(await screen.findByTestId('reflect-start-guided'));
  expect(screen.getByText(REFLECT_COPY.start)).toBeTruthy();
  expect(await app.pressBack()).toBe('handled');
  expect(screen.getByText(REFLECTION_HOME_COPY.line)).toBeTruthy();
  expect(await app.pressBack()).toBe('handled');
  expect(app.route()).toMatchObject({ name: 'Main', tab: 'home', depth: 1 });
});

test('NAV-REFLECT-002 Back from a half-written question: Reflection\'s home, the session kept as a draft', async () => {
  const app = await renderApp();
  await open('reflection');
  await app.user.press(await screen.findByTestId('reflect-start-free'));
  await app.user.press(await screen.findByTestId('feeling-sheet-skip'));
  await app.user.type(screen.getByTestId('reflect-own-question'), 'What next?');
  await app.user.press(screen.getByText(REFLECT_COPY.start));
  await app.user.type(screen.getByTestId('reflect-answer'), 'Half');
  expect(await app.pressBack()).toBe('handled');
  expect(app.route()).toMatchObject({ name: 'reflection' });
  expect(screen.getByText(REFLECTION_HOME_COPY.continue)).toBeTruthy();
  expect(useReflectionStore.getState().sessions[0]).toMatchObject({ status: 'draft' });
  expect(useReflectionStore.getState().sessions[0].answers[0].answer).toBe('Half');
});

test('NAV-REFLECT-003 opened at a session from somewhere else (Identify the Feeling): Back returns there, not to Reflection\'s home', async () => {
  const id = useReflectionStore.getState().start({ mode: 'free', title: 'Mine', questions: [{ question: 'What now?' }] });
  useReflectionStore.getState().finish(id, { tags: [] });
  const app = await renderApp();
  await open('moodCheck');
  await open('reflection', { openSessionId: id });
  expect(await screen.findByTestId('reflect-title')).toBeTruthy();
  expect(await app.pressBack()).toBe('handled');
  expect(app.route()).toMatchObject({ name: 'moodCheck', depth: 2 });
});

test('NAV-REFLECT-004 the library → a session → Back → the library → Back → Reflection → Back → Home', async () => {
  const id = useReflectionStore.getState().start({ mode: 'free', title: 'Mine', questions: [{ question: 'What now?' }] });
  useReflectionStore.getState().finish(id, { tags: [] });
  const app = await renderApp();
  await open('reflection');
  await app.user.press(await screen.findByTestId('reflect-library'));
  await app.user.press(screen.getByLabelText(/^Mine, /));
  expect(screen.getByTestId('reflect-title')).toBeTruthy();
  expect(await app.pressBack()).toBe('handled');
  expect(screen.getByTestId('reflect-search')).toBeTruthy();
  expect(await app.pressBack()).toBe('handled');
  expect(screen.getByText(REFLECTION_HOME_COPY.line)).toBeTruthy();
  expect(await app.pressBack()).toBe('handled');
  expect(app.route()).toMatchObject({ name: 'Main', depth: 1 });
});
