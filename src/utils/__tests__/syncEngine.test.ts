// Sync between two phones through a server that follows the same rules as
// supabase/migrations/0005_sync_records.sql (last write wins by the device's
// change time; server-stamped pull cursor).
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import { EMPTY_SYNC_STATE, OtherAccountError, syncOnce, type LocalData, type OutgoingRow, type RemoteRow, type SyncServer, type SyncState } from '../../sync/engine';
import { syncedCollections, toRecords, fromRecords, fingerprint } from '../../sync/records';
import { syncGate } from '../sync';

const USER = 'user-a';

function fakeServer() {
  const rows = new Map<string, RemoteRow>();
  let tick = 0;
  const stamp = () => new Date(Date.UTC(2026, 9, 8, 12, 0, 0, ++tick)).toISOString();
  const server: SyncServer & { rows: Map<string, RemoteRow>; pushes: OutgoingRow[][] } = {
    rows,
    pushes: [],
    pull: async (since, limit) =>
      [...rows.values()]
        .filter((r) => !since || r.server_updated_at > since)
        .sort((a, b) => a.server_updated_at.localeCompare(b.server_updated_at))
        .slice(0, limit),
    push: async (batch) => {
      server.pushes.push(batch);
      for (const r of batch) {
        const key = `${r.collection}/${r.record_id}`;
        const old = rows.get(key);
        if (old && r.client_updated_at < old.client_updated_at) continue; // older change: kept as is
        rows.set(key, { ...r, server_updated_at: stamp() });
      }
    },
  };
  return server;
}

// A phone's data: collection → value.
function phone(initial: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(initial));
  let state: SyncState = EMPTY_SYNC_STATE;
  let clock = Date.UTC(2026, 9, 8, 12);
  const local: LocalData = { read: (c) => data.get(c) ?? (c.endsWith('dayReflections') || c.endsWith('guidanceVotes') ? {} : []), write: (c, v) => void data.set(c, v) };
  return {
    data,
    get state() {
      return state;
    },
    set state(s: SyncState) {
      state = s;
    },
    sync: async (server: SyncServer, user = USER) => {
      clock += 1000;
      const r = await syncOnce(user, server, state, local, () => clock);
      state = r.state;
      return r;
    },
  };
}

const task = (id: string, title: string, extra: Record<string, unknown> = {}) => ({ id, title, date: '2026-10-08', done: false, repeat: 'none', notificationIds: [`notif-${id}`], ...extra });

describe('two phones, one account', () => {
  test('the first sync sends everything; an unchanged second sync sends nothing', async () => {
    const server = fakeServer();
    const a = phone({ 'dailyPlanning.tasks': [task('t1', 'Call the bank'), task('t2', 'Buy bread')], 'feelings.customReasonTags': ['commute'] });
    const first = await a.sync(server);
    expect(first.pushed).toBe(3);
    const second = await a.sync(server);
    expect(second).toMatchObject({ pushed: 0, pulled: 0 });
  });

  test('a new phone receives everything; reminders are left for that phone to schedule', async () => {
    const server = fakeServer();
    const a = phone({ 'dailyPlanning.tasks': [task('t1', 'Call the bank')], 'dailyPlanning.dayReflections': { '2026-10-08': 'A good day' } });
    await a.sync(server);
    const b = phone();
    const r = await b.sync(server);
    expect(r.pulled).toBe(2);
    expect(b.data.get('dailyPlanning.tasks')).toEqual([{ id: 't1', title: 'Call the bank', date: '2026-10-08', done: false, repeat: 'none', notificationIds: [] }]);
    expect(b.data.get('dailyPlanning.dayReflections')).toEqual({ '2026-10-08': 'A good day' });
    expect(r.changedCollections).toEqual(expect.arrayContaining(['dailyPlanning.tasks']));
  });

  test("this phone's reminder ids never leave it", async () => {
    const server = fakeServer();
    const a = phone({ 'dailyPlanning.tasks': [task('t1', 'Call the bank')] });
    await a.sync(server);
    expect(JSON.stringify([...server.rows.values()])).not.toContain('notif-');
  });

  test('edits and deletions travel to the other phone', async () => {
    const server = fakeServer();
    const a = phone({ 'dailyPlanning.tasks': [task('t1', 'Call the bank'), task('t2', 'Buy bread')] });
    await a.sync(server);
    const b = phone();
    await b.sync(server);

    a.data.set('dailyPlanning.tasks', [task('t1', 'Call the bank about the card', { done: true })]); // edit t1, delete t2
    await a.sync(server);
    await b.sync(server);
    expect(b.data.get('dailyPlanning.tasks')).toEqual([{ ...task('t1', 'Call the bank about the card', { done: true }), notificationIds: [] }]);
  });

  test("an item arriving from elsewhere keeps this phone's own reminder ids", async () => {
    const server = fakeServer();
    const a = phone({ 'dailyPlanning.tasks': [task('t1', 'Call the bank')] });
    await a.sync(server);
    const b = phone();
    await b.sync(server);
    b.data.set('dailyPlanning.tasks', [{ ...(b.data.get('dailyPlanning.tasks') as object[])[0], notificationIds: ['b-notif'] }]);
    const onlyIds = await b.sync(server); // reminder ids changed only: nothing to send
    expect(onlyIds.pushed).toBe(0);
    a.data.set('dailyPlanning.tasks', [task('t1', 'Call the bank today')]);
    await a.sync(server);
    await b.sync(server);
    expect(b.data.get('dailyPlanning.tasks')).toEqual([expect.objectContaining({ title: 'Call the bank today', notificationIds: ['b-notif'] })]);
  });

  test('the same item edited on both phones: each keeps the later edit, and they agree afterwards', async () => {
    const server = fakeServer();
    const a = phone({ 'dailyPlanning.tasks': [task('t1', 'Original')] });
    await a.sync(server);
    const b = phone();
    await b.sync(server);

    a.data.set('dailyPlanning.tasks', [task('t1', 'Edited on A')]);
    b.data.set('dailyPlanning.tasks', [task('t1', 'Edited on B')]);
    await a.sync(server); // A's edit reaches the server first
    await b.sync(server); // B also changed it: B keeps its own edit and sends it (made later)
    await a.sync(server);
    const title = (p: ReturnType<typeof phone>) => (p.data.get('dailyPlanning.tasks') as { title: string }[])[0].title;
    expect(title(b)).toBe('Edited on B');
    expect(title(a)).toBe('Edited on B');
  });

  test('items added on both phones are merged', async () => {
    const server = fakeServer();
    const a = phone({ 'feelings.entries': [{ id: 'f1', feelingId: 'calm' }] });
    const b = phone({ 'feelings.entries': [{ id: 'f2', feelingId: 'tired' }] });
    await a.sync(server);
    await b.sync(server);
    await a.sync(server);
    const ids = (p: ReturnType<typeof phone>) => (p.data.get('feelings.entries') as { id: string }[]).map((e) => e.id).sort();
    expect(ids(a)).toEqual(['f1', 'f2']);
    expect(ids(b)).toEqual(['f1', 'f2']);
  });

  test('an older change arriving late never overwrites a newer one on the server', async () => {
    const server = fakeServer();
    await server.push([{ collection: 'dailyPlanning.tasks', record_id: 't1', data: { id: 't1', title: 'new' }, deleted: false, client_updated_at: '2026-10-08T12:00:10.000Z' }]);
    await server.push([{ collection: 'dailyPlanning.tasks', record_id: 't1', data: { id: 't1', title: 'old' }, deleted: false, client_updated_at: '2026-10-08T12:00:05.000Z' }]);
    expect((server.rows.get('dailyPlanning.tasks/t1')!.data as { title: string }).title).toBe('new');
  });

  test('pulls in pages', async () => {
    const server = fakeServer();
    const many = Array.from({ length: 1234 }, (_, i) => ({ id: `f${i}`, feelingId: 'calm' }));
    await phone({ 'feelings.entries': many }).sync(server);
    const b = phone();
    const r = await b.sync(server);
    expect(r.pulled).toBe(1234);
    expect((b.data.get('feelings.entries') as unknown[]).length).toBe(1234);
  });
});

