// Support for this feeling through the whole app (the real navigator, the
// after-feeling offer, the Back key), turned on as it will be once live:
// picking a feeling; hard-feeling mode (breathing first, "Talk to someone");
// trying a tool and "Did this help?"; "Why this can help" and "Not for me";
// danger in the person's own note; the quiet offer after a Low or Tense
// feeling (and turning it off); saving the feeling only if chosen; the
// check-in an hour later; Back one step at a time; support lines everywhere.
// IDs: docs/test-cases/integration.md (SUP-UI-*)
jest.mock('../../utils/notifications', () => ({ ...jest.requireActual('../../utils/notifications'), cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []), scheduleAt: jest.fn(async () => ['c1']) }));
jest.mock('../../data/sectionsMeta', () => {
  const actual = jest.requireActual('../../data/sectionsMeta');
  for (const id of ['support', 'letters', 'reflection']) actual.sectionsMeta.find((m: { id: string }) => m.id === id).status = 'live';
  return actual;
});
jest.mock('../../screens/PlanningInsightsScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return { PlanningInsightsScreen: () => <Text>Planning insights</Text> };
});
jest.setTimeout(60_000);

import { act, fireEvent, screen } from '@testing-library/react-native';
import { resetAll, useClock, restoreClock } from '../../test-utils';
import { renderApp } from '../../test-utils/renderApp';
import { openSection } from '../../navigation/navigationRef';
import { useSupportStore } from '../../store/useSupportStore';
import { useFeelingsStore } from '../../store/useFeelingsStore';
import { logFeeling } from '../../feelings/logFeeling';
import { OFFER_DELAY_MS, SUPPORT_OFFER } from '../../letters/LetterOfferHost';
import { HARD_MODE } from '../../content';
import { CHECK_IN } from '../../support/engine';
import { SUPPORT_COPY } from '../SupportScreen';
import { SUPPORT_LINK_TEXT } from '../../components/SupportLink';
import { scheduleAt } from '../../utils/notifications';

beforeEach(async () => {
  await resetAll();
  useClock('2026-11-01T12:00');
});
afterEach(() => restoreClock());

const open = (params?: object) => act(async () => openSection('support' as never, params));
const sup = () => useSupportStore.getState();

async function pick(app: Awaited<ReturnType<typeof renderApp>>, zone: string, word?: string, strength?: number) {
  await open();
  await app.user.press(await screen.findByTestId(`support-zone-${zone}`));
  if (word) await app.user.press(screen.getByTestId(`support-word-${word}`));
  if (strength) await app.user.press(screen.getByTestId(`support-strength-${strength}`));
  await app.user.press(screen.getByTestId('support-show'));
}

test('SUP-UI-001 Low, felt strongly: hard-feeling mode, breathing first and "Talk to someone" in view; try it, then "Did this help?"', async () => {
  const app = await renderApp();
  await pick(app, 'low', 'sad-lonely', 5);
  expect(await screen.findByTestId('support-hard')).toBeTruthy();
  expect(screen.getByText(HARD_MODE.talkTitle)).toBeTruthy();
  const first = sup().history[0].optionIds[0];
  expect(first).toMatch(/breathe|grounding|notice/);
  await app.user.press(screen.getAllByText(SUPPORT_COPY.tryIt)[0]);
  await app.user.press(await screen.findByTestId('support-tool-done'));
  await app.user.press(await screen.findByTestId('support-helped-yes'));
  expect(sup().votes[first]).toEqual({ yes: 1, aLittle: 0, notReally: 0 });
  expect(screen.getByText(SUPPORT_COPY.thanks)).toBeTruthy();
});

test('SUP-UI-002 an everyday Tense: the acknowledgement, "Why this can help" when asked, "Not for me" hides it (and remembers)', async () => {
  const app = await renderApp();
  await pick(app, 'tense', 'tense-worried', 2);
  expect(await screen.findByTestId('support-gentle')).toBeTruthy();
  expect(screen.getByText('Something is worrying you. You noticed it, and that helps.')).toBeTruthy();
  const [firstId] = sup().history[0].optionIds;
  const card = screen.getByTestId(`support-option-${firstId}`);
  expect(card).toBeTruthy();
  await app.user.press(screen.getAllByText(SUPPORT_COPY.why)[0]);
  await app.user.press(screen.getAllByText(SUPPORT_COPY.hide)[0]);
  expect(sup().hidden).toEqual([firstId]);
  expect(screen.queryByTestId(`support-option-${firstId}`)).toBeNull();
});

