// Repair for FIX-13/14: demo items that already leaked into a user's own data
// or account are removed, on the phone and (through the next sync) from the
// account, without ever touching the user's own items or the demo itself.
// IDs: docs/audit-report.md (FIX-15)
jest.setTimeout(20_000);
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { setDataSpace } from '../dataSpace';
import { __flushForTests, __resetForTests, startAppData, switchDataSpace } from '../dataSpaceController';
import { storageKey } from '../localPersistence';
import { genId } from '../id';
import { isDemoId, withoutDemoItems } from '../demoLeftovers';
import { useDailyPlanningStore } from '../../store/useDailyPlanningStore';
import { useJournalStore } from '../../store/useJournalStore';
import { localData } from '../../sync/syncController';
import { EMPTY_SYNC_STATE, syncOnce, type OutgoingRow, type RemoteRow, type SyncServer } from '../../sync/engine';
import { makeTask } from '../../test-utils';
import { useClock, restoreClock } from '../../test-utils';

const storage = AsyncStorage as unknown as { getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void>; clear: () => Promise<void> };

beforeEach(async () => {
  await storage.clear();
  __resetForTests();
  setDataSpace('real');
  useClock('2026-10-18T12:00');
});
afterEach(() => restoreClock());

test('FIX-15a only demo ids are recognised: none of your own ids ever looks like one', () => {
  for (const prefix of ['task', 'plan', 'step', 'habit', 'thought', 'journal', 'feeling', 'quit', 'track', 'book', 'skill', 'budget', 'entry', 'id']) {
    for (let i = 0; i < 300; i++) expect(isDemoId(genId(prefix))).toBe(false);
  }
  expect(isDemoId('task-demo-178')).toBe(true);
  expect(withoutDemoItems([{ id: 'mine' }, { id: 'task-demo-1' }])).toEqual([{ id: 'mine' }]);
  const untouched = [{ id: 'a' }];
  expect(withoutDemoItems(untouched)).toBe(untouched);
  expect(withoutDemoItems({ '2026-10-18': 'a reflection' })).toEqual({ '2026-10-18': 'a reflection' });
});

test('FIX-15b at start-up, demo items saved as your own are removed and the cleaned data is saved; yours stay', async () => {
  const mine = makeTask({ id: 'mine', title: 'My own task' });
  const leaked = makeTask({ id: 'task-demo-178', title: 'Demo task' });
  await storage.setItem(storageKey('dailyPlanning', 'real'), JSON.stringify({ v: 1, state: { tasks: [mine, leaked] } }));
  await startAppData(storage as never, false);
  expect(useDailyPlanningStore.getState().tasks.map((t) => t.id)).toEqual(['mine']);
  await __flushForTests();
  expect(await storage.getItem(storageKey('dailyPlanning', 'real'))).not.toContain('task-demo-178');
});

function fakeServer(initial: RemoteRow[]) {
  const rows = new Map(initial.map((r) => [`${r.collection}/${r.record_id}`, r]));
  let tick = 0;
  const server: SyncServer & { rows: typeof rows } = {
    rows,
    pull: async (since, limit) => [...rows.values()].filter((r) => !since || r.server_updated_at > since).sort((a, b) => a.server_updated_at.localeCompare(b.server_updated_at)).slice(0, limit),
    push: async (batch: OutgoingRow[]) => {
      for (const r of batch) rows.set(`${r.collection}/${r.record_id}`, { ...r, server_updated_at: new Date(Date.UTC(2026, 9, 18, 13, 0, 0, ++tick)).toISOString() });
    },
  };
  return server;
}

test('FIX-15c a phone downloading an account with leaked demo items keeps only yours, and the next sync deletes the demo ones from the account', async () => {
  await startAppData(storage as never, false);
  const row = (id: string, title: string): RemoteRow => ({ collection: 'dailyPlanning.tasks', record_id: id, data: makeTask({ id, title }), deleted: false, client_updated_at: '2026-10-17T10:00:00.000Z', server_updated_at: `2026-10-17T10:00:00.00${id === 'mine' ? 1 : 2}Z` });
  const server = fakeServer([row('mine', 'My own task'), row('task-demo-178', 'Demo task')]);
  const first = await syncOnce('u1', server, EMPTY_SYNC_STATE, localData);
  expect(useDailyPlanningStore.getState().tasks.map((t) => t.id)).toEqual(['mine']);
  await syncOnce('u1', server, first.state, localData);
  expect(server.rows.get('dailyPlanning.tasks/task-demo-178')).toMatchObject({ deleted: true });
  expect(server.rows.get('dailyPlanning.tasks/mine')).toMatchObject({ deleted: false });
});

test('FIX-15d inside the demo, the demo\'s own items are never removed', async () => {
  await startAppData(storage as never, false);
  useJournalStore.setState({ entries: [] } as never);
  await switchDataSpace('demo', storage as never);
  const demoTasks = useDailyPlanningStore.getState().tasks.length;
  expect(demoTasks).toBeGreaterThan(5);
  await switchDataSpace('real', storage as never);
  await switchDataSpace('demo', storage as never);
  expect(useDailyPlanningStore.getState().tasks.length).toBe(demoTasks);
});
