// Two phones signed in to one account, syncing through the real sync_records
// table on the local stack, using the app's own sync engine and its own
// Supabase adapter (supabaseSyncServer). IDs: docs/test-cases/backend.md
jest.mock('../../src/utils/notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));

import { EMPTY_SYNC_STATE, OtherAccountError, syncOnce, type LocalData, type OutgoingRow, type RemoteRow, type SyncServer, type SyncState } from '../../src/sync/engine';
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
      const r = await syncOnce(as.id, supabaseSyncServer(as.id, as.db, undefined, () => true), state, local, () => Date.now() + clockOffsetMs);
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

// Migration 0009: conflicts by server revision, never by a phone's clock.
test('BE-SYNC-009 a journal entry edited on two phones: the server refuses the stale write, and both versions are kept', async () => {
  const u = await subscriber();
  const a = phone(u, { 'journaling.entries': [{ id: 'j1', date: '2026-10-24', zone: 'calm', text: 'Quiet day' }] });
  await a.sync();
  const b = phone(u);
  await b.sync();
  a.data.set('journaling.entries', [{ id: 'j1', date: '2026-10-24', zone: 'calm', text: 'Quiet day, then a walk' }]);
  b.data.set('journaling.entries', [{ id: 'j1', date: '2026-10-24', zone: 'calm', text: 'Quiet day, and a call' }]);
  await a.sync();
  expect((await b.sync()).conflicts).toBe(1);
  await a.sync();
  for (const p of [a, b]) {
    const texts = ((p.data.get('journaling.entries') ?? []) as { text: string }[]).map((e) => e.text).sort();
    expect(texts).toEqual(['Quiet day, and a call', 'Quiet day, then a walk']);
  }
  const { data } = await admin().from('sync_records').select('record_id, rev').eq('user_id', u.id).order('record_id');
  expect(data).toEqual([{ record_id: 'j1', rev: 2 }, expect.objectContaining({ rev: 1 })]);
});

test('BE-SYNC-010 a delete from a phone that never saw the latest edit is refused: the edit comes back', async () => {
  const u = await subscriber();
  const a = phone(u, { 'dailyPlanning.tasks': [task('t1', 'Buy bread')] });
  await a.sync();
  const b = phone(u);
  await b.sync();
  b.data.set('dailyPlanning.tasks', [{ ...b.tasks()[0], title: 'Buy bread and milk' }]);
  await b.sync();
  a.data.set('dailyPlanning.tasks', []);
  await a.sync();
  expect(a.tasks().map((t) => t.title)).toEqual(['Buy bread and milk']);
  const { data } = await admin().from('sync_records').select('deleted').eq('user_id', u.id).eq('record_id', 't1').single();
  expect(data).toEqual({ deleted: false });
});

test("BE-SYNC-011 a phone's clock doesn't decide: the change that reaches the server last wins, even from a phone a year behind", async () => {
  const u = await subscriber();
  const ahead = phone(u, { 'dailyPlanning.tasks': [task('t1', 'Call')] }, 365 * 86_400_000);
  await ahead.sync();
  const behind = phone(u, {}, -365 * 86_400_000);
  await behind.sync();
  ahead.data.set('dailyPlanning.tasks', [{ ...ahead.tasks()[0], title: 'Call (ahead)' }]);
  behind.data.set('dailyPlanning.tasks', [{ ...behind.tasks()[0], title: 'Call (behind)' }]);
  await ahead.sync();
  await behind.sync(); // later to reach the server
  await ahead.sync();
  expect(ahead.tasks().map((t) => t.title)).toEqual(['Call (behind)']);
  expect(behind.tasks().map((t) => t.title)).toEqual(['Call (behind)']);
});

// The APK installed on the owner's phones (3f74086) predates 0009: it reads
// only the columns it knows and never sends base_rev. These are its exact
// queries (git show 3f74086:src/sync/syncController.ts).
function apk3f74086(user: TestUser): SyncServer {
  return {
    pull: async (since, limit) => {
      let q = user.db.from('sync_records').select('collection, record_id, data, deleted, client_updated_at, server_updated_at').order('server_updated_at', { ascending: true }).limit(limit);
      if (since) q = q.gt('server_updated_at', since);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as RemoteRow[];
    },
    push: async (rows: OutgoingRow[]) => {
      const { error } = await user.db.from('sync_records').upsert(rows.map(({ base_rev: _b, ...r }) => ({ ...r, user_id: user.id })), { onConflict: 'user_id,collection,record_id' });
      if (error) throw new Error(error.message);
    },
  };
}
function oldPhone(user: TestUser, initial: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(initial));
  let state: SyncState = EMPTY_SYNC_STATE;
  const local: LocalData = { read: (c) => data.get(c) ?? (c.endsWith('dayReflections') || c.endsWith('guidanceVotes') ? {} : []), write: (c, v) => void data.set(c, v) };
  return {
    data,
    tasks: () => (data.get('dailyPlanning.tasks') ?? []) as { id: string; title: string }[],
    sync: async () => {
      state = (await syncOnce(user.id, apk3f74086(user), state, local)).state;
    },
  };
}

test('BE-SYNC-012 the installed APK (3f74086, before 0009) still syncs both ways after the migration, also on rows a newer phone wrote', async () => {
  const u = await subscriber();
  const now = phone(u, { 'dailyPlanning.tasks': [task('t1', 'From the new app')] });
  await now.sync(); // written with base_rev
  const apk = oldPhone(u);
  await apk.sync();
  expect(apk.tasks().map((t) => t.title)).toEqual(['From the new app']); // download works
  apk.data.set('dailyPlanning.tasks', [{ ...apk.tasks()[0], title: 'Edited on the old APK' }, task('t2', 'New on the old APK')]);
  await apk.sync(); // upload with no base_rev, over a row the new app wrote
  const { data } = await admin().from('sync_records').select('record_id, rev, base_rev, data').eq('user_id', u.id).order('record_id');
  expect(data).toEqual([
    expect.objectContaining({ record_id: 't1', rev: 2, base_rev: null, data: expect.objectContaining({ title: 'Edited on the old APK' }) }),
    expect.objectContaining({ record_id: 't2', rev: 1, base_rev: null }),
  ]);
  await now.sync();
  expect(now.tasks().map((t) => t.title).sort()).toEqual(['Edited on the old APK', 'New on the old APK']);
  // And back: the new app edits, the old APK receives it and edits again.
  now.data.set('dailyPlanning.tasks', now.tasks().map((t) => (t.id === 't1' ? { ...t, title: 'New app again' } : t)));
  await now.sync();
  await apk.sync();
  expect(apk.tasks().find((t) => t.id === 't1')!.title).toBe('New app again');
  apk.data.set('dailyPlanning.tasks', apk.tasks().map((t) => (t.id === 't1' ? { ...t, title: 'Old APK again' } : t)));
  await apk.sync();
  await now.sync();
  expect(now.tasks().find((t) => t.id === 't1')!.title).toBe('Old APK again');
});
