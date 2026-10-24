// Conflicts between phones, resolved by server revision (migration
// 0009_sync_revisions.sql), never by a phone's clock. The fake server here
// follows the same rule as the migration: a write over a revision the phone
// never saw is refused and the server's row comes back.
// IDs: docs/test-cases/integration.md (CONF-*)
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import fc from 'fast-check';
import { EMPTY_SYNC_STATE, KEEP_BOTH, syncOnce, type LocalData, type PushedRow, type RemoteRow, type SyncServer, type SyncState } from '../../sync/engine';

function revisionServer() {
  const rows = new Map<string, RemoteRow & { rev: number }>();
  let tick = 0;
  const stamp = () => new Date(Date.UTC(2026, 9, 24, 12, 0, 0, ++tick)).toISOString();
  const server: SyncServer & { rows: typeof rows } = {
    rows,
    pull: async (since, limit) =>
      [...rows.values()]
        .filter((r) => !since || r.server_updated_at > since)
        .sort((a, b) => a.server_updated_at.localeCompare(b.server_updated_at))
        .slice(0, limit),
    push: async (batch) => {
      const back: PushedRow[] = [];
      for (const r of batch) {
        const k = `${r.collection}/${r.record_id}`;
        const old = rows.get(k);
        if (old && r.base_rev != null && r.base_rev !== old.rev) {
          back.push(old);
          continue;
        }
        const row = { collection: r.collection, record_id: r.record_id, data: r.data, deleted: r.deleted, client_updated_at: r.client_updated_at, server_updated_at: stamp(), rev: old ? old.rev + 1 : 1 };
        rows.set(k, row);
        back.push(row);
      }
      return back;
    },
  };
  return server;
}

// A phone with its own clock (which the rules must never depend on).
function phone(clockOffsetMs = 0, initial: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(initial));
  let state: SyncState = EMPTY_SYNC_STATE;
  const local: LocalData = { read: (c) => data.get(c) ?? (c.endsWith('dayReflections') || c.endsWith('guidanceVotes') ? {} : []), write: (c, v) => void data.set(c, v) };
  return {
    data,
    list: <T,>(c: string) => (data.get(c) ?? []) as T[],
    set: (c: string, v: unknown) => data.set(c, v),
    sync: async (server: SyncServer) => {
      const r = await syncOnce('u1', server, state, local, () => Date.UTC(2026, 9, 24, 12) + clockOffsetMs);
      state = r.state;
      return r;
    },
  };
}

type Task = { id: string; title: string; done?: boolean };
type Entry = { id: string; text: string; conflictCopyOf?: string };
const T = 'dailyPlanning.tasks';
const J = 'journaling.entries';
const YEAR = 365 * 86_400_000;

test('CONF-001 a task edited on two phones: the change that reaches the server last wins, whatever the phones\' clocks say', async () => {
  const server = revisionServer();
  const a = phone(+YEAR); // clock a year ahead
  const b = phone(-YEAR); // clock a year behind
  a.set(T, [{ id: 't1', title: 'Call the bank' }]);
  await a.sync(server);
  await b.sync(server);
  a.set(T, [{ id: 't1', title: 'Call the bank (A)' }]);
  b.set(T, [{ id: 't1', title: 'Call the bank (B)' }]);
  await a.sync(server); // A first
  const r = await b.sync(server); // B reaches the server last: B wins, though its clock is behind
  expect(r.conflicts).toBe(1);
  await a.sync(server);
  expect(a.list<Task>(T).map((t) => t.title)).toEqual(['Call the bank (B)']);
  expect(b.list<Task>(T).map((t) => t.title)).toEqual(['Call the bank (B)']);
  expect(server.rows.get(`${T}/t1`)!.rev).toBe(3);
});

test('CONF-002 a journal entry edited on two phones: both versions are kept, on both phones', async () => {
  const server = revisionServer();
  const a = phone();
  const b = phone();
  a.set(J, [{ id: 'j1', text: 'Quiet day' }]);
  await a.sync(server);
  await b.sync(server);
  a.set(J, [{ id: 'j1', text: 'Quiet day, then a walk' }]);
  b.set(J, [{ id: 'j1', text: 'Quiet day, and a call with Mum' }]);
  await a.sync(server);
  const r = await b.sync(server);
  expect(r.conflicts).toBe(1);
  await a.sync(server);
  for (const p of [a, b]) {
    const texts = p.list<Entry>(J).map((e) => e.text).sort();
    expect(texts).toEqual(['Quiet day, and a call with Mum', 'Quiet day, then a walk']);
    expect(p.list<Entry>(J).find((e) => e.text === 'Quiet day, and a call with Mum')!.conflictCopyOf).toBe('j1');
  }
  expect([...KEEP_BOTH].sort()).toEqual(['book.quotes', 'catchAThought.thoughts', 'journaling.entries', 'songwriting.songs']);
});

