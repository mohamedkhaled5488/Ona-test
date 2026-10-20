// One sync pass: pull what changed on the server, merge it in, then push what
// changed here. Pure apart from the server and local-data adapters passed in,
// so the whole behaviour is tested without a network.
//
// How changes are noticed: after each sync we remember a fingerprint of every
// record as the server has it. A record whose fingerprint differs now was
// changed on this phone; one that's missing was deleted here.
//
// Conflicts: if an item changed both here and on the server since the last
// sync, this phone's change is kept and pushed (it's the newer edit as far
// as this phone knows; the server keeps whichever was made later).
import { fingerprint, fromRecords, syncedCollections, toRecords } from './records';

export interface RemoteRow {
  collection: string;
  record_id: string;
  data: unknown;
  deleted: boolean;
  client_updated_at: string;
  server_updated_at: string;
}

export interface OutgoingRow {
  collection: string;
  record_id: string;
  data: unknown;
  deleted: boolean;
  client_updated_at: string;
}

export interface SyncServer {
  pull: (since: string | null, limit: number) => Promise<RemoteRow[]>;
  push: (rows: OutgoingRow[]) => Promise<void>;
}

export interface LocalData {
  read: (collection: string) => unknown;
  write: (collection: string, value: unknown) => void;
}

export interface SyncState {
  owner: string | null; // the account this phone's data last synced with
  cursor: string | null; // latest server_updated_at seen
  fingerprints: Record<string, Record<string, string>>; // collection → record id → fingerprint
}

export const EMPTY_SYNC_STATE: SyncState = { owner: null, cursor: null, fingerprints: {} };

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
}

const PAGE = 500;
const PUSH_BATCH = 200;

// `upload: false` (no trial or subscription): only pull. The state then
// remembers only what the server has, so this phone's own changes are still
// sent once sync access is back.
export async function syncOnce(userId: string, server: SyncServer, start: SyncState, local: LocalData, now: () => number = Date.now, opts: { upload?: boolean } = {}): Promise<SyncResult> {
  if (start.owner && start.owner !== userId) throw new OtherAccountError();
  const known: SyncState['fingerprints'] = Object.fromEntries(Object.entries(start.fingerprints).map(([c, m]) => [c, { ...m }]));
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
      if (changedHere && lastKnown !== undefined) continue; // edited (or deleted) here too: ours wins, pushed below
      if (changedHere && lastKnown === undefined && here !== undefined) {
        // Created on both sides with the same id (rare): keep ours.
        continue;
      }
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
  for (const c of touched) local.write(c, fromRecords(c, local.read(c), localRecords.get(c)!));
  if (opts.upload === false) return { state: { owner: userId, cursor, fingerprints: known }, pulled, pushed: 0, changedCollections: [...touched] };

  // --- 2. Push ---
  const at = new Date(now()).toISOString();
  const outgoing: OutgoingRow[] = [];
  const after: SyncState['fingerprints'] = {};
  for (const c of collections) {
    const records = localRecords.get(c)!;
    const fps = known[c] ?? {};
    const next: Record<string, string> = {};
    for (const [id, data] of records) {
      const fp = fingerprint(data);
      next[id] = fp;
      if (fps[id] !== fp) outgoing.push({ collection: c, record_id: id, data, deleted: false, client_updated_at: at });
    }
    for (const id of Object.keys(fps)) {
      if (!records.has(id)) outgoing.push({ collection: c, record_id: id, data: null, deleted: true, client_updated_at: at });
    }
    if (Object.keys(next).length) after[c] = next;
  }
  for (let i = 0; i < outgoing.length; i += PUSH_BATCH) await server.push(outgoing.slice(i, i + PUSH_BATCH));

  return { state: { owner: userId, cursor, fingerprints: after }, pulled, pushed: outgoing.length, changedCollections: [...touched] };
}
