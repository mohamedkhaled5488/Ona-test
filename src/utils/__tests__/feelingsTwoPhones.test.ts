// Journal and Quit feelings across two phones, with sync's real rules
// (server revisions; a journal entry changed on two phones keeps both): the
// phones end up agreeing, each journal entry's feeling matches it, a
// conflict copy has none of its own, bringing older feelings in never makes
// a second copy, and a deleted feeling never comes back.
// IDs: docs/test-cases/integration.md (FEEL-2P-*)
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));
jest.setTimeout(30_000);

import { EMPTY_SYNC_STATE, syncOnce, type PushedRow, type RemoteRow, type SyncServer, type SyncState } from '../../sync/engine';
import { localData } from '../../sync/syncController';
import { stableStringify } from '../../sync/records';
import { useFeelingsStore } from '../../store/useFeelingsStore';
import { useJournalStore } from '../../store/useJournalStore';
import { useQuitHabitsStore } from '../../store/useQuitHabitsStore';
import { bringFeelingsTogether, journalFeelingId, quitFeelingId, syncJournalFeeling } from '../../feelings/fromSections';
import { deleteFeelingEntry } from '../taskFeelings';
import { mirrorFeelingEdit } from '../itemFeelings';
import { makeQuitHabit, makeTrack, resetAll, useClock, restoreClock } from '../../test-utils';
import type { FeelingCheckIn, JournalEntry, QuitFeelingEntry } from '../../types/sections';

// The same rule as migration 0009: a write over a revision the phone never
// saw is refused, and the server's row comes back.
function revisionServer() {
  const rows = new Map<string, RemoteRow & { rev: number }>();
  let tick = 0;
  const server: SyncServer = {
    pull: async (since, limit) => [...rows.values()].filter((r) => !since || r.server_updated_at > since).sort((a, b) => a.server_updated_at.localeCompare(b.server_updated_at)).slice(0, limit),
    push: async (batch) => {
      const back: PushedRow[] = [];
      for (const r of batch) {
        const k = `${r.collection}/${r.record_id}`;
        const old = rows.get(k);
        if (old && r.base_rev != null && r.base_rev !== old.rev) {
          back.push(old);
          continue;
        }
        const row = { collection: r.collection, record_id: r.record_id, data: r.data, deleted: r.deleted, client_updated_at: r.client_updated_at, server_updated_at: new Date(Date.UTC(2026, 9, 27, 12, 0, 0, ++tick)).toISOString(), rev: old ? old.rev + 1 : 1 };
        rows.set(k, row);
        back.push(row);
      }
      return back;
    },
  };
  return server;
}

// A phone: its own copy of the stores, swapped in while it acts. A sync does
// what the app does (syncController): the engine, then the feelings follow.
type Snapshot = { journal: JournalEntry[]; feelings: FeelingCheckIn[]; quit: QuitFeelingEntry[] };
function phone(initial: Partial<Snapshot> = {}) {
  let snap: Snapshot = { journal: [], feelings: [], quit: [], ...structuredClone(initial) };
  let state: SyncState = EMPTY_SYNC_STATE;
  const enter = () => {
    useJournalStore.setState({ entries: structuredClone(snap.journal) } as never);
    useFeelingsStore.setState({ entries: structuredClone(snap.feelings) } as never);
    useQuitHabitsStore.setState({ feelingEntries: structuredClone(snap.quit) } as never);
  };
  const leave = () => {
    snap = { journal: useJournalStore.getState().entries, feelings: useFeelingsStore.getState().entries, quit: useQuitHabitsStore.getState().feelingEntries };
  };
  const p = {
    act: <T,>(fn: () => T): T => {
      enter();
      try {
        return fn();
      } finally {
        leave();
      }
    },
    start: () => p.act(() => bringFeelingsTogether()),
    sync: async (server: SyncServer) => {
      enter();
      try {
        const r = await syncOnce('u1', server, state, localData);
        state = r.state;
        bringFeelingsTogether();
      } finally {
        leave();
      }
    },
    get: () => snap,
  };
  return p;
}
const settle = async (server: SyncServer, ...phones: ReturnType<typeof phone>[]) => {
  for (let round = 0; round < 3; round++) for (const ph of phones) await ph.sync(server);
};
const view = (s: Snapshot) => stableStringify({ journal: [...s.journal].sort((a, b) => a.id.localeCompare(b.id)), feelings: [...s.feelings].sort((a, b) => a.id.localeCompare(b.id)), quit: s.quit });
// Every journal entry with a chosen colour has exactly one feeling, matching it; nothing else has one.
function consistent(s: Snapshot) {
  for (const e of s.journal) {
    const f = s.feelings.filter((x) => x.source?.kind === 'journal' && x.source.refId === e.id);
    if (e.conflictCopyOf) expect({ copy: e.id, feelings: f.length }).toEqual({ copy: e.id, feelings: 0 });
    else if (e.zone && e.feelingChosen && !e.feelingRemoved) expect({ entry: e.id, zones: f.map((x) => x.zone) }).toEqual({ entry: e.id, zones: [e.zone] });
  }
}

