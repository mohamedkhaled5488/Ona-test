// Daily Planning v2, stage 4: the feeling after (or before) a task, linked
// both ways with the Feelings log. One copy, in the Feelings log; the task
// holds the id. When to ask; editing and deleting from either side; tags
// carried along; timing with Start/Stop.
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import { useDailyPlanningStore } from '../../store/useDailyPlanningStore';
import { useFeelingsStore } from '../../store/useFeelingsStore';
import { clearTaskFeeling, deleteFeelingEntry, linkedEntry, logTaskFeeling, shouldAskFeeling, taskTagNames } from '../taskFeelings';
import { dailyTrendPoints, topReasonTags, zoneScore } from '../feelingsStats';
import { describeFeelingSource } from '../feelingSource';
import { fromRecords, toRecords } from '../../sync/records';
import { todayISO } from '../date';
import type { DailyTask } from '../../types/sections';
import { useClock, restoreClock } from '../../test-utils';

// A fixed time, so nothing here depends on the real date (see src/test-utils/time.ts).
beforeEach(() => {
  useClock('2026-10-18T12:00');
});
afterEach(() => restoreClock());

const plan = () => useDailyPlanningStore.getState();
const feelings = () => useFeelingsStore.getState();
const task = (id: string) => plan().tasks.find((t) => t.id === id)!;
const DAY = '2026-10-11';

let studyTag: string;
let taskId: string;
beforeEach(() => {
  useDailyPlanningStore.setState({ tasks: [], tags: [] });
  useFeelingsStore.setState({ entries: [] });
  studyTag = plan().addTag('Study')!;
  taskId = plan().addTask(DAY, 'Essay', { tagIds: [studyTag], priority: 'medium' })!;
});

describe('when to ask', () => {
  const base = { priority: 'none' as const, tagIds: [] as string[], estimateMinutes: undefined, durationMinutes: undefined };
  test.each([
    ['auto', base, false],
    ['auto', { ...base, priority: 'medium' as const }, true],
    ['auto', { ...base, priority: 'high' as const }, true],
    ['auto', { ...base, priority: 'low' as const }, false],
    ['auto', { ...base, tagIds: ['t'] }, true],
    ['auto', { ...base, priority: 'high' as const, estimateMinutes: 5 }, false], // never a quick task
    ['auto', { ...base, tagIds: ['t'], durationMinutes: 3 }, false],
    ['auto', { ...base, priority: 'high' as const, estimateMinutes: 15 }, true],
    ['always', { ...base, estimateMinutes: 2 }, true],
    ['tagged', { ...base, priority: 'high' as const }, false],
    ['tagged', { ...base, tagIds: ['t'] }, true],
    ['never', { ...base, priority: 'high' as const, tagIds: ['t'] }, false],
  ] as const)('%s, %j -> %s', (mode, t, ask) => expect(shouldAskFeeling({ ...t, tagIds: [...t.tagIds] }, mode)).toBe(ask));
});

