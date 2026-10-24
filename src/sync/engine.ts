// One sync pass: pull what changed on the server, merge it in, then push what
// changed here. Pure apart from the server and local-data adapters passed in,
// so the whole behaviour is tested without a network.
//
// How changes are noticed: after each sync we remember a fingerprint of every
// record as the server has it. A record whose fingerprint differs now was
// changed on this phone; one that's missing was deleted here.
//
// Conflicts (design 3.5): never by the phone's clock. The server counts a
// revision per record; every push says which revision this phone last saw
// (base_rev), and the server refuses a write over a version this phone never
// saw, sending its own back instead. Then, here:
// - journal entries, thoughts, quotes and songs: both are kept (the server's
//   under the id, this phone's as a copy beside it);
// - anything else: the change that reached the server last wins (this
//   phone's, sent again over the server's revision);
// - a delete never wins over an edit it didn't see (the edit comes back);
//   an edit wins over a delete (nothing is lost).
// A server without revisions (or a test fake) accepts everything, as before.
import { fingerprint, fromRecords, syncedCollections, toRecords } from './records';

export interface RemoteRow {
  collection: string;
  record_id: string;
  data: unknown;
  deleted: boolean;
  client_updated_at: string;
  server_updated_at: string;
  rev?: number;
}

export interface OutgoingRow {
  collection: string;
  record_id: string;
  data: unknown;
  deleted: boolean;
  client_updated_at: string;
  base_rev?: number; // the revision this phone last saw; 0: never seen (new)
}

// What the server holds after a push, per row (its revision, and its data
// when it refused this phone's version). Nothing: accepted as sent.
export interface PushedRow {
  collection: string;
  record_id: string;
  rev?: number;
  data?: unknown;
  deleted?: boolean;
}

export interface SyncServer {
  pull: (since: string | null, limit: number) => Promise<RemoteRow[]>;
  push: (rows: OutgoingRow[]) => Promise<void | PushedRow[]>;
}

export interface LocalData {
  read: (collection: string) => unknown;
  write: (collection: string, value: unknown) => void;
}

export interface SyncState {
  owner: string | null; // the account this phone's data last synced with
  cursor: string | null; // latest server_updated_at seen
  fingerprints: Record<string, Record<string, string>>; // collection → record id → fingerprint
  revs?: Record<string, Record<string, number>>; // collection → record id → server revision last seen
}

export const EMPTY_SYNC_STATE: SyncState = { owner: null, cursor: null, fingerprints: {}, revs: {} };

export class OtherAccountError extends Error {
  constructor() {
    super("This phone's data was last synced with a different account.");
  }
}

export interface SyncResult {
  state: SyncState;
  pulled: number; // remote changes applied here
  pushed: number; // local changes sent
  changedCollections: string[]; // collections rewritten from the server
  conflicts: number; // edits made on two phones, resolved (nothing lost)
}

// Both versions are kept when two phones changed one of these: they're
// someone's own words.
export const KEEP_BOTH = new Set(['journaling.entries', 'catchAThought.thoughts', 'book.quotes', 'songwriting.songs']);

// The copy's id: the original's, plus when it was made (never "-demo-").
export const conflictCopyId = (id: string, now: number) => `${id}-v${now.toString(36)}`;

const PAGE = 500;
const PUSH_BATCH = 200;
const key = (c: string, id: string) => `${c}\u0000${id}`;

