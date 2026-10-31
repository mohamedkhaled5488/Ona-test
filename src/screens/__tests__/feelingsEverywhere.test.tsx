// Problem 1 (found on a phone, 2026-10-29): a feeling noted in Journaling
// must be in Feelings and its Analysis, with "What's behind this?" tags like
// every other section. Through the real app (renderApp) and the screens
// themselves. IDs: docs/test-cases/integration.md (FEEL-EVERY-*)
jest.mock('../../utils/notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []), initNotifications: jest.fn() }));
jest.setTimeout(120_000);

import { screen } from '@testing-library/react-native';
import { resetAll, useClock, restoreClock, makeQuitHabit, makeTrack } from '../../test-utils';
import { renderApp } from '../../test-utils/renderApp';
import { renderScreen } from '../../test-utils/render';
import { useFeelingsStore } from '../../store/useFeelingsStore';
import { useJournalStore } from '../../store/useJournalStore';
import { useQuitHabitsStore } from '../../store/useQuitHabitsStore';
import { JournalWriteScreen, NO_COLOUR } from '../JournalWriteScreen';
import { QuitHabitScreen } from '../QuitHabitScreen';
import { journalFeelingId } from '../../feelings/fromSections';
import { REASON_TAGS_LABEL } from '../../components/ReasonTagPicker';

beforeEach(async () => {
  await resetAll();
  useClock('2026-10-29T20:00');
  useFeelingsStore.setState({ entries: [] } as never);
  useJournalStore.setState({ entries: [] } as never);
});
afterEach(() => restoreClock());
const feelings = () => useFeelingsStore.getState().entries;

test('FEEL-EVERY-001 the journal on a phone: a colour and "Work", saved, then Feelings → Analysis shows it by tag at once (no restart, no sync)', async () => {
  const app = await renderApp();
  await app.user.press(screen.getAllByText('Reflect').at(-1)!);
  await app.user.press(await screen.findByText('Journaling'));
  await app.user.press(await screen.findByText('Start writing'));
  await app.user.type(await screen.findByPlaceholderText('Start writing...'), 'A long meeting.');
  await app.user.press(screen.getByText(NO_COLOUR));
  await app.user.press(await screen.findByText('Tense'));
  expect(screen.getByText(REASON_TAGS_LABEL)).toBeTruthy(); // the tags, right there once a colour is chosen
  await app.user.press(screen.getByLabelText('Work'));
  await app.user.press(screen.getByText('Save'));
  expect(feelings()).toEqual([expect.objectContaining({ zone: 'tense', reasonTags: ['Work'], date: '2026-10-29', source: expect.objectContaining({ kind: 'journal' }) })]);
  // Back out, into Identify the Feeling → Analysis.
  await app.pressBack();
  await app.pressBack();
  await app.user.press(await screen.findByText('Identify the Feeling'));
  await app.user.press(await screen.findByText('Analysis'));
  expect(await screen.findByText(/^Work: tagged once, with Tense\.$/)).toBeTruthy();
  expect(screen.getAllByText('Based on 1 entry').length).toBeGreaterThan(0);
});

test("FEEL-EVERY-002 tags are the feeling's: added in the journal, the Feelings log has them", async () => {
  useJournalStore.getState().upsertEntry('2026-10-29', 'low', 'Tired', [], { feelingChosen: true });
  const jid = useJournalStore.getState().entries[0].id;
  const r = await renderScreen('journalWrite', JournalWriteScreen, { date: '2026-10-29' });
  await r.user.press(screen.getByRole('button', { name: 'Edit entry' }));
  await r.user.press(screen.getByLabelText('Sleep'));
  await r.user.press(screen.getByText('Save'));
  expect(feelings().find((f) => f.id === journalFeelingId(jid))?.reasonTags).toEqual(['Sleep']);
});

test('FEEL-EVERY-005 tags changed in Feelings (the same record): the journal entry shows them', async () => {
  useJournalStore.getState().upsertEntry('2026-10-29', 'low', 'Tired', [], { feelingChosen: true });
  const jid = useJournalStore.getState().entries[0].id;
  useFeelingsStore.getState().putEntry({ id: journalFeelingId(jid), zone: 'low', feelingIds: [], date: '2026-10-29', createdAt: '2026-10-29T18:00:00.000Z', source: { kind: 'journal', refId: jid } });
  useFeelingsStore.getState().updateEntry(journalFeelingId(jid), { reasonTags: ['Sleep', 'Work'] });
  await renderScreen('journalWrite', JournalWriteScreen, { date: '2026-10-29' });
  expect(await screen.findByText('Sleep · Work')).toBeTruthy();
});

test('FEEL-EVERY-003 an older entry that only shows Calm: picking what\'s behind it counts the feeling', async () => {
  useJournalStore.setState({ entries: [{ id: 'j-old', date: '2026-10-20', zone: 'calm', text: 'old', tags: [] }] } as never);
  const r = await renderScreen('journalWrite', JournalWriteScreen, { date: '2026-10-20' });
  await r.user.press(screen.getByRole('button', { name: 'Edit entry' }));
  await r.user.press(screen.getByLabelText('Family'));
  await r.user.press(screen.getByText('Save'));
  expect(feelings()).toEqual([expect.objectContaining({ id: journalFeelingId('j-old'), zone: 'calm', reasonTags: ['Family'], date: '2026-10-20' })]);
});

test('FEEL-EVERY-004 Quit\'s "Log how I feel right now" is the shared sheet, with what\'s behind it', async () => {
  useQuitHabitsStore.setState({ habits: [makeQuitHabit({ id: 'q1', name: 'Vaping' })], tracks: [makeTrack({ id: 't1', quitHabitId: 'q1', startDate: '2026-10-15' })], feelingEntries: [], slips: [], cravingSessions: [] } as never);
  const r = await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: 'q1' });
  await r.user.press(await screen.findByText('Log how I feel right now'));
  await r.user.press(await screen.findByLabelText(/^Tense:/));
  await r.user.press(screen.getByText(REASON_TAGS_LABEL));
  await r.user.press(screen.getByLabelText('Work'));
  await r.user.press(screen.getByText('Save'));
  expect(feelings()).toEqual([expect.objectContaining({ zone: 'tense', reasonTags: expect.arrayContaining(['Vaping', 'Work']), source: expect.objectContaining({ kind: 'quitHabit', refId: 'q1' }) })]);
  expect(useQuitHabitsStore.getState().feelingEntries).toHaveLength(1); // its moment on the journey too
});