describe('complete with a feeling', () => {
  test('a quick zone is saved once, in the Feelings log, with the task\'s tags and a link on the task', () => {
    const id = logTaskFeeling({ taskId, date: DAY, phase: 'after', zone: 'calm', note: 'Went smoothly' })!;
    expect(feelings().entries).toHaveLength(1);
    expect(feelings().entries[0]).toMatchObject({
      id,
      zone: 'calm',
      feelingIds: [],
      reasonTags: ['Study'],
      note: 'Went smoothly',
      source: { kind: 'task', refId: taskId, date: DAY, phase: 'after' },
    });
    expect(task(taskId).feelingLinks).toEqual({ [DAY]: { after: id } });
  });

  test('changing it again updates the same entry (no double entry)', () => {
    const id = logTaskFeeling({ taskId, date: DAY, phase: 'after', zone: 'calm' })!;
    expect(logTaskFeeling({ taskId, date: DAY, phase: 'after', zone: 'tense' })).toBe(id);
    expect(feelings().entries).toHaveLength(1);
    expect(feelings().entries[0].zone).toBe('tense');
  });

  test('"Be more specific" stores the exact word and its intensity, plus any reasons chosen there', () => {
    logTaskFeeling({ taskId, date: DAY, phase: 'after', zone: 'calm', feelingIds: ['content'], intensities: { content: 4 }, reasonTags: ['Sleep', 'Study'] });
    const e = feelings().entries[0];
    expect(e.feelingIds).toEqual(['content']);
    expect(e.intensities).toEqual({ content: 4 });
    expect(e.reasonTags).toEqual(['Study', 'Sleep']);
  });

  test('skip saves nothing', () => {
    // The sheet's Skip just closes it; nothing in either store changes.
    expect(feelings().entries).toEqual([]);
    expect(task(taskId).feelingLinks).toEqual({});
  });

  test('before and after on the same day are two linked entries', () => {
    const b = logTaskFeeling({ taskId, date: DAY, phase: 'before', zone: 'tense' })!;
    const a = logTaskFeeling({ taskId, date: DAY, phase: 'after', zone: 'calm' })!;
    expect(task(taskId).feelingLinks[DAY]).toEqual({ before: b, after: a });
    expect(describeFeelingSource(feelings().entries[0].source, { task: () => 'Essay' } as never)?.text).toBe('Before a task: Essay');
    expect(describeFeelingSource(feelings().entries[1].source, { task: () => 'Essay' } as never)?.text).toBe('After a task: Essay');
  });

  test('it shows in the Feelings graph and in reasons, under the task\'s tag', () => {
    logTaskFeeling({ taskId, date: DAY, phase: 'after', zone: 'lively' });
    const today = todayISO();
    const points = dailyTrendPoints(feelings().entries, [today]);
    expect(points).toEqual([expect.objectContaining({ date: today, score: zoneScore.lively })]);
    expect(topReasonTags(feelings().entries)).toEqual([{ tag: 'Study', count: 1 }]);
  });
});

describe('editing or deleting in either place updates the other', () => {
  test('editing in the Feelings log is what the task shows', () => {
    const id = logTaskFeeling({ taskId, date: DAY, phase: 'after', zone: 'calm' })!;
    feelings().updateEntry(id, { zone: 'low', note: 'Tired after all' });
    expect(linkedEntry(task(taskId), DAY, 'after', feelings().entries)).toMatchObject({ zone: 'low', note: 'Tired after all' });
  });

  test('deleting in the Feelings log clears the task\'s link', () => {
    const id = logTaskFeeling({ taskId, date: DAY, phase: 'after', zone: 'calm' })!;
    deleteFeelingEntry(id);
    expect(feelings().entries).toEqual([]);
    expect(task(taskId).feelingLinks).toEqual({});
    expect(linkedEntry(task(taskId), DAY, 'after', feelings().entries)).toBeUndefined();
  });

  test('removing it from the task deletes the entry', () => {
    logTaskFeeling({ taskId, date: DAY, phase: 'after', zone: 'calm' });
    clearTaskFeeling(taskId, DAY, 'after');
    expect(feelings().entries).toEqual([]);
    expect(task(taskId).feelingLinks).toEqual({});
  });

  test('undo after deleting from the log puts both back', () => {
    const id = logTaskFeeling({ taskId, date: DAY, phase: 'after', zone: 'calm' })!;
    const previous = feelings().entries;
    deleteFeelingEntry(id);
    feelings().restoreEntries(previous);
    plan().setFeelingLink(taskId, DAY, 'after', id);
    expect(linkedEntry(task(taskId), DAY, 'after', feelings().entries)?.zone).toBe('calm');
  });

  test('deleting the task keeps the feeling, labelled as from a deleted task', () => {
    logTaskFeeling({ taskId, date: DAY, phase: 'after', zone: 'calm' });
    plan().deleteTask(taskId);
    expect(feelings().entries).toHaveLength(1);
    expect(describeFeelingSource(feelings().entries[0].source, { task: () => undefined } as never)).toEqual({ text: 'From a deleted task', deleted: true });
  });

  test('a feeling logged before v2 (no link on the task) is still found', () => {
    const id = feelings().addEntry('calm', [], undefined, undefined, { kind: 'task', refId: taskId });
    const legacy = feelings().entries.find((e) => e.id === id)!;
    expect(linkedEntry(task(taskId), legacy.date, 'after', feelings().entries)?.id).toBe(id);
  });
});

