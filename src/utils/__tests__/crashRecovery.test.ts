// Ona killed at every step of putting data aside, bringing it back and
// removing it (sync/signInFlow.ts → dataSpaceController.ts). "Killed at
// step k": the k-th write to storage and every one after it fail, as when
// the process dies. Then Ona starts again the normal way. Whatever k is:
//   - nothing anyone made is lost (on the phone, or in a listed copy),
//   - no step is left half done and nothing is left over unlisted,
//   - sync never believes the account has an item the phone no longer has
//     (the next sync would delete it from the account),
//   - the step either happened completely or not at all.
// IDs: docs/test-cases/integration.md (CRASH-*)
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));
jest.mock('../reminders', () => ({ resyncFeature: jest.fn(async () => {}) }));
jest.mock('../../lib/supabase', () => ({ isSupabaseConfigured: false, supabase: {} }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { setDataSpace } from '../dataSpace';
import { DATA_OP_KEY, PARKED_INDEX, __flushForTests, __resetForTests, clearActiveData, listParked, parkActiveData, restoreParked, startAppData, type ParkedCopy } from '../dataSpaceController';
import { useJournalStore } from '../../store/useJournalStore';
import { useSyncStore } from '../../store/useSyncStore';
import { fingerprint } from '../../sync/records';
import { EMPTY_SYNC_STATE, type SyncState } from '../../sync/engine';
import { useClock, restoreClock } from '../../test-utils';

type Store = { getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void>; removeItem: (k: string) => Promise<void>; getAllKeys: () => Promise<readonly string[]>; clear: () => Promise<void> };
const real = AsyncStorage as unknown as Store;
const C = 'journaling.entries';
const entry = (id: string) => ({ id, date: '2026-10-24', zone: 'calm', text: id, tags: [], createdAt: '2026-10-24T08:00:00.000Z', updatedAt: '2026-10-24T08:00:00.000Z' });

// Counts writes; from write `killAt` on, every write fails (the process is gone).
function dyingStorage(killAt = Infinity) {
  let n = 0;
  const write = <T,>(f: () => Promise<T>) => {
    n++;
    if (n >= killAt) return Promise.reject(new Error('killed'));
    return f();
  };
  return {
    storage: { getItem: (k: string) => real.getItem(k), setItem: (k: string, v: string) => write(() => real.setItem(k, v)), removeItem: (k: string) => write(() => real.removeItem(k)) },
    writes: () => n,
  };
}

async function startOna() {
  __resetForTests();
  setDataSpace('real');
  await (useSyncStore as unknown as { persist: { rehydrate: () => Promise<void> } }).persist.rehydrate();
  await startAppData(real as never, false);
}
async function setSync(state: SyncState) {
  await real.setItem('ona.sync', JSON.stringify({ state, version: 1 }));
  useSyncStore.getState().setSyncState(state);
}
const synced = (owner: string, ids: string[]): SyncState => ({ owner, cursor: '2026-10-24T08:00:00.000Z', fingerprints: { [C]: Object.fromEntries(ids.map((id) => [id, fingerprint(entry(id))])) } });
async function phoneHas(ids: string[]) {
  useJournalStore.setState({ entries: ids.map(entry) } as never);
  await __flushForTests();
}

const active = () => useJournalStore.getState().entries.map((e) => e.id).sort();
async function parkedIds(c: ParkedCopy): Promise<string[]> {
  const raw = await real.getItem(`ona.parked.${c.id}.journaling`);
  return raw ? ((JSON.parse(raw) as { state: { entries: { id: string }[] } }).state.entries ?? []).map((e) => e.id).sort() : [];
}

// The checks that hold whatever step Ona was killed at.
async function invariants(mustKeep: string[]) {
  const listed = await listParked(real as never);
  const kept = new Set(active());
  for (const c of listed) (await parkedIds(c)).forEach((id) => kept.add(id));
  const lost = mustKeep.filter((id) => !kept.has(id));
  const leftovers = (await real.getAllKeys()).filter((k) => k.startsWith('ona.parked.') && k !== PARKED_INDEX && !listed.some((c) => k.startsWith(`ona.parked.${c.id}.`)));
  const { owner, fingerprints } = useSyncStore.getState();
  const wouldDelete = owner ? Object.keys(fingerprints[C] ?? {}).filter((id) => !kept.has(id) || !active().includes(id)) : [];
  return { lost, leftovers, halfDone: (await real.getItem(DATA_OP_KEY)) !== null, wouldDelete, listed };
}

beforeEach(async () => {
  useClock('2026-10-24T09:00');
  await real.clear();
  await startOna();
  await setSync(EMPTY_SYNC_STATE);
});
afterEach(() => restoreClock());

// Runs `scenario` once to count its writes, then again killed at each one.
async function atEveryStep(setup: () => Promise<unknown>, run: (s: never) => Promise<unknown>, check: (k: number) => Promise<void>) {
  await setup();
  const probe = dyingStorage();
  await run(probe.storage as never);
  const total = probe.writes();
  expect(total).toBeGreaterThan(3);
  for (let k = 1; k <= total; k++) {
    await real.clear();
    await startOna();
    await setSync(EMPTY_SYNC_STATE);
    await setup();
    const dying = dyingStorage(k);
    await expect(run(dying.storage as never)).rejects.toThrow();
    await startOna(); // Ona opened again
    await check(k);
  }
}

test('CRASH-001 putting this phone\'s data aside (never synced), killed at every step', async () => {
  await atEveryStep(
    () => phoneHas(['g1', 'g2', 'g3']),
    (s) => parkActiveData({ origin: null, reason: 'keptSeparate' }, s),
    async (k) => {
      const r = await invariants(['g1', 'g2', 'g3']);
      expect({ k, lost: r.lost, leftovers: r.leftovers, halfDone: r.halfDone }).toEqual({ k, lost: [], leftovers: [], halfDone: false });
      // All or nothing: still on the phone and not listed, or listed in full and the phone empty.
      const before = active().join() === 'g1,g2,g3' && r.listed.length === 0;
      const after = active().length === 0 && r.listed.length === 1 && (await parkedIds(r.listed[0])).join() === 'g1,g2,g3';
      expect({ k, allOrNothing: before || after }).toEqual({ k, allOrNothing: true });
    }
  );
});

test('CRASH-002 putting another account\'s data aside, killed at every step: sync never ends up deleting it from that account', async () => {
  await atEveryStep(
    async () => {
      await phoneHas(['a1', 'a2']);
      await setSync(synced('a', ['a1', 'a2']));
    },
    (s) => parkActiveData({ origin: 'a', reason: 'otherAccount' }, s),
    async (k) => {
      const r = await invariants(['a1', 'a2']);
      expect({ k, lost: r.lost, leftovers: r.leftovers, halfDone: r.halfDone, wouldDelete: r.wouldDelete }).toEqual({ k, lost: [], leftovers: [], halfDone: false, wouldDelete: [] });
      const before = active().join() === 'a1,a2' && useSyncStore.getState().owner === 'a' && r.listed.length === 0;
      const after = active().length === 0 && useSyncStore.getState().owner === null && r.listed.length === 1 && r.listed[0].sync.owner === 'a';
      expect({ k, allOrNothing: before || after }).toEqual({ k, allOrNothing: true });
    }
  );
});

test('CRASH-003 bringing a copy back onto an empty phone, killed at every step: it ends up back, complete, with its account', async () => {
  let id = '';
  await atEveryStep(
    async () => {
      await phoneHas(['a1', 'a2']);
      await setSync(synced('a', ['a1', 'a2']));
      id = (await parkActiveData({ origin: 'a', reason: 'otherAccount' }, real as never)).id;
    },
    (s) => restoreParked(id, s),
    async (k) => {
      const r = await invariants(['a1', 'a2']);
      expect({ k, lost: r.lost, leftovers: r.leftovers, halfDone: r.halfDone, wouldDelete: r.wouldDelete }).toEqual({ k, lost: [], leftovers: [], halfDone: false, wouldDelete: [] });
      const notStarted = active().length === 0 && r.listed.length === 1 && useSyncStore.getState().owner === null;
      const done = active().join() === 'a1,a2' && r.listed.length === 0 && useSyncStore.getState().owner === 'a';
      expect({ k, allOrNothing: notStarted || done }).toEqual({ k, allOrNothing: true });
    }
  );
});

test('CRASH-004 adding a copy to what\'s here, killed at every step: everything from both, nothing twice', async () => {
  let id = '';
  await atEveryStep(
    async () => {
      await phoneHas(['g1', 'g2']);
      id = (await parkActiveData({ origin: null, reason: 'accountOnly' }, real as never)).id;
      await phoneHas(['b1']);
      await setSync(synced('b', ['b1']));
    },
    (s) => restoreParked(id, s),
    async (k) => {
      const r = await invariants(['g1', 'g2', 'b1']);
      expect({ k, lost: r.lost, leftovers: r.leftovers, halfDone: r.halfDone, wouldDelete: r.wouldDelete }).toEqual({ k, lost: [], leftovers: [], halfDone: false, wouldDelete: [] });
      expect(new Set(useJournalStore.getState().entries.map((e) => e.id)).size).toBe(useJournalStore.getState().entries.length); // nothing twice
      const notStarted = active().join() === 'b1' && r.listed.length === 1;
      const done = active().join() === 'b1,g1,g2' && r.listed.length === 0 && useSyncStore.getState().owner === 'b';
      expect({ k, allOrNothing: notStarted || done }).toEqual({ k, allOrNothing: true });
    }
  );
});

test('CRASH-005 removing the phone\'s copy at sign-out, killed at every step: never a partial phone that sync would read as deletions', async () => {
  await atEveryStep(
    async () => {
      await phoneHas(['j1', 'j2', 'j3']);
      await setSync(synced('u1', ['j1', 'j2', 'j3']));
    },
    (s) => clearActiveData(s),
    async (k) => {
      const r = await invariants([]);
      expect({ k, leftovers: r.leftovers, halfDone: r.halfDone, wouldDelete: r.wouldDelete }).toEqual({ k, leftovers: [], halfDone: false, wouldDelete: [] });
      const notStarted = active().join() === 'j1,j2,j3' && useSyncStore.getState().owner === 'u1';
      const done = active().length === 0 && useSyncStore.getState().owner === null;
      expect({ k, allOrNothing: notStarted || done }).toEqual({ k, allOrNothing: true });
    }
  );
});
