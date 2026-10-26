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
import { logFeeling } from '../../feelings/logFeeling';
import { useJournalStore } from '../../store/useJournalStore';
import { journalFeelingId, syncJournalFeeling } from '../../feelings/fromSections';
import { dailyTrendPoints, datesInRange, zoneCounts } from '../feelingsStats';
import { filterBySource, overviewInsight, sourceBreakdown } from '../feelingsInsights';
import { periodStats } from '../recapStats';
import { localData } from '../../sync/syncController';
import { EMPTY_SYNC_STATE, syncOnce, type OutgoingRow, type RemoteRow, type SyncServer } from '../../sync/engine';
import { makeHabit, makeSkill, makeQuitHabit, makeTrack, makeTask, useClock, restoreClock } from '../../test-utils';
import { FEELING_SOURCE_KINDS } from '../../types/sections';

const storage = AsyncStorage as unknown as { clear: () => Promise<void> };
const TODAY = '2026-10-24';

// Every source, saved the way every screen saves: logFeeling(). Typed by
// FEELING_SOURCE_KINDS, so a new kind of source doesn't compile until it's here.
type Case = { name: string; log: () => string | undefined };
const BY_KIND: Record<(typeof FEELING_SOURCE_KINDS)[number] | 'standalone', Case> = {
  standalone: { name: 'Identify the Feeling (standalone)', log: () => logFeeling({ zone: 'calm', feelingIds: ['calm-content'], tags: ['tea'] }) },
  task: { name: 'Daily Planning task', log: () => logFeeling({ source: { kind: 'task', refId: 'task-1', date: TODAY, phase: 'after' }, zone: 'lively' }) },
  habit: { name: 'Habit check-in', log: () => logFeeling({ source: { kind: 'habit', refId: 'habit-1' }, zone: 'calm' }) },
  skill: { name: 'Skill practice', log: () => logFeeling({ source: { kind: 'skill', refId: 'skill-1' }, zone: 'lively' }) },
  quitHabit: { name: 'Quit moment', log: () => logFeeling({ source: { kind: 'quitHabit', refId: 'quit-1', trackId: 'track-1' }, zone: 'tense' }) },
  study: { name: 'Study session', log: () => logFeeling({ source: { kind: 'study', refId: 'study-1' }, zone: 'okay' }) },
  book: { name: 'Book', log: () => logFeeling({ source: { kind: 'book', refId: 'book-1' }, zone: 'low', note: 'A slow chapter' }) },
  // The journal keeps its own colour too; a chosen one is in the Feelings log.
  journal: {
    name: 'Journal entry',
    log: () => {
      useJournalStore.getState().upsertEntry(TODAY, 'lively', 'A good day', [], { feelingChosen: true });
      const id = useJournalStore.getState().entries.find((e) => e.date === TODAY)!.id;
      syncJournalFeeling(id);
      return journalFeelingId(id);
    },
  },
};
const CASES = (Object.entries(BY_KIND) as [string, Case][]).map(([kind, c]) => ({ ...c, kind }));

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
  expect(CASES.map((c) => c.kind).filter((k) => k !== 'standalone').sort()).toEqual([...FEELING_SOURCE_KINDS].sort());
});

test('FEEL-SRC-001 every screen saves feelings through logFeeling(), never around it', () => {
  const fs = require('fs') as { readFileSync: (p: string, e: string) => string; readdirSync: (p: string, o: { withFileTypes: true }) => { name: string; isDirectory: () => boolean }[] };
  const path = require('path') as { join: (...p: string[]) => string; relative: (a: string, b: string) => string };
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === '__tests__' ? [] : walk(path.join(d, e.name))) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []));
  const offenders = [...walk(path.join(process.cwd(), 'src/screens')), ...walk(path.join(process.cwd(), 'src/components'))]
    // Importing the low-level helpers, or the Feelings store's own save.
    .filter((f) => /import \{[^}]*\b(logItemFeeling|logTaskFeeling)\b|useFeelingsStore\(\(\w+\) => \w+\.addEntry\)|useFeelingsStore\.getState\(\)\.addEntry/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(process.cwd(), f));
  expect(offenders).toEqual([]);
});

test('FEEL-SRC-002 the first feeling already shows in Analysis, saying what it is based on', () => {
  useFeelingsStore.setState({ entries: [] } as never);
  logFeeling({ zone: 'calm' });
  const insight = overviewInsight(useFeelingsStore.getState().entries, () => undefined);
  expect(insight).toBeTruthy();
  expect(JSON.stringify(insight)).toMatch(/\b1\b/);
});

test('FEEL-SRC-003 feelings never reach analytics', () => {
  const { ALLOWED_EVENTS } = require('../analytics') as { ALLOWED_EVENTS: readonly string[] };
  expect(ALLOWED_EVENTS.filter((e) => /feel|zone|tag|mood|journal/i.test(e))).toEqual([]);
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
