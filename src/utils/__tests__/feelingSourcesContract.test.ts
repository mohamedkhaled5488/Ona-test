// A feeling logged anywhere appears everywhere feelings are read: the
// Feelings log, the graph, Analysis and Recap, also after Ona is reopened
// and on another phone after sync. Table-driven over every source; a new
// source kind that isn't in the table fails. IDs: docs/test-cases/integration.md (FEEL-SRC-*)
jest.setTimeout(30_000);
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { setDataSpace } from '../dataSpace';
import { __flushForTests, __resetForTests, startAppData } from '../dataSpaceController';
import { useFeelingsStore } from '../../store/useFeelingsStore';
import { useHabitsStore } from '../../store/useHabitsStore';
import { useSkillsStore } from '../../store/useSkillsStore';
import { useQuitHabitsStore } from '../../store/useQuitHabitsStore';
import { useDailyPlanningStore } from '../../store/useDailyPlanningStore';
import { logItemFeeling } from '../itemFeelings';
import { logTaskFeeling } from '../taskFeelings';
import { dailyTrendPoints, datesInRange, zoneCounts } from '../feelingsStats';
import { filterBySource, overviewInsight, sourceBreakdown } from '../feelingsInsights';
import { periodStats } from '../recapStats';
import { localData } from '../../sync/syncController';
import { EMPTY_SYNC_STATE, syncOnce, type OutgoingRow, type RemoteRow, type SyncServer } from '../../sync/engine';
import { makeHabit, makeSkill, makeQuitHabit, makeTrack, makeTask, useClock, restoreClock } from '../../test-utils';
import type { FeelingSource } from '../../types/sections';

const storage = AsyncStorage as unknown as { clear: () => Promise<void> };
const TODAY = '2026-10-24';

// Every way a feeling is saved, through the same function the screen uses.
type Case = { name: string; kind: FeelingSource['kind'] | 'standalone'; log: () => string | undefined };
const CASES: Case[] = [
  { name: 'Identify the Feeling (standalone)', kind: 'standalone', log: () => useFeelingsStore.getState().addEntry('calm', ['calm-content'], undefined, ['tea'], undefined) },
  { name: 'Daily Planning task', kind: 'task', log: () => logTaskFeeling({ taskId: 'task-1', date: TODAY, phase: 'after', zone: 'lively', feelingIds: [] }) },
  { name: 'Habit check-in', kind: 'habit', log: () => logItemFeeling({ source: { kind: 'habit', refId: 'habit-1' }, zone: 'calm' }) },
  { name: 'Skill practice', kind: 'skill', log: () => logItemFeeling({ source: { kind: 'skill', refId: 'skill-1' }, zone: 'lively', feelingIds: [] }) },
  { name: 'Quit moment', kind: 'quitHabit', log: () => logItemFeeling({ source: { kind: 'quitHabit', refId: 'quit-1', trackId: 'track-1' }, zone: 'tense' }) },
  { name: 'Study session', kind: 'study', log: () => useFeelingsStore.getState().addEntry('okay', [], undefined, undefined, { kind: 'study', refId: 'study-1' }) },
  { name: 'Book', kind: 'book', log: () => useFeelingsStore.getState().addEntry('low', [], undefined, undefined, { kind: 'book', refId: 'book-1' }) },
];

async function freshPhone() {
  await storage.clear();
  __resetForTests();
  setDataSpace('real');
  await startAppData(storage as never, false);
  useHabitsStore.setState({ habits: [makeHabit({ id: 'habit-1', name: 'Walk' })] } as never);
  useSkillsStore.setState({ skills: [makeSkill({ id: 'skill-1', name: 'Guitar' })] } as never);
  useQuitHabitsStore.setState({ habits: [makeQuitHabit({ id: 'quit-1', name: 'Scrolling' })], tracks: [makeTrack({ id: 'track-1', quitHabitId: 'quit-1', startDate: '2026-10-01' })] } as never);
  useDailyPlanningStore.setState({ tasks: [makeTask({ id: 'task-1', date: TODAY, title: 'Call the bank' })] } as never);
}

beforeEach(() => useClock(`${TODAY}T10:00`));
afterEach(() => restoreClock());

test('FEEL-SRC-000 the table covers every kind of source a feeling can have', () => {
  const kinds: FeelingSource['kind'][] = ['habit', 'quitHabit', 'skill', 'study', 'task', 'book'];
  expect(CASES.map((c) => c.kind).filter((k) => k !== 'standalone').sort()).toEqual([...kinds].sort());
});

describe.each(CASES)('FEEL-SRC: a feeling from $name', ({ kind, log }) => {
  test('is in the log, the graph, Analysis and Recap', async () => {
    await freshPhone();
    const id = log();
    expect(id).toBeTruthy();
    const entries = useFeelingsStore.getState().entries;
    const entry = entries.find((e) => e.id === id)!;
    expect(entry).toBeDefined();
    expect(kind === 'standalone' ? entry.source : entry.source?.kind).toBe(kind === 'standalone' ? undefined : kind);
    // Graph: today's point exists.
    expect(dailyTrendPoints(entries, datesInRange(TODAY, TODAY)).map((p) => p.zone)).toEqual([entry.zone]);
    expect(zoneCounts(entries)[entry.zone]).toBe(1);
    // Analysis: counted under "All" and under its own group.
    expect(overviewInsight(filterBySource(entries, 'all'), () => undefined)).toBeTruthy();
    const groups = sourceBreakdown(entries);
    expect(groups.find((g) => g.group === 'all')?.count).toBe(1);
    expect(groups.filter((g) => g.group !== 'all').map((g) => g.count)).toEqual([1]);
    // Recap: one feeling named this week.
    // Every other section empty.
    const data = new Proxy({ feelingCheckIns: entries } as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : []) });
    const stats = periodStats(data as never, { start: '2026-10-18', end: TODAY } as never);
    expect(stats.feelingsLogged).toBe(1);
  });

  test('is still there after Ona is reopened, and on another phone after sync', async () => {
    await freshPhone();
    const id = log()!;
    await __flushForTests();
    __resetForTests();
    useFeelingsStore.setState({ entries: [] } as never);
    await startAppData(storage as never, false);
    expect(useFeelingsStore.getState().entries.map((e) => e.id)).toContain(id);

    const rows = new Map<string, RemoteRow>();
    let n = 0;
    const server: SyncServer = {
      pull: async (since, limit) => [...rows.values()].filter((r) => !since || r.server_updated_at > since).slice(0, limit),
      push: async (batch: OutgoingRow[]) => batch.forEach((r) => rows.set(`${r.collection}/${r.record_id}`, { ...r, server_updated_at: `2026-10-24T10:00:00.${String(++n).padStart(3, '0')}Z` })),
    };
    await syncOnce('u1', server, EMPTY_SYNC_STATE, localData);
    await freshPhone();
    useFeelingsStore.setState({ entries: [] } as never);
    await syncOnce('u1', server, EMPTY_SYNC_STATE, localData);
    expect(useFeelingsStore.getState().entries.map((e) => e.id)).toContain(id);
  });
});