describe('tags carried to the Feelings log', () => {
  test('renaming a tag renames it on feelings logged after its tasks', () => {
    logTaskFeeling({ taskId, date: DAY, phase: 'after', zone: 'calm' });
    plan().renameTag(studyTag, 'Learning');
    expect(feelings().entries[0].reasonTags).toEqual(['Learning']);
  });

  test('merging tags does the same, without duplicates', () => {
    const uni = plan().addTag('Uni')!;
    const both = plan().addTask(DAY, 'Lecture', { tagIds: [uni, studyTag] })!;
    logTaskFeeling({ taskId: both, date: DAY, phase: 'after', zone: 'calm' });
    plan().mergeTags(uni, studyTag);
    expect(feelings().entries[0].reasonTags).toEqual(['Study']);
  });

  test('deleting a tag leaves past feelings as they were', () => {
    logTaskFeeling({ taskId, date: DAY, phase: 'after', zone: 'calm' });
    plan().deleteTag(studyTag);
    expect(feelings().entries[0].reasonTags).toEqual(['Study']);
    expect(taskTagNames(task(taskId), plan().tags)).toEqual([]);
  });

  test('feelings unrelated to the task keep their tags', () => {
    feelings().addEntry('calm', [], undefined, ['Study']);
    plan().renameTag(studyTag, 'Learning');
    expect(feelings().entries[0].reasonTags).toEqual(['Study']);
  });
});

describe('Start and Stop', () => {
  const at = (iso: string) => jest.spyOn(Date, 'now').mockReturnValue(Date.parse(iso));
  afterEach(() => jest.restoreAllMocks());

  test('stopping adds the minutes to that day', () => {
    at('2026-10-11T09:00:00Z');
    plan().startTask(taskId, DAY);
    useDailyPlanningStore.setState({ tasks: plan().tasks.map((t) => (t.id === taskId ? { ...t, running: { date: DAY, startedAt: '2026-10-11T09:00:00Z' } } : t)) });
    at('2026-10-11T09:42:20Z');
    expect(plan().stopTask(taskId)).toBe(42);
    expect(task(taskId).actualMinutes).toEqual({ [DAY]: 42 });
    expect(task(taskId).running).toBeUndefined();
  });

  test('completing a running task stops its timer', () => {
    useDailyPlanningStore.setState({ tasks: plan().tasks.map((t) => (t.id === taskId ? { ...t, running: { date: DAY, startedAt: '2026-10-11T09:00:00Z' } } : t)) });
    at('2026-10-11T09:30:00Z');
    plan().toggleTask(taskId, DAY);
    expect(task(taskId).actualMinutes[DAY]).toBe(30);
    expect(task(taskId).running).toBeUndefined();
  });

  test('a timer left running overnight counts at most 12 hours', () => {
    useDailyPlanningStore.setState({ tasks: plan().tasks.map((t) => (t.id === taskId ? { ...t, running: { date: DAY, startedAt: '2026-10-11T09:00:00Z' } } : t)) });
    at('2026-10-13T09:00:00Z');
    expect(plan().stopTask(taskId)).toBe(720);
  });
});

describe('sync', () => {
  test('the link and the entry\'s source survive a round trip between devices', () => {
    const id = logTaskFeeling({ taskId, date: DAY, phase: 'after', zone: 'calm' })!;
    const tasks = fromRecords('dailyPlanning.tasks', [], toRecords('dailyPlanning.tasks', plan().tasks)) as DailyTask[];
    const entries = fromRecords('feelings.entries', [], toRecords('feelings.entries', feelings().entries));
    expect(tasks[0].feelingLinks).toEqual({ [DAY]: { after: id } });
    expect((entries as unknown as { source: unknown }[])[0].source).toEqual({ kind: 'task', refId: taskId, date: DAY, phase: 'after' });
  });
});