beforeEach(async () => {
  await resetAll();
  useClock('2026-10-27T18:00');
  useQuitHabitsStore.setState({ habits: [makeQuitHabit({ id: 'q1', name: 'Vaping' })], tracks: [makeTrack({ id: 't1', quitHabitId: 'q1', startDate: '2026-08-01' })], slips: [], cravingSessions: [] } as never);
});
afterEach(() => restoreClock());

test('FEEL-2P-001 the journal entry changed on one phone while its feeling is edited in Feelings on the other: the phones agree, each feeling matches its entry, nothing written is lost', async () => {
  const server = revisionServer();
  const a = phone();
  const b = phone();
  a.act(() => {
    useJournalStore.getState().upsertEntry('2026-10-26', 'tense', 'A hard meeting', [], { feelingChosen: true });
    syncJournalFeeling(useJournalStore.getState().entries[0].id);
  });
  await settle(server, a, b);
  const jid = a.get().journal[0].id;
  // At the same time, offline from each other:
  a.act(() => {
    useJournalStore.getState().upsertEntry('2026-10-26', 'lively', 'A hard meeting, then a good walk', [], { feelingChosen: true });
    syncJournalFeeling(jid);
  });
  b.act(() => {
    useFeelingsStore.getState().updateEntry(journalFeelingId(jid), { zone: 'low', feelingIds: [], note: 'still heavy' });
    mirrorFeelingEdit(journalFeelingId(jid));
  });
  await settle(server, a, b);
  expect(view(b.get())).toBe(view(a.get()));
  consistent(a.get());
  // Both versions of the words are kept (the other as a conflict copy).
  expect(a.get().journal.map((e) => e.text).sort()).toEqual(['A hard meeting', 'A hard meeting, then a good walk'].sort());
  expect(a.get().feelings.filter((f) => f.source?.kind === 'journal')).toHaveLength(1);
});

test('FEEL-2P-002 bringing older feelings in on both phones before they sync: one copy each, the same on both', async () => {
  const server = revisionServer();
  const old: Partial<Snapshot> = {
    journal: [{ id: 'j-old', date: '2026-09-02', zone: 'tense', text: 'old', tags: [] }],
    quit: [{ id: 'm1', trackId: 't1', isRelapseMoment: false, isResistedUrge: true, feelingId: 'scared-anxious', zone: 'tense', createdAt: '2026-09-10T21:30:00.000Z' }],
  };
  const a = phone(old);
  const b = phone(old);
  a.start();
  b.start();
  await settle(server, a, b);
  expect(view(b.get())).toBe(view(a.get()));
  expect(a.get().feelings.map((f) => f.id).sort()).toEqual([journalFeelingId('j-old'), quitFeelingId('m1')].sort());
  a.start();
  b.start();
  await settle(server, a, b);
  expect(a.get().feelings).toHaveLength(2);
});

test('FEEL-2P-003 a feeling deleted on one phone never comes back, even from a phone that brought it in again before it knew', async () => {
  const server = revisionServer();
  const old: Partial<Snapshot> = {
    journal: [{ id: 'j-old', date: '2026-09-02', zone: 'tense', text: 'old', tags: [] }],
    quit: [{ id: 'm1', trackId: 't1', isRelapseMoment: false, isResistedUrge: true, feelingId: 'scared-anxious', zone: 'tense', createdAt: '2026-09-10T21:30:00.000Z' }],
  };
  // Both phones have the older data, synced, from before this version.
  const a = phone(old);
  const c = phone();
  await a.sync(server);
  await c.sync(server);
  // The update: A brings the feelings in, syncs, then deletes both.
  a.start();
  await a.sync(server);
  a.act(() => {
    deleteFeelingEntry(journalFeelingId('j-old'));
    deleteFeelingEntry(quitFeelingId('m1'));
  });
  await a.sync(server);
  c.start(); // C opens later and brings both in again, not knowing yet
  expect(c.get().feelings).toHaveLength(2);
  await settle(server, c, a);
  for (const ph of [a, c]) {
    expect(ph.get().feelings).toEqual([]);
    expect(ph.get().journal[0]).toMatchObject({ id: 'j-old', feelingRemoved: true });
    expect(ph.get().quit[0]).toMatchObject({ id: 'm1', feelingEntryId: undefined, zone: undefined });
  }
});

test('FEEL-2P-004 explicit Calm on one phone reaches the other as a feeling; a plain older Calm never does', async () => {
  const server = revisionServer();
  const a = phone({ journal: [{ id: 'j-legacy', date: '2026-09-03', zone: 'calm', text: 'old calm', tags: [] }] });
  const b = phone();
  a.act(() => {
    useJournalStore.getState().upsertEntry('2026-10-27', 'calm', 'Quiet day', [], { feelingChosen: true });
    syncJournalFeeling(useJournalStore.getState().entries.find((e) => e.date === '2026-10-27')!.id);
  });
  a.start();
  await settle(server, a, b);
  expect(b.get().feelings.map((f) => [f.date, f.zone])).toEqual([['2026-10-27', 'calm']]);
});
