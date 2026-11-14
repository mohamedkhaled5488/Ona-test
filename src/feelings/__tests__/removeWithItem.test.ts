// Found on a phone (2026-11-14): a deleted Quit habit's feelings were still in
// Feelings → Analysis. Now deleting anything a feeling was noted with deletes
// those feelings too (a Quit or Build habit, a skill, a task or one of its
// days, a book, a study session, a reflection), Undo puts them back, and
// feelings of items deleted earlier are cleaned up when the phone's data is
// complete (never mid-restore).
// IDs: docs/test-cases/integration.md (FEEL-DEL-*)
jest.mock('../../utils/notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));

import { resetAll, makeHabit, makeSkill, makeQuitHabit, makeTrack, makeTask } from '../../test-utils';
import { useFeelingsStore } from '../../store/useFeelingsStore';
import { useQuitHabitsStore } from '../../store/useQuitHabitsStore';
import { useHabitsStore } from '../../store/useHabitsStore';
import { useSkillsStore } from '../../store/useSkillsStore';
import { useDailyPlanningStore } from '../../store/useDailyPlanningStore';
import { useStudyStore } from '../../store/useStudyStore';
import { useReadingListStore } from '../../store/useReadingListStore';
import { useReflectionStore } from '../../store/useReflectionStore';
import { useJournalStore } from '../../store/useJournalStore';
import { feelingsSnapshot, removeOrphanFeelings } from '../removeWithItem';
import { sourceBreakdown, tagInsight } from '../../utils/feelingsInsights';
import type { FeelingCheckIn, FeelingSource } from '../../types/sections';

beforeEach(async () => {
  await resetAll();
});

const f = (id: string, source?: FeelingSource, date = '2026-11-10'): FeelingCheckIn => ({ id, zone: 'tense', feelingIds: [], date, createdAt: `${date}T10:00:00.000Z`, ...(source ? { source } : {}), reasonTags: source ? ['Vaping'] : undefined });
const ids = () => useFeelingsStore.getState().entries.map((e) => e.id).sort();

test('FEEL-DEL-001 deleting a Quit habit deletes its feelings everywhere (the log, Analysis\'s sources and tags); other feelings stay', () => {
  useQuitHabitsStore.setState({ habits: [makeQuitHabit({ id: 'q1', name: 'Vaping' })], tracks: [makeTrack({ id: 't1', quitHabitId: 'q1', startDate: '2026-11-01' })], feelingEntries: [], slips: [], cravingSessions: [] } as never);
  useFeelingsStore.setState({ entries: [f('a', { kind: 'quitHabit', refId: 'q1' }), f('b', { kind: 'quitHabit', refId: 'q1' }), f('mine')] } as never);
  expect(sourceBreakdown(useFeelingsStore.getState().entries).find((g) => g.group === 'quit')?.count).toBe(2);
  useQuitHabitsStore.getState().deleteQuitHabit('q1');
  expect(ids()).toEqual(['mine']);
  expect(sourceBreakdown(useFeelingsStore.getState().entries).find((g) => g.group === 'quit')).toBeUndefined();
  expect(tagInsight(useFeelingsStore.getState().entries, 'Vaping')).toBeUndefined(); // no tag card for it
});

test.each([
  ['a Build habit', 'habit', () => (useHabitsStore.setState({ habits: [makeHabit({ id: 'x' })] } as never), () => useHabitsStore.getState().deleteHabit('x'))],
  ['a skill', 'skill', () => (useSkillsStore.setState({ skills: [makeSkill({ id: 'x' })] } as never), () => useSkillsStore.getState().deleteSkill('x'))],
  ['a task', 'task', () => (useDailyPlanningStore.setState({ tasks: [makeTask({ id: 'x', date: '2026-11-10' })] } as never), () => useDailyPlanningStore.getState().deleteTask('x'))],
  ['a study session', 'study', () => (useStudyStore.setState({ sessions: [{ id: 'x', date: '2026-11-10', focusMinutes: 25 }] } as never), () => useStudyStore.getState().deleteSession('x'))],
  ['a book', 'book', () => (useReadingListStore.setState({ entries: [{ id: 'x', book: { title: 'B' }, status: 'reading' }], quotes: [], sessions: [] } as never), () => useReadingListStore.getState().removeEntry('x'))],
  ['a reflection', 'reflect', () => (useReflectionStore.setState({ sessions: [{ id: 'x', mode: 'free', title: 'Mine', status: 'done', startedAt: '2026-11-10T10:00:00.000Z', updatedAt: '2026-11-10T10:00:00.000Z', seconds: 0, position: 0, tags: [], answers: [] }] }), () => useReflectionStore.getState().deleteSession('x'))],
] as const)('FEEL-DEL-002 deleting %s deletes the feelings noted with it', (_name, kind, arrange) => {
  const del = arrange();
  useFeelingsStore.setState({ entries: [f('its', { kind, refId: 'x' }), f('other', { kind, refId: 'y' }), f('mine')] } as never);
  del();
  expect(ids()).toEqual(['mine', 'other']);
});

test('FEEL-DEL-003 a repeating task: deleting one day takes only that day\'s feelings; "this and later" keeps earlier days\'', () => {
  useDailyPlanningStore.setState({ tasks: [makeTask({ id: 'r', date: '2026-11-01', repeat: 'daily' })] } as never);
  const day = (id: string, date: string) => f(id, { kind: 'task', refId: 'r', date, phase: 'after' }, date);
  useFeelingsStore.setState({ entries: [day('d1', '2026-11-01'), day('d5', '2026-11-05'), day('d9', '2026-11-09')] } as never);
  useDailyPlanningStore.getState().deleteOccurrence('r', '2026-11-05', 'this');
  expect(ids()).toEqual(['d1', 'd9']);
  useDailyPlanningStore.getState().deleteOccurrence('r', '2026-11-09', 'future');
  expect(ids()).toEqual(['d1']);
});

test('FEEL-DEL-004 Undo puts the feelings back with the item', () => {
  useReflectionStore.setState({ sessions: [{ id: 'x', mode: 'free', title: 'Mine', status: 'done', startedAt: '2026-11-10T10:00:00.000Z', updatedAt: '2026-11-10T10:00:00.000Z', seconds: 0, position: 0, tags: [], answers: [] }] });
  useFeelingsStore.setState({ entries: [f('its', { kind: 'reflect', refId: 'x' }), f('mine')] } as never);
  const undo = feelingsSnapshot();
  useReflectionStore.getState().deleteSession('x');
  expect(ids()).toEqual(['mine']);
  undo();
  expect(ids()).toEqual(['its', 'mine']);
});

test('FEEL-DEL-005 feelings of items deleted before this (or on another phone) are cleaned up; standalone, journal and Support feelings are not touched', () => {
  useQuitHabitsStore.setState({ habits: [makeQuitHabit({ id: 'kept' })], tracks: [], feelingEntries: [], slips: [], cravingSessions: [] } as never);
  useJournalStore.setState({ entries: [] } as never);
  useFeelingsStore.setState({
    entries: [
      f('gone-quit', { kind: 'quitHabit', refId: 'deleted' }),
      f('kept-quit', { kind: 'quitHabit', refId: 'kept' }),
      f('gone-habit', { kind: 'habit', refId: 'deleted' }),
      f('standalone'),
      f('journal', { kind: 'journal', refId: 'j-not-here' }),
      f('support', { kind: 'support', refId: '' }),
    ],
  } as never);
  expect(removeOrphanFeelings()).toBe(2);
  expect(ids()).toEqual(['journal', 'kept-quit', 'standalone', 'support']);
  expect(removeOrphanFeelings()).toBe(0); // safe to run again
});

test('FEEL-DEL-006 the words: no delete promises any more that its feelings stay', () => {
  const fs = require('fs') as { readFileSync: (p: string, e: string) => string };
  for (const file of ['QuitHabitScreen', 'HabitBuilderScreen', 'SkillsScreen']) {
    const src = fs.readFileSync(`${process.cwd()}/src/screens/${file}.tsx`, 'utf8');
    expect({ file, keeps: /stay in your Feelings log/.test(src) }).toEqual({ file, keeps: false });
    expect({ file, says: /are deleted too/.test(src) }).toEqual({ file, says: true });
  }
});