// `upload: false` (no trial or subscription): only pull. The state then
// remembers only what the server has, so this phone's own changes are still
// sent once sync access is back.
export async function syncOnce(userId: string, server: SyncServer, start: SyncState, local: LocalData, now: () => number = Date.now, opts: { upload?: boolean } = {}): Promise<SyncResult> {
  if (start.owner && start.owner !== userId) throw new OtherAccountError();
  const known: SyncState['fingerprints'] = Object.fromEntries(Object.entries(start.fingerprints).map(([c, m]) => [c, { ...m }]));
  const revs: NonNullable<SyncState['revs']> = Object.fromEntries(Object.entries(start.revs ?? {}).map(([c, m]) => [c, { ...m }]));
  const collections = syncedCollections().map((c) => c.key);
  const isSynced = new Set(collections);

  // Current records on this phone, per collection.
  const localRecords = new Map<string, Map<string, unknown>>();
  for (const c of collections) localRecords.set(c, toRecords(c, local.read(c)));

  // --- 1. Pull ---
  let cursor = start.cursor;
  let pulled = 0;
  const touched = new Set<string>();
  for (;;) {
    const rows = await server.pull(cursor, PAGE);
    for (const row of rows) {
      if (row.server_updated_at > (cursor ?? '')) cursor = row.server_updated_at;
      if (!isSynced.has(row.collection)) continue; // from a newer app version
      const records = localRecords.get(row.collection)!;
      const fps = (known[row.collection] ??= {});
      const lastKnown = fps[row.record_id];
      const here = records.get(row.record_id);
      const hereFp = here === undefined ? undefined : fingerprint(here);
      const changedHere = hereFp !== lastKnown;
      // Changed here too (or created on both with the same id): left for the
      // push, which the server answers with its version if it's newer than
      // the one this phone saw. So this phone's revision stays the old one.
      if (changedHere && (lastKnown !== undefined || here !== undefined)) continue;
      if (row.rev !== undefined) (revs[row.collection] ??= {})[row.record_id] = row.rev;
      if (row.deleted) {
        if (here !== undefined) {
          records.delete(row.record_id);
          touched.add(row.collection);
          pulled++;
        }
        delete fps[row.record_id];
      } else {
        const fp = fingerprint(row.data);
        if (hereFp !== fp) {
          records.set(row.record_id, row.data);
          touched.add(row.collection);
          pulled++;
        }
        fps[row.record_id] = fp;
      }
    }
    if (rows.length < PAGE) break;
  }
  // What came down is on the phone before anything is sent (a failed push
  // doesn't undo it).
  for (const c of touched) local.write(c, fromRecords(c, local.read(c), localRecords.get(c)!));
  const changed = new Set(touched);
  touched.clear();
  if (opts.upload === false) return { state: { owner: userId, cursor, fingerprints: known, revs }, pulled, pushed: 0, changedCollections: [...changed], conflicts: 0 };

  // --- 2. Push ---
  const at = new Date(now()).toISOString();
  const outgoing: OutgoingRow[] = [];
  const after: SyncState['fingerprints'] = {};
  const baseOf = (c: string, id: string) => revs[c]?.[id] ?? 0;
  for (const c of collections) {
    const records = localRecords.get(c)!;
    const fps = known[c] ?? {};
    const next: Record<string, string> = {};
    for (const [id, data] of records) {
      const fp = fingerprint(data);
      if (fps[id] !== fp) outgoing.push({ collection: c, record_id: id, data, deleted: false, client_updated_at: at, base_rev: baseOf(c, id) });
      else next[id] = fp;
    }
    for (const id of Object.keys(fps)) {
      if (!records.has(id)) outgoing.push({ collection: c, record_id: id, data: null, deleted: true, client_updated_at: at, base_rev: baseOf(c, id) });
    }
    after[c] = next;
  }

  let pushed = 0;
  let conflicts = 0;
  const accept = (row: OutgoingRow, rev: number | undefined) => {
    if (rev !== undefined) (revs[row.collection] ??= {})[row.record_id] = rev;
    if (row.deleted) delete after[row.collection]?.[row.record_id];
    else (after[row.collection] ??= {})[row.record_id] = fingerprint(row.data);
  };
  // Sends rows; returns the ones the server refused, with its version.
  const send = async (rows: OutgoingRow[]) => {
    const refused: { row: OutgoingRow; server: PushedRow }[] = [];
    for (let i = 0; i < rows.length; i += PUSH_BATCH) {
      const batch = rows.slice(i, i + PUSH_BATCH);
      const result = await server.push(batch);
      const byKey = new Map((result ?? []).map((r) => [key(r.collection, r.record_id), r]));
      for (const row of batch) {
        pushed++;
        const back = byKey.get(key(row.collection, row.record_id));
        // What the server holds now is what was sent: accepted (or it already
        // had exactly this). Anything else: it refused, and that's its version.
        // (Revision numbers alone can't tell: a refused row's revision may
        // happen to be base_rev + 1.)
        const same = !!back && !!back.deleted === row.deleted && (row.deleted || fingerprint(back.data) === fingerprint(row.data));
        if (!back || back.rev === undefined || same) accept(row, back?.rev);
        else refused.push({ row, server: back });
      }
    }
    return refused;
  };

  const refused = await send(outgoing);
  const again: OutgoingRow[] = [];
  for (const { row, server: theirs } of refused) {
    conflicts++;
    const c = row.collection;
    const records = localRecords.get(c)!;
    (revs[c] ??= {})[row.record_id] = theirs.rev!;
    if (row.deleted && !theirs.deleted) {
      // Deleted here, edited elsewhere: the edit comes back.
      records.set(row.record_id, theirs.data);
      (after[c] ??= {})[row.record_id] = fingerprint(theirs.data);
      touched.add(c);
    } else if (!row.deleted && !theirs.deleted && KEEP_BOTH.has(c)) {
      // Someone's own words, changed on two phones: keep both.
      const copyId = conflictCopyId(row.record_id, now());
      records.set(row.record_id, theirs.data);
      (after[c] ??= {})[row.record_id] = fingerprint(theirs.data);
      const copy = { ...(row.data as Record<string, unknown>), id: copyId, conflictCopyOf: row.record_id };
      records.set(copyId, copy);
      again.push({ collection: c, record_id: copyId, data: copy, deleted: false, client_updated_at: at, base_rev: 0 });
      touched.add(c);
    } else {
      // Anything else, or an edit over a delete: this phone's change is the
      // later one to reach the server, so it's sent again over its revision.
      again.push({ ...row, base_rev: theirs.rev });
    }
  }
  // A third phone writing in between: left for the next sync (its
  // fingerprint isn't recorded, so it's sent again then).
  if (again.length) await send(again);
  for (const c of touched) {
    local.write(c, fromRecords(c, local.read(c), localRecords.get(c)!));
    changed.add(c);
  }

  for (const c of Object.keys(after)) if (Object.keys(after[c]).length === 0) delete after[c];
  return { state: { owner: userId, cursor, fingerprints: after, revs }, pulled, pushed, changedCollections: [...changed], conflicts };
}
