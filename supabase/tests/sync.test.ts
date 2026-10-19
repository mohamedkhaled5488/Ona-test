// Two phones signed in to one account, syncing through the real sync_records
// table on the local stack, using the app's own sync engine and its own
// Supabase adapter (supabaseSyncServer). IDs: docs/test-cases/backend.md
jest.mock('../../src/utils/notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));

import { EMPTY_SYNC_STATE, OtherAccountError, syncOnce, type LocalData, type SyncState } from '../../src/sync/engine';
import { supabaseSyncServer } from '../../src/sync/syncController';
import { admin, fromNow, newUser, setTrial, type TestUser } from './local';

// A phone's synced data (collection → value) and its sync bookkeeping.
function phone(user: TestUser, initial: Record<string, unknown> = {}, clockOffsetMs = 0) {
  const data = new Map<string, unknown>(Object.entries(initial));
  let state: SyncState = EMPTY_SYNC_STATE;
  const empty = (c: string) => (c.endsWith('dayReflections') || c.endsWith('guidanceVotes') ? {} : []);
  const local: LocalData = { read: (c) => data.get(c) ?? empty(c), write: (c, v) => void data.set(c, v) };
  return {
    data,
    tasks: () => (data.get('dailyPlanning.tasks') ?? []) as { id: string; title: string; done: boolean }[],
    sync: async (as: TestUser = user) => {
      const r = await syncOnce(as.id, supabaseSyncServer(as.id, as.db), state, local, () => Date.now() + clockOffsetMs);
      state = r.state;
      return r;
    },
  };
}

const task = (id: string, title: string, extra: Record<string, unknown> = {}) => ({ id, title, date: '2026-10-18', done: false, repeat: 'none', notificationIds: [`notif-${id}`], ...extra });

async function subscriber(label = 'sync') {
  const u = await newUser(label);
  await u.db.rpc('start_trial');
  return u;
}

test('BE-SYNC-001 what one phone adds arrives on the other, the same', async () => {
  const u = await subscriber();
  const a = phone(u, { 'dailyPlanning.tasks': [task('t1', 'Call the bank'), task('t2', 'Buy bread')], 'journaling.entries': [{ id: 'j1', date: '2026-10-18', zone: 'calm', text: 'Quiet day' }] });
  expect((await a.sync()).pushed).toBe(3);
  const b = phone(u);
  const r = await b.sync();
  expect(r.pulled).toBe(3);
  expect(b.tasks().map((t) => t.title)).toEqual(['Call the bank', 'Buy bread']);
  expect(b.data.get('journaling.entries')).toEqual([{ id: 'j1', date: '2026-10-18', zone: 'calm', text: 'Quiet day' }]);
});

test('BE-SYNC-002 an edit and a delete on one phone reach the other', async () => {
  const u = await subscriber();
  const a = phone(u, { 'dailyPlanning.tasks': [task('t1', 'Call the bank'), task('t2', 'Buy bread')] });
  await a.sync();
  const b = phone(u);
  await b.sync();
  b.data.set('dailyPlanning.tasks', [{ ...b.tasks().find((t) => t.id === 't1')!, title: 'Call the bank before 5', done: true }]);
  await b.sync();
  await a.sync();
  expect(a.tasks()).toEqual([expect.objectContaining({ id: 't1', title: 'Call the bank before 5', done: true })]);
  const rows = (await admin().from('sync_records').select('record_id, deleted').eq('user_id', u.id).order('record_id')).data;
  expect(rows).toEqual([{ record_id: 't1', deleted: false }, { record_id: 't2', deleted: true }]);
});

test('BE-SYNC-003 the same item edited on both phones offline: both end up with the same version', async () => {
  const u = await subscriber();
  const a = phone(u, { 'dailyPlanning.tasks': [task('t1', 'Draft')] });
  await a.sync();
  const b = phone(u);
  await b.sync();
  a.data.set('dailyPlanning.tasks', [{ ...a.tasks()[0], title: 'Edited on A' }]);
  b.data.set('dailyPlanning.tasks', [{ ...b.tasks()[0], title: 'Edited on B' }]);
  await a.sync();
  await b.sync();
  await a.sync();
  await b.sync();
  expect(a.tasks()[0].title).toBe(b.tasks()[0].title);
  const server = (await admin().from('sync_records').select('data').eq('user_id', u.id).single()).data;
  expect((server!.data as { title: string }).title).toBe(a.tasks()[0].title);
});

test('BE-SYNC-004 reminder ids scheduled on one phone never reach the server or the other phone', async () => {
  const u = await subscriber();
  await phone(u, { 'dailyPlanning.tasks': [task('t1', 'Call the bank')] }).sync();
  const rows = (await admin().from('sync_records').select('data').eq('user_id', u.id)).data;
  expect(JSON.stringify(rows)).not.toContain('notif-');
  const b = phone(u);
  await b.sync();
  expect(b.data.get('dailyPlanning.tasks')).toEqual([expect.objectContaining({ id: 't1', notificationIds: [] })]);
});

test('BE-SYNC-005 a big first sync (more than one page each way) arrives whole', async () => {
  const u = await subscriber();
  const thoughts = Array.from({ length: 620 }, (_, i) => ({ id: `th${i}`, kind: 'idea', text: `Idea ${i}`, createdAt: '2026-10-18T09:00:00.000Z' }));
  const a = phone(u, { 'catchAThought.thoughts': thoughts });
  expect((await a.sync()).pushed).toBe(620);
  const b = phone(u);
  expect((await b.sync()).pulled).toBe(620);
  expect((b.data.get('catchAThought.thoughts') as unknown[]).length).toBe(620);
});

test('BE-SYNC-006 two accounts on the server never see each other\'s records', async () => {
  const a = await subscriber('a');
  const b = await subscriber('b');
  await phone(a, { 'journaling.entries': [{ id: 'j1', date: '2026-10-18', zone: 'low', text: 'A\'s private entry' }] }).sync();
  const bPhone = phone(b);
  expect((await bPhone.sync()).pulled).toBe(0);
  expect(bPhone.data.get('journaling.entries')).toBeUndefined();
});

test('BE-SYNC-007 a phone last synced with one account refuses to sync with another', async () => {
  const a = await subscriber('a');
  const b = await subscriber('b');
  const p = phone(a, { 'dailyPlanning.tasks': [task('t1', 'Mine')] });
  await p.sync();
  await expect(p.sync(b)).rejects.toBeInstanceOf(OtherAccountError);
  expect((await admin().from('sync_records').select('record_id').eq('user_id', b.id)).data).toEqual([]);
});

test('BE-SYNC-008 when access ends, the phone gets a clear message, its data stays, and it can still pull', async () => {
  const u = await subscriber();
  const a = phone(u, { 'dailyPlanning.tasks': [task('t1', 'Call the bank')] });
  await a.sync();
  await setTrial(u.id, fromNow(-60_000));
  a.data.set('dailyPlanning.tasks', [...a.tasks(), task('t2', 'New after the trial')]);
  await expect(a.sync()).rejects.toThrow('Sync access has ended on the server.');
  expect(a.tasks().map((t) => t.id)).toEqual(['t1', 't2']);
  const b = phone(u);
  // A new phone has nothing to push: pulling still works.
  expect((await b.sync()).pulled).toBe(1);
  expect(b.tasks().map((t) => t.id)).toEqual(['t1']);
});
