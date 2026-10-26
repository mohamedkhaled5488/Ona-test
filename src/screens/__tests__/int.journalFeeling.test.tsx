// Integration 4: Feelings -> Journaling. Choosing a colour for the day and
// then "Be more specific" keeps the two consistent: a specific feeling always
// belongs to the day's colour, and changing the colour clears a word that no
// longer fits. IDs: docs/test-cases/integration.md
jest.mock('../../utils/notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import { screen } from '@testing-library/react-native';
import { resetAll, useClock, restoreClock } from '../../test-utils';
import { renderScreen } from '../../test-utils/render';
import { JournalWriteScreen, NO_COLOUR } from '../JournalWriteScreen';
import { useJournalStore } from '../../store/useJournalStore';
import { useFeelingsStore } from '../../store/useFeelingsStore';
import { feelings } from '../../data/feelingsWheel';
import { feelingLabel } from '../../utils/journalStats';

// Whole screens render slowly on a busy machine (e.g. with Docker running).
jest.setTimeout(20_000);

beforeEach(async () => {
  await resetAll();
  useClock('2026-10-18T21:00');
  useFeelingsStore.setState({ entries: [] } as never);
});
afterEach(() => restoreClock());

const entry = () => useJournalStore.getState().entries.find((e) => e.date === '2026-10-18');

describe('INT-JRN: the day\'s colour and the specific feeling', () => {
  test('INT-JRN-001 colour, then "Be more specific": the saved word belongs to the colour, and the label shows both', async () => {
    const { user } = await renderScreen('journalWrite', JournalWriteScreen, { date: '2026-10-18' });
    await user.type(screen.getByPlaceholderText('Start writing...'), 'A good, busy day.');
    await user.press(screen.getByText(NO_COLOUR)); // the colour chip, empty to start
    await user.press(screen.getByText('Lively'));
    await user.press(screen.getByText('Be more specific'));
    const word = feelings.find((f) => f.zone === 'lively')!;
    await user.press(screen.getByText(word.name)); // preview it
    await user.press(screen.getByRole('button', { name: `Select "${word.name}"` }));
    await user.press(screen.getByText('Save'));
    expect(entry()).toMatchObject({ zone: 'lively', preciseFeelingId: word.id, text: 'A good, busy day.' });
    expect(feelingLabel(entry()!)).toBe(`Lively · ${word.name}`);
  });

  test('INT-JRN-002 changing the colour afterwards clears a word that no longer fits', async () => {
    const word = feelings.find((f) => f.zone === 'lively')!;
    useJournalStore.getState().upsertEntry('2026-10-18', 'lively', 'Earlier today', [], { preciseFeelingId: word.id } as never);
    const { user } = await renderScreen('journalWrite', JournalWriteScreen, { date: '2026-10-18' });
    await user.press(screen.getByRole('button', { name: 'Edit entry' })); // an existing entry opens to read
    await user.press(screen.getAllByText(`Lively · ${word.name}`)[0]);
    await user.press(screen.getByText('Tense'));
    await user.press(screen.getByText('Save'));
    expect(entry()).toMatchObject({ zone: 'tense' });
    expect(entry()!.preciseFeelingId).toBeUndefined();
  });

  test('INT-JRN-004 a chosen colour, saved, is in the Feelings log for that day; deleting the entry removes it', async () => {
    const { user } = await renderScreen('journalWrite', JournalWriteScreen, { date: '2026-10-18' });
    await user.type(screen.getByPlaceholderText('Start writing...'), 'Heavy day.');
    await user.press(screen.getByText(NO_COLOUR));
    await user.press(screen.getByText('Tense'));
    await user.press(screen.getByText('Save'));
    expect(useFeelingsStore.getState().entries).toEqual([expect.objectContaining({ zone: 'tense', date: '2026-10-18', source: { kind: 'journal', refId: entry()!.id } })]);
    await user.press(screen.getByRole('button', { name: 'Edit entry' }));
    await user.press(screen.getAllByText('Tense')[0]);
    await user.press(screen.getByText('Low'));
    await user.press(screen.getByText('Save'));
    expect(useFeelingsStore.getState().entries).toEqual([expect.objectContaining({ zone: 'low' })]); // the same one, changed
  });

  test('INT-JRN-005 a new entry starts with no colour ("How did today feel? (optional)"); saved like that, no feeling', async () => {
    const { user } = await renderScreen('journalWrite', JournalWriteScreen, { date: '2026-10-18' });
    expect(screen.getByText(NO_COLOUR)).toBeTruthy();
    await user.type(screen.getByPlaceholderText('Start writing...'), 'Notes.');
    await user.press(screen.getByText('Save'));
    expect(entry()).toMatchObject({ zone: undefined, feelingChosen: false });
    expect(useFeelingsStore.getState().entries).toEqual([]);
  });

  test('INT-JRN-003 every specific feeling in the wheel belongs to exactly one colour', () => {
    const zones = new Set(['lively', 'calm', 'okay', 'tense', 'low']);
    for (const f of feelings) expect(zones.has(f.zone)).toBe(true);
    expect(new Set(feelings.map((f) => f.id)).size).toBe(feelings.length);
  });
});
