jest.mock('../notifications', () => ({
  cancelReminders: jest.fn(async () => {}),
  scheduleReminder: jest.fn(async () => undefined),
}));

import { useDailyPlanningStore } from '../../store/useDailyPlanningStore';
import { useReadingListStore } from '../../store/useReadingListStore';
import { useFeelingsStore } from '../../store/useFeelingsStore';
import { describeFeelingSource, type FeelingSourceLookup } from '../feelingSource';
import { todayISO } from '../date';
import { useClock, restoreClock } from '../../test-utils';

// A fixed time, so nothing here depends on the real date (see src/test-utils/time.ts).
beforeEach(() => {
  useClock('2026-10-18T12:00');
});
afterEach(() => restoreClock());

// Mirrors useFeelingSourceLookup, read from the stores directly (no React).
function lookup(): FeelingSourceLookup {
  const tasks = useDailyPlanningStore.getState().tasks;
  const books = useReadingListStore.getState().entries;
  return {
    task: (id) => {
      const t = tasks.find((x) => x.id === id);
      return t ? t.title || '' : undefined;
    },
    book: (id) => books.find((x) => x.id === id)?.book.title,
    habit: () => undefined,
    journal: () => undefined,
    quitHabit: () => undefined,
    skill: () => undefined,
    study: () => undefined,
  };
}

function newTask(title: string): string {
  useDailyPlanningStore.getState().addTask(todayISO(), title);
  const tasks = useDailyPlanningStore.getState().tasks;
  return tasks[tasks.length - 1].id;
}

describe('feelings from tasks and books', () => {
  it('saves a task feeling with the task as its source', () => {
    const taskId = newTask('Write the report');
    const id = useFeelingsStore.getState().addEntry('calm', [], undefined, undefined, { kind: 'task', refId: taskId });
    const entry = useFeelingsStore.getState().entries.find((e) => e.id === id)!;
    expect(entry.source).toEqual({ kind: 'task', refId: taskId });
    expect(describeFeelingSource(entry.source, lookup())).toEqual({ text: 'After a task: Write the report', deleted: false });
  });

  it('saves a book feeling with the book as its source', () => {
    const bookId = useReadingListStore.getState().addManualBook('Middlemarch', 'George Eliot', 'reading', 880);
    const id = useFeelingsStore.getState().addEntry('lively', [], undefined, undefined, { kind: 'book', refId: bookId });
    const entry = useFeelingsStore.getState().entries.find((e) => e.id === id)!;
    expect(describeFeelingSource(entry.source, lookup())?.text).toBe('After reading: Middlemarch');
  });

  it('records nothing when the prompt is ignored', () => {
    const before = useFeelingsStore.getState().entries.length;
    const taskId = newTask('Ignored prompt');
    useDailyPlanningStore.getState().toggleTask(taskId, todayISO());
    const bookId = useReadingListStore.getState().addManualBook('Quiet book', '', 'reading', 100);
    useReadingListStore.getState().addSession(bookId, 25, { startPage: 1, endPage: 20 });
    expect(useFeelingsStore.getState().entries.length).toBe(before);
  });

  it('keeps the entry when the task or book is deleted', () => {
    const taskId = newTask('Soon gone');
    const bookId = useReadingListStore.getState().addManualBook('Also gone', '', 'reading');
    const taskFeeling = useFeelingsStore.getState().addEntry('tense', [], undefined, undefined, { kind: 'task', refId: taskId });
    const bookFeeling = useFeelingsStore.getState().addEntry('low', [], undefined, undefined, { kind: 'book', refId: bookId });

    useDailyPlanningStore.getState().deleteTask(taskId);
    useReadingListStore.getState().removeEntry(bookId);

    const entries = useFeelingsStore.getState().entries;
    const t = entries.find((e) => e.id === taskFeeling)!;
    const b = entries.find((e) => e.id === bookFeeling)!;
    expect(t).toBeDefined();
    expect(b).toBeDefined();
    expect(describeFeelingSource(t.source, lookup())).toEqual({ text: 'From a deleted task', deleted: true });
    expect(describeFeelingSource(b.source, lookup())).toEqual({ text: 'From a deleted book', deleted: true });
  });

  it('labels plain check-ins with no source as nothing', () => {
    expect(describeFeelingSource(undefined, lookup())).toBeUndefined();
  });
});