test('SUP-UI-003 danger in the person\'s own note: the support card and a caring line, nothing else', async () => {
  const id = useFeelingsStore.getState().addEntry('low', [], undefined, undefined);
  useFeelingsStore.getState().setEntryNote(id, "I don't want to be here");
  const app = await renderApp();
  await open({ feelingId: id });
  expect(await screen.findByTestId('support-danger')).toBeTruthy();
  expect(screen.getByText(HARD_MODE.dangerTitle)).toBeTruthy();
  expect(screen.queryByText(SUPPORT_COPY.tryIt)).toBeNull();
  await app.user.press(screen.getByTestId('support-lines'));
  expect(app.route()).toMatchObject({ name: 'settings' });
});

test('SUP-UI-004 after a Low feeling is noted anywhere (no letter for it): a quiet "See ideas"; not for Calm; not once turned off', async () => {
  const app = await renderApp();
  const log = async (zone: 'low' | 'calm') => {
    let id = '';
    await act(async () => {
      id = logFeeling({ zone });
    });
    await act(async () => {
      jest.advanceTimersByTime(OFFER_DELAY_MS + 10);
    });
    return id;
  };
  const id = await log('low');
  expect(await screen.findByText(SUPPORT_OFFER.message)).toBeTruthy();
  await app.user.press(screen.getByText(SUPPORT_OFFER.action));
  expect(app.route()).toMatchObject({ name: 'support' });
  expect(sup().history[0]).toMatchObject({ feelingId: id, zone: 'low' });
  await act(async () => {
    jest.advanceTimersByTime(10_000);
  });
  await log('calm');
  expect(screen.queryByText(SUPPORT_OFFER.message)).toBeNull();
  sup().setOfferAfterLog(false);
  await log('low');
  expect(screen.queryByText(SUPPORT_OFFER.message)).toBeNull();
});

test('SUP-UI-005 a feeling picked here goes in the Feelings log only if the person asks', async () => {
  const app = await renderApp();
  await pick(app, 'okay');
  expect(useFeelingsStore.getState().entries).toEqual([]);
  await act(async () => openSection('Main' as never));
  await open();
  await app.user.press(await screen.findByTestId('support-zone-tense'));
  await app.user.press(screen.getByTestId('support-word-tense-stressed'));
  await act(async () => fireEvent(screen.getByLabelText(SUPPORT_COPY.save), 'valueChange', true));
  await app.user.press(screen.getByTestId('support-show'));
  expect(useFeelingsStore.getState().entries.map((e) => [e.zone, e.source?.kind])).toEqual([['tense', 'support']]);
});

test('SUP-UI-006 "Check in with me in an hour": a check-in that names no feeling, in an hour; turned off, it\'s cancelled', async () => {
  const app = await renderApp();
  await pick(app, 'tense', undefined, 2);
  await act(async () => fireEvent(await screen.findByLabelText(HARD_MODE.checkInLater), 'valueChange', true));
  expect(scheduleAt).toHaveBeenCalledWith(expect.any(Date), 'support', CHECK_IN.title, CHECK_IN.body);
  const at = (scheduleAt as jest.Mock).mock.calls[0][0] as Date;
  expect(Math.round((at.getTime() - Date.now()) / 60_000)).toBe(60);
  expect(sup().checkInIds).toEqual(['c1']);
  await act(async () => fireEvent(screen.getByLabelText(HARD_MODE.checkInLater), 'valueChange', false));
  expect(sup().checkInIds).toEqual([]);
});

test('SUP-UI-007 Back one step at a time: a tool → the ideas → the picker → Home; support lines on every page', async () => {
  const app = await renderApp();
  await pick(app, 'low', undefined, 5);
  expect(screen.getByText(` ${SUPPORT_LINK_TEXT}`)).toBeTruthy();
  await app.user.press(screen.getAllByText(SUPPORT_COPY.tryIt)[0]);
  expect(await screen.findByTestId('support-tool-done')).toBeTruthy();
  expect(screen.getByText(` ${SUPPORT_LINK_TEXT}`)).toBeTruthy();
  expect(await app.pressBack()).toBe('handled');
  expect(screen.getByTestId('support-hard')).toBeTruthy();
  expect(await app.pressBack()).toBe('handled');
  expect(screen.getByTestId('support-show')).toBeTruthy();
  expect(screen.getByText(` ${SUPPORT_LINK_TEXT}`)).toBeTruthy();
  expect(await app.pressBack()).toBe('handled');
  expect(app.route()).toMatchObject({ name: 'Main' });
});