describe('safety', () => {
  test("a phone whose data belongs to another account won't sync it into this one", async () => {
    const server = fakeServer();
    const a = phone({ 'feelings.entries': [{ id: 'f1', feelingId: 'calm' }] });
    await a.sync(server, 'user-a');
    await expect(a.sync(server, 'user-b')).rejects.toBeInstanceOf(OtherAccountError);
    const gate = syncGate({ configured: true, signedIn: true, otherAccount: true, consentStoreData: true, syncAccess: true, paused: false, offline: false });
    expect(gate).toMatchObject({ allowed: false, reason: 'otherAccount' });
  });

  test('"Delete data on this device" then syncing downloads the account copy again; nothing is deleted on the server', async () => {
    const server = fakeServer();
    const a = phone({ 'dailyPlanning.tasks': [task('t1', 'Call the bank')], 'journaling.entries': [{ id: 'j1', text: 'Dear diary' }] });
    await a.sync(server);
    a.data.clear(); // wiped on the phone
    a.state = EMPTY_SYNC_STATE; // and the sync state reset with it
    const r = await a.sync(server);
    expect(r.pushed).toBe(0);
    expect([...server.rows.values()].every((row) => !row.deleted)).toBe(true);
    expect(a.data.get('journaling.entries')).toEqual([{ id: 'j1', text: 'Dear diary' }]);
  });

  test('a study timer running on this phone is never synced', () => {
    expect(syncedCollections().map((c) => c.key)).not.toEqual(expect.arrayContaining(['studySession.active']));
    expect(syncedCollections().map((c) => c.key)).toEqual(expect.arrayContaining(['studySession.sessions', 'journaling.entries', 'quitHabit.tracks']));
  });

  test('a failed push leaves the sync state as it was, so nothing is lost', async () => {
    const server = fakeServer();
    const a = phone({ 'feelings.entries': [{ id: 'f1', feelingId: 'calm' }] });
    const failing: SyncServer = { pull: server.pull, push: async () => Promise.reject(new Error('offline')) };
    await expect(a.sync(failing)).rejects.toThrow('offline');
    expect(a.state).toEqual(EMPTY_SYNC_STATE);
    const r = await a.sync(server);
    expect(r.pushed).toBe(1);
  });
});

describe('records', () => {
  test('lists of items become one record each; anything else is one whole record', () => {
    expect([...toRecords('feelings.entries', [{ id: 'a', x: 1 }, { id: 'b', x: 2 }]).keys()]).toEqual(['a', 'b']);
    expect([...toRecords('feelings.customReasonTags', ['commute', 'gym']).keys()]).toEqual(['_']);
    expect([...toRecords('dailyPlanning.dayReflections', {}).keys()]).toEqual([]);
    expect(fromRecords('feelings.customReasonTags', ['old'], new Map())).toEqual([]);
  });

  test('fingerprints ignore key order', () => {
    expect(fingerprint({ a: 1, b: [1, 2] })).toBe(fingerprint({ b: [1, 2], a: 1 }));
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
  });
});
