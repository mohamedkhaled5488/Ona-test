// Catch a Feeling or Idea, as a person uses it: capture, filter, open, promote
// to a plan or the journal, delete with a confirmation, the unsaved-changes
// prompt, long and Arabic text, and that it survives a relaunch.
// IDs: docs/test-cases/catch-a-thought.md
jest.mock('../../utils/notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import { screen } from '@testing-library/react-native';
import { resetAll, useClock, restoreClock } from '../../test-utils';
import { renderScreen } from '../../test-utils/render';
import { CatchAThoughtScreen } from '../CatchAThoughtScreen';
import { useThoughtsStore } from '../../store/useThoughtsStore';
import { useJournalStore } from '../../store/useJournalStore';
import { usePlanStore } from '../../store/usePlanStore';
import { startAppData, __flushForTests } from '../../utils/dataSpaceController';
import { hydrateLocalData } from '../../utils/localPersistence';

// Whole screens render slowly on a busy machine (e.g. with Docker running).
jest.setTimeout(20_000);

beforeEach(async () => {
  await resetAll();
  useClock('2026-10-18T12:00');
});
afterEach(() => restoreClock());

type User = Awaited<ReturnType<typeof renderScreen>>['user'];
async function capture(user: User, text: string, kind?: 'Feeling' | 'Random Thought') {
  await user.press(screen.getByRole('button', { name: 'Catch something' }));
  if (kind) await user.press(screen.getAllByText(` ${kind}`)[0]);
  await user.type(screen.getByPlaceholderText('Type it out...'), text);
  await user.press(screen.getByRole('button', { name: 'Save' }));
}

describe('CAT-C: Catch a Feeling or Idea', () => {
  test('CAT-C-001 empty state, then a captured idea shows in the list', async () => {
    const { user } = await renderScreen('catchAThought', CatchAThoughtScreen);
    expect(screen.getByText('Nothing caught yet.')).toBeTruthy();
    await capture(user, 'Start a reading club');
    expect(screen.getByText('Start a reading club')).toBeTruthy();
    expect(useThoughtsStore.getState().thoughts[0]).toMatchObject({ kind: 'idea', text: 'Start a reading club' });
  });

  test('CAT-C-002 filters show only that kind', async () => {
    useThoughtsStore.getState().addThought('idea', 'An idea');
    useThoughtsStore.getState().addThought('feeling', 'A feeling');
    const { user } = await renderScreen('catchAThought', CatchAThoughtScreen);
    await user.press(screen.getByRole('radio', { name: 'Feeling' }));
    expect(screen.getByRole('radio', { name: 'Feeling' })).toBeSelected();
    expect(screen.getByText('A feeling')).toBeTruthy();
    expect(screen.queryByText('An idea')).toBeNull();
  });

  test('CAT-C-003 a blank capture saves nothing', async () => {
    const { user } = await renderScreen('catchAThought', CatchAThoughtScreen);
    await capture(user, '   ');
    expect(useThoughtsStore.getState().thoughts).toEqual([]);
  });

  test('CAT-C-004 closing with unsaved text asks first: Discard drops it, Save keeps it', async () => {
    const { user } = await renderScreen('catchAThought', CatchAThoughtScreen);
    await user.press(screen.getByRole('button', { name: 'Catch something' }));
    await user.type(screen.getByPlaceholderText('Type it out...'), 'Half a thought');
    await user.press(screen.getAllByRole('button', { name: 'Close' })[1]); // the sheet's close button
    expect(screen.getByText('Save your changes before leaving?')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Discard' }));
    expect(useThoughtsStore.getState().thoughts).toEqual([]);

    await user.press(screen.getByRole('button', { name: 'Catch something' }));
    await user.type(screen.getByPlaceholderText('Type it out...'), 'Keep this one');
    await user.press(screen.getAllByRole('button', { name: 'Close' })[1]);
    const saves = screen.getAllByRole('button', { name: 'Save' });
    await user.press(saves[saves.length - 1]); // the dialog's Save
    expect(useThoughtsStore.getState().thoughts.map((t) => t.text)).toEqual(['Keep this one']);
  });

  test('CAT-C-005 promote to a plan: a plan is created and opened, and the thought says so', async () => {
    useThoughtsStore.getState().addThought('idea', 'Learn to sail');
    const { user } = await renderScreen('catchAThought', CatchAThoughtScreen);
    await user.press(screen.getByText('Learn to sail'));
    await user.press(screen.getByRole('button', { name: 'Promote to Plan' }));
    const plan = usePlanStore.getState().plans.find((p) => p.title === 'Learn to sail');
    expect(plan).toBeDefined();
    expect(await screen.findByText(`Opened: planDetail {"planId":"${plan!.id}"}`)).toBeTruthy();
    expect(useThoughtsStore.getState().thoughts[0].promotedTo).toBe('plan');
  });

  test('CAT-C-006 add to the journal: appended to today\'s entry, or a new one with a neutral colour (not "Tense")', async () => {
    useThoughtsStore.getState().addThought('random', 'The light at 5pm was lovely');
    const { user } = await renderScreen('catchAThought', CatchAThoughtScreen);
    await user.press(screen.getByText('The light at 5pm was lovely'));
    await user.press(screen.getByRole('button', { name: 'Add to Journal' }));
    const entry = useJournalStore.getState().entries.find((e) => e.date === '2026-10-18')!;
    expect(entry.text).toBe('The light at 5pm was lovely');
    expect(entry.zone).toBe('okay');
    expect(screen.getByText("Added to today's journal entry")).toBeTruthy();
  });

  test('CAT-C-007 adding to an existing journal entry keeps its colour and text', () => {
    useJournalStore.getState().upsertEntry('2026-10-18', 'lively', 'Good day.', []);
    useThoughtsStore.getState().addThought('idea', 'Call grandma');
    const id = useThoughtsStore.getState().thoughts[0].id;
    useThoughtsStore.getState().promoteToJournal(id);
    expect(useJournalStore.getState().entries.find((e) => e.date === '2026-10-18')).toMatchObject({ zone: 'lively', text: 'Good day.\n\nCall grandma' });
  });

  test('CAT-C-008 delete asks first', async () => {
    useThoughtsStore.getState().addThought('feeling', 'Nervous about Monday');
    const { user } = await renderScreen('catchAThought', CatchAThoughtScreen);
    await user.press(screen.getByText('Nervous about Monday'));
    await user.press(screen.getByRole('button', { name: 'Delete' }));
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(useThoughtsStore.getState().thoughts).toHaveLength(1);
    await user.press(screen.getByText('Nervous about Monday'));
    await user.press(screen.getByRole('button', { name: 'Delete' }));
    const confirm = screen.getAllByRole('button', { name: 'Delete' });
    await user.press(confirm[confirm.length - 1]);
    expect(useThoughtsStore.getState().thoughts).toHaveLength(0);
  });

  test('CAT-C-009 Arabic, emoji and very long pasted text are kept exactly', async () => {
    const text = '😊 فكرة جديدة: ' + 'نادي قراءة كل أسبوع. '.repeat(30);
    const { user } = await renderScreen('catchAThought', CatchAThoughtScreen);
    // Pasted, the way long text usually arrives (typing 600 characters one by one is slow).
    await user.press(screen.getByRole('button', { name: 'Catch something' }));
    await user.paste(screen.getByPlaceholderText('Type it out...'), text);
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(useThoughtsStore.getState().thoughts[0].text).toBe(text.trim());
  });

  test('CAT-C-010 captures survive closing and reopening the app', async () => {
    await startAppData(undefined, false);
    useThoughtsStore.getState().addThought('idea', 'Keep me');
    await __flushForTests();
    useThoughtsStore.setState({ thoughts: [] });
    await hydrateLocalData(undefined, false);
    expect(useThoughtsStore.getState().thoughts.map((t) => t.text)).toEqual(['Keep me']);
  });
});