test('CONF-003 deleted on one phone, edited on the other first: the edit comes back, nothing lost', async () => {
  const server = revisionServer();
  const a = phone();
  const b = phone();
  a.set(T, [{ id: 't1', title: 'Buy bread' }]);
  await a.sync(server);
  await b.sync(server);
  b.set(T, [{ id: 't1', title: 'Buy bread and milk' }]);
  await b.sync(server);
  a.set(T, []); // deleted on A, which never saw B's edit
  await a.sync(server);
  expect(a.list<Task>(T).map((t) => t.title)).toEqual(['Buy bread and milk']);
  expect(server.rows.get(`${T}/t1`)!.deleted).toBe(false);
});

test('CONF-004 edited on one phone after the other deleted it: the edit wins over the delete', async () => {
  const server = revisionServer();
  const a = phone();
  const b = phone();
  a.set(J, [{ id: 'j1', text: 'Draft' }]);
  await a.sync(server);
  await b.sync(server);
  b.set(J, []);
  await b.sync(server); // deleted first
  a.set(J, [{ id: 'j1', text: 'Draft, finished' }]);
  await a.sync(server);
  await b.sync(server);
  expect(b.list<Entry>(J).map((e) => e.text)).toEqual(['Draft, finished']);
});

test('CONF-005 deleted on both phones: gone, no conflict left over', async () => {
  const server = revisionServer();
  const a = phone();
  const b = phone();
  a.set(T, [{ id: 't1', title: 'Old' }]);
  await a.sync(server);
  await b.sync(server);
  a.set(T, []);
  b.set(T, []);
  await a.sync(server);
  await b.sync(server);
  expect((await b.sync(server)).pushed).toBe(0);
  expect(server.rows.get(`${T}/t1`)!.deleted).toBe(true);
});

test('CONF-006 the same edit on both phones is not a conflict', async () => {
  const server = revisionServer();
  const a = phone();
  const b = phone();
  a.set(T, [{ id: 't1', title: 'X' }]);
  await a.sync(server);
  await b.sync(server);
  a.set(T, [{ id: 't1', title: 'X', done: true }]);
  b.set(T, [{ id: 't1', title: 'X', done: true }]);
  await a.sync(server);
  expect((await b.sync(server)).conflicts).toBe(0);
  expect(b.list<Task>(T)).toHaveLength(1);
});

test('CONF-007 property: two phones editing in any order end the same, and no journal words are lost', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.record({ who: fc.constantFrom<'a' | 'b'>('a', 'b'), id: fc.constantFrom('j1', 'j2', 't1'), text: fc.string({ minLength: 1, maxLength: 6 }), del: fc.boolean(), sync: fc.boolean() }), { minLength: 1, maxLength: 12 }),
      async (steps) => {
        const server = revisionServer();
        const phones = { a: phone(+YEAR), b: phone(-YEAR) };
        for (const s of steps) {
          const p = phones[s.who];
          const c = s.id.startsWith('j') ? J : T;
          const list = p.list<{ id: string; text?: string; title?: string }>(c).filter((x: { id: string }) => x.id !== s.id);
          const word = `${s.who}:${s.text}`;
          if (!s.del) {
            list.push(c === J ? { id: s.id, text: word } : { id: s.id, title: word });
          }
          p.set(c, list);
          if (s.sync) await p.sync(server);
        }
        // Everyone syncs until quiet.
        for (let i = 0; i < 3; i++) {
          await phones.a.sync(server);
          await phones.b.sync(server);
        }
        // Phone-only fields (reminder ids) aside.
        const view = (p: ReturnType<typeof phone>) => JSON.stringify([J, T].map((c) => p.list<{ id: string; notificationIds?: unknown }>(c).map(({ notificationIds: _n, ...x }) => x).sort((x, y) => x.id.localeCompare(y.id))));
        expect(view(phones.a)).toBe(view(phones.b));
        // Words are only ever replaced by a later change to the same entry
        // (on either phone): a phone's last words for an entry that nobody
        // touched afterwards are there, on both phones.
        steps.forEach((s, idx) => {
          if (!s.id.startsWith('j') || s.del) return;
          if (steps.slice(idx + 1).some((later) => later.id === s.id)) return;
          for (const p of [phones.a, phones.b]) expect(p.list<Entry>(J).map((e) => e.text)).toContain(`${s.who}:${s.text}`);
        });
      }
    ),
    { numRuns: 120 }
  );
});

test('CONF-008 a server without revisions (before migration 0009) works as before', async () => {
  const rows = new Map<string, RemoteRow>();
  const plain: SyncServer = {
    pull: async () => [...rows.values()],
    push: async (batch) => {
      for (const r of batch) rows.set(`${r.collection}/${r.record_id}`, { ...r, server_updated_at: r.client_updated_at });
    },
  };
  const a = phone();
  a.set(T, [{ id: 't1', title: 'Hello' }]);
  expect((await a.sync(plain)).pushed).toBe(1);
  expect((await a.sync(plain)).pushed).toBe(0);
});
