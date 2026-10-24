// Starting the app's data, and switching between the user's own data and
// Demo mode. The order matters and is the whole point of this file:
//
//   1. let any sync in flight finish (it reads and writes the stores),
//   2. save whatever is pending in the current space, then stop saving,
//   3. switch the space (dataSpace.ts) and load settings for it in one step,
//   4. load every section from the new space (missing ones start empty),
//   5. start saving again, now bound to the new space.
//
// Between 2 and 5 nothing saves at all, and a saver created for one space
// refuses to write once the space has changed (localPersistence.ts).
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateStorage } from 'zustand/middleware';
import { purgeDemoLeftovers } from './demoLeftovers';
import { DEMO_META_KEY, SPACE_KEY, bumpDataGeneration, getDataSpace, isDemo, setDataSpace, setSwitchingDataSpace, spaceKey, type DataSpace } from './dataSpace';
import { hydrateLocalData, startLocalPersistence, storageKey, DATA_FORMAT_VERSION } from './localPersistence';
import { LOCAL_DATA, wipeLocalData } from './localData';
import { DEFAULT_SETTINGS, SETTINGS_KEY, SETTINGS_VERSION, migrateSettings, useSettingsStore, type SettingsData } from '../store/useSettingsStore';
import { syncInFlight } from '../sync/syncController';
import { useSyncStore } from '../store/useSyncStore';
import { EMPTY_SYNC_STATE, type SyncState } from '../sync/engine';
import { fromRecords, syncedCollections, toRecords } from '../sync/records';
import { demoSeed, DEMO_SEED_VERSION } from '../demo/demoData';
import { todayISO } from './date';
import type { StartScreen } from '../navigation/startScreen';

type Storage = Pick<StateStorage, 'getItem' | 'setItem' | 'removeItem'>;

export interface DemoMeta {
  version: number;
  seed: string;
  createdAt: string;
  createdFor: string; // the "today" the sample dates were built around
  noteSeen: boolean; // "Changes here stay in the demo"
  tourDone: boolean;
}

let persistence: { stop: () => void; flush: () => Promise<void>; flushAll: () => Promise<void> } | null = null;
// Switches run strictly one after another.
let queue: Promise<void> = Promise.resolve();

// Settings for a space, read straight from storage (so nothing in memory from
// the other space can leak into them). Demo starts from the defaults: no
// locks, no consents, its own everything.
async function settingsFor(space: DataSpace, storage: Storage): Promise<{ data: SettingsData; raw: string | null }> {
  const raw = (await storage.getItem(spaceKey(SETTINGS_KEY, space))) as string | null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { state?: unknown; version?: number };
      return { data: migrateSettings(parsed.state ?? {}, parsed.version ?? SETTINGS_VERSION), raw };
    } catch {
      // A damaged entry: start from the defaults.
    }
  }
  return { data: { ...DEFAULT_SETTINGS, consent: { ...DEFAULT_SETTINGS.consent }, notify: { ...DEFAULT_SETTINGS.notify } }, raw: null };
}

export async function readDemoMeta(storage: Storage = AsyncStorage): Promise<DemoMeta | null> {
  try {
    const raw = await storage.getItem(DEMO_META_KEY);
    return raw ? (JSON.parse(raw as string) as DemoMeta) : null;
  } catch {
    return null;
  }
}

export async function updateDemoMeta(patch: Partial<DemoMeta>, storage: Storage = AsyncStorage): Promise<void> {
  const meta = await readDemoMeta(storage);
  if (meta) await storage.setItem(DEMO_META_KEY, JSON.stringify({ ...meta, ...patch }));
}

// Writes the sample data under demo keys only. Never runs while the demo
// data is loaded (the controller stops saving first).
async function writeDemoSeed(storage: Storage, keep: Partial<Pick<DemoMeta, 'noteSeen' | 'tourDone'>> = {}): Promise<void> {
  const today = todayISO();
  const seed = demoSeed(today);
  for (const section of Object.keys(LOCAL_DATA)) {
    const state = seed.sections[section] ?? {};
    await storage.setItem(storageKey(section, 'demo'), JSON.stringify({ v: DATA_FORMAT_VERSION, state }));
  }
  // The demo's own starting settings (defaults plus a few demo choices).
  const settings = migrateSettings(seed.settings, SETTINGS_VERSION);
  await storage.setItem(spaceKey(SETTINGS_KEY, 'demo'), JSON.stringify({ state: settings, version: SETTINGS_VERSION }));
  const meta: DemoMeta = { version: DEMO_SEED_VERSION, seed: seed.seed, createdAt: new Date().toISOString(), createdFor: today, noteSeen: false, tourDone: false, ...keep };
  await storage.setItem(DEMO_META_KEY, JSON.stringify(meta));
}

// Carried into the demo from the user's own settings: how the app looks and
// reads (theme, text size and so on), so someone who needs large text keeps
// it. Nothing else crosses over, and nothing ever goes the other way.
export const CARRIED_INTO_DEMO = ['theme', 'accent', 'textSize', 'timeFormat', 'weekStartsOn', 'haptics'] as const;

async function load(space: DataSpace, storage: Storage, keepSamples: boolean): Promise<void> {
  const settings = await settingsFor(space, storage);
  if (space === 'demo' && getDataSpace() === 'real') {
    const own = useSettingsStore.getState();
    for (const key of CARRIED_INTO_DEMO) (settings.data as unknown as Record<string, unknown>)[key] = own[key];
    settings.raw = null; // the demo's copy is saved with these
  }
  // Space and settings change together, in one synchronous step: the settings
  // store saves on every change, and its keys follow the space.
  setDataSpace(space);
  useSettingsStore.setState(settings.data);
  // Loading saves the settings back in full; put the stored bytes back
  // exactly, so coming home leaves them untouched.
  if (settings.raw) await storage.setItem(spaceKey(SETTINGS_KEY, space), settings.raw);
  // ...and if nothing was stored (settings never changed), leave nothing.
  else if (space === 'real') await storage.removeItem(spaceKey(SETTINGS_KEY, space));
  await hydrateLocalData(storage, keepSamples);
  persistence = startLocalPersistence(storage);
  // After saving starts, so the cleaned data is what gets stored.
  purgeDemoLeftovers();
}

// At app start. Reopens in Demo mode if that's where the app was; if the
// demo data isn't all there, falls back to the user's own data.
export async function startAppData(storage: Storage = AsyncStorage, keepSamplesOnFirstRun: boolean = __DEV__): Promise<DataSpace> {
  // Killed in the middle of putting data aside, bringing it back or removing
  // it: finish (or undo) that first.
  try {
    await recoverDataOperation(storage);
  } catch (e) {
    if (__DEV__) console.warn('[data] recovery', e);
  }
  let space: DataSpace = 'real';
  try {
    if ((await storage.getItem(SPACE_KEY)) === 'demo') {
      if (await readDemoMeta(storage)) space = 'demo';
      else await storage.setItem(SPACE_KEY, 'real');
    }
  } catch {
    space = 'real';
  }
  if (space === 'demo') await load('demo', storage, false);
  else {
    // The settings store has already loaded the real settings by itself.
    await hydrateLocalData(storage, keepSamplesOnFirstRun);
    persistence = startLocalPersistence(storage);
    purgeDemoLeftovers();
  }
  return space;
}

export function switchDataSpace(target: DataSpace, storage: Storage = AsyncStorage): Promise<void> {
  const run = queue.then(async () => {
    if (target === getDataSpace()) return;
    // No sync may start until the target space is fully loaded: otherwise it
    // reads the stores mid-switch and uploads one space's data as the other's.
    setSwitchingDataSpace(true);
    try {
      await syncInFlight();
      if (persistence) {
        // Everything in memory is saved to the space it belongs to, so coming
        // back finds it exactly as it was.
        await persistence.flushAll();
        persistence.stop();
        persistence = null;
      }
      if (target === 'demo' && !(await readDemoMeta(storage))) await writeDemoSeed(storage);
      await storage.setItem(SPACE_KEY, target);
      await load(target, storage, false);
    } finally {
      setSwitchingDataSpace(false);
    }
  });
  queue = run.catch(() => {});
  return run;
}

// Settings → Demo mode → "Reset demo data": the original sample set again.
// Only demo keys are removed; the user's own data is never touched.
export async function resetDemoData(storage: Storage = AsyncStorage): Promise<void> {
  await queue;
  const inDemo = isDemo();
  if (inDemo && persistence) {
    await persistence.flush();
    persistence.stop();
    persistence = null;
  }
  const previous = await readDemoMeta(storage);
  for (const section of Object.keys(LOCAL_DATA)) await storage.removeItem(storageKey(section, 'demo'));
  await storage.removeItem(DEMO_META_KEY);
  await writeDemoSeed(storage, { noteSeen: previous?.noteSeen ?? false, tourDone: previous?.tourDone ?? false });
  if (inDemo) await load('demo', storage, false);
}

// Whether the user's own space holds anything they made (i.e. this isn't a
// fresh install).
export async function hasRealData(storage: Storage = AsyncStorage): Promise<boolean> {
  const nonEmpty = (v: unknown) => (Array.isArray(v) ? v.length > 0 : v && typeof v === 'object' ? Object.keys(v).length > 0 : false);
  for (const [section, { keys }] of Object.entries(LOCAL_DATA)) {
    const raw = await storage.getItem(storageKey(section, 'real'));
    if (!raw) continue;
    try {
      const state = (JSON.parse(raw as string) as { state?: Record<string, unknown> }).state ?? {};
      // Only the user's data counts (saved-but-empty sections don't).
      if (keys.some((k) => nonEmpty(state[k]))) return true;
    } catch {
      return true; // something is there, even if damaged: treat it as theirs
    }
  }
  return false;
}

// Where the app opens: the first-run screen on a fresh install with no
// account; Home otherwise. Someone updating from an older version (data
// already here) is marked as having seen it, so it never appears for them.
export async function decideStartScreen(signedIn: boolean, storage: Storage = AsyncStorage): Promise<StartScreen> {
  if (isDemo() || signedIn) return 'Main';
  const settings = useSettingsStore.getState();
  if (settings.welcomeSeen) return 'Main';
  if (await hasRealData(storage)) {
    settings.set('welcomeSeen', true);
    return 'Main';
  }
  return 'welcome';
}

// ---------------------------------------------------------------------------
// Data put aside on this phone (design 3.3/3.4): this phone's data kept
// separate from an account, or another account's data, when someone else
// signs in. Ona never deletes it: it stays until the person brings it back
// or removes it (Settings → Privacy, Security & Data → Other data on this
// phone). Stored under its own keys, so no store, no sync and no screen
// reads it by accident.
// ---------------------------------------------------------------------------
export type ParkedReason = 'keptSeparate' | 'accountOnly' | 'otherAccount';
export interface ParkedCopy {
  id: string;
  origin: string | null; // the account it was last synced with; null: never synced
  reason: ParkedReason;
  parkedAt: string;
  records: number;
  sync: SyncState; // what was known about the server for it
}
export const PARKED_INDEX = 'ona.parked.index';
// The step in progress, so a restart after Ona is killed halfway finishes it
// or undoes it (recoverDataOperation). Written first, cleared last.
export const DATA_OP_KEY = 'ona.parked.op';
type DataOp = { op: 'park'; copy: ParkedCopy } | { op: 'restore'; id: string; mode: 'restored' | 'added' } | { op: 'clear' };
const parkedKey = (id: string, section: string) => `ona.parked.${id}.${section}`;
// The sync bookkeeping's own storage key (store/useSyncStore.ts).
const SYNC_KEY = 'ona.sync';

export async function listParked(storage: Storage = AsyncStorage): Promise<ParkedCopy[]> {
  try {
    const raw = (await storage.getItem(PARKED_INDEX)) as string | null;
    return raw ? (JSON.parse(raw) as ParkedCopy[]) : [];
  } catch {
    return [];
  }
}
const saveIndex = (list: ParkedCopy[], storage: Storage) => storage.setItem(PARKED_INDEX, JSON.stringify(list));

// What sync knows about the server, saved now (not when the store gets to
// it): the order of these writes is what keeps a crash from ever leaving a
// sync state that would delete things from the account.
async function saveSyncState(state: SyncState, storage: Storage): Promise<void> {
  await storage.setItem(SYNC_KEY, JSON.stringify({ state, version: 1 }));
  useSyncStore.getState().setSyncState(state);
}

// The records the phone's own data holds right now (what a person would
// call "my entries"): every synced collection, item by item.
export function countActiveRecords(): number {
  let n = 0;
  for (const c of syncedCollections()) n += toRecords(c.key, (LOCAL_DATA[c.section].store.getState() as Record<string, unknown>)[c.field]).size;
  return n;
}

// Runs `change` with the phone's own data held still, like a demo switch:
// no sync may start, a running one finishes first, everything is saved and
// saving stops; afterwards (also after an error) the stores load from
// storage again, and a sync that started before sees the data changed and
// stops.
function exclusively<T>(change: () => Promise<T>, storage: Storage): Promise<T> {
  const run = queue.then(async () => {
    if (isDemo()) throw new Error("That isn't available in Demo mode.");
    setSwitchingDataSpace(true);
    try {
      await syncInFlight();
      if (persistence) {
        await persistence.flushAll();
        persistence.stop();
        persistence = null;
      }
      bumpDataGeneration();
      return await change();
    } finally {
      try {
        await hydrateLocalData(storage, false);
      } finally {
        persistence = startLocalPersistence(storage);
        bumpDataGeneration();
        setSwitchingDataSpace(false);
      }
    }
  });
  queue = run.then(
    () => {},
    () => {}
  );
  return run;
}

// --- The three operations, each in steps a restart can finish ----------------
//
// Park:    note → copy every section → list the copy (the point of no return)
//          → forget the account → remove the phone's own sections → done.
// Restore: note → bring the sections back (or add their items) → only then
//          what was known about its account → unlist → remove the copy → done.
// Clear:   note → forget the account → remove the phone's sections → done.
//
// "Forget the account" always comes before anything is removed, and a
// restored copy's sync state only after all of it is back: so a sync never
// sees items missing that it believes the account has (it would delete them
// there).

async function parkSteps(copy: ParkedCopy, storage: Storage, from: 'start' | 'listed'): Promise<void> {
  if (from === 'start') {
    for (const section of Object.keys(LOCAL_DATA)) {
      const raw = (await storage.getItem(storageKey(section, 'real'))) as string | null;
      if (raw) await storage.setItem(parkedKey(copy.id, section), raw);
    }
    await saveIndex([...(await listParked(storage)).filter((c) => c.id !== copy.id), copy], storage);
  }
  await saveSyncState(EMPTY_SYNC_STATE, storage);
  for (const section of Object.keys(LOCAL_DATA)) await storage.removeItem(storageKey(section, 'real'));
}

type Envelope = { v: number; state: Record<string, unknown> };
async function readEnvelope(key: string, storage: Storage): Promise<Envelope | null> {
  const raw = (await storage.getItem(key)) as string | null;
  return raw ? (JSON.parse(raw) as Envelope) : null;
}

async function restoreSteps(copy: ParkedCopy, mode: 'restored' | 'added', storage: Storage): Promise<void> {
  if (mode === 'restored') {
    for (const section of Object.keys(LOCAL_DATA)) {
      const raw = (await storage.getItem(parkedKey(copy.id, section))) as string | null;
      if (raw) await storage.setItem(storageKey(section, 'real'), raw);
      else await storage.removeItem(storageKey(section, 'real'));
    }
    await saveSyncState(copy.sync, storage);
  } else {
    // Adding is the same however many times it runs (item by item, by id).
    for (const section of Object.keys(LOCAL_DATA)) {
      const there = await readEnvelope(parkedKey(copy.id, section), storage);
      if (!there) continue;
      const here = (await readEnvelope(storageKey(section, 'real'), storage)) ?? { v: DATA_FORMAT_VERSION, state: {} };
      for (const c of syncedCollections().filter((x) => x.section === section)) {
        const merged = toRecords(c.key, here.state[c.field]);
        for (const [rid, data] of toRecords(c.key, there.state?.[c.field])) if (!merged.has(rid)) merged.set(rid, data);
        const current = here.state[c.field] ?? (Array.isArray(there.state?.[c.field]) ? [] : undefined);
        here.state[c.field] = fromRecords(c.key, current, merged);
      }
      await storage.setItem(storageKey(section, 'real'), JSON.stringify(here));
    }
  }
  await removeParkedNow(copy.id, storage);
}

async function clearSteps(storage: Storage): Promise<void> {
  await saveSyncState(EMPTY_SYNC_STATE, storage);
  for (const section of Object.keys(LOCAL_DATA)) await storage.removeItem(storageKey(section, 'real'));
}

// Puts the phone's data aside and leaves the phone's own data empty (with
// nothing known about any account), ready for the signed-in account's data.
export function parkActiveData(meta: { origin: string | null; reason: ParkedReason }, storage: Storage = AsyncStorage): Promise<ParkedCopy> {
  return exclusively(async () => {
    const { owner, cursor, fingerprints, revs } = useSyncStore.getState();
    const copy: ParkedCopy = { id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...meta, parkedAt: new Date().toISOString(), records: countActiveRecords(), sync: { owner, cursor, fingerprints, revs } };
    await storage.setItem(DATA_OP_KEY, JSON.stringify({ op: 'park', copy } satisfies DataOp));
    await parkSteps(copy, storage, 'start');
    // Its reminders stop ringing on this phone (the copy keeps the items;
    // bringing it back schedules them again: signInFlow.bringBack). Saving
    // is stopped, so this only clears what's in memory.
    await wipeLocalData();
    await storage.removeItem(DATA_OP_KEY);
    return copy;
  }, storage);
}

// Brings a copy back. Onto an empty phone it returns exactly as it was (with
// what was known about its account); otherwise its items are added to what's
// here, item by item, and nothing here is replaced.
export function restoreParked(id: string, storage: Storage = AsyncStorage): Promise<'restored' | 'added'> {
  return exclusively(async () => {
    const copy = (await listParked(storage)).find((c) => c.id === id);
    if (!copy) throw new Error('That copy is no longer on this phone.');
    const mode = countActiveRecords() === 0 ? 'restored' : 'added';
    await storage.setItem(DATA_OP_KEY, JSON.stringify({ op: 'restore', id, mode } satisfies DataOp));
    await restoreSteps(copy, mode, storage);
    await storage.removeItem(DATA_OP_KEY);
    return mode;
  }, storage);
}

async function removeParkedNow(id: string, storage: Storage): Promise<void> {
  await saveIndex((await listParked(storage)).filter((c) => c.id !== id), storage);
  for (const section of Object.keys(LOCAL_DATA)) await storage.removeItem(parkedKey(id, section));
}

// Only when the person asks (Settings, after a clear warning).
export async function removeParked(id: string, storage: Storage = AsyncStorage): Promise<void> {
  await queue;
  await removeParkedNow(id, storage);
}

// Sign-out → "Remove my data from this phone" (offered only when all of it
// is in the account): clears the phone's own data and what was known about
// the account, with the same hold as a switch.
export function clearActiveData(storage: Storage = AsyncStorage): Promise<void> {
  return exclusively(async () => {
    await storage.setItem(DATA_OP_KEY, JSON.stringify({ op: 'clear' } satisfies DataOp));
    await wipeLocalData();
    await clearSteps(storage);
    await storage.removeItem(DATA_OP_KEY);
  }, storage);
}

// At start-up, before anything loads: if Ona was killed in the middle of one
// of the operations above, finish it, or (a copy that was never listed) undo
// it. Nothing anyone made is lost either way.
export async function recoverDataOperation(storage: Storage = AsyncStorage): Promise<DataOp['op'] | null> {
  let op: DataOp | null = null;
  try {
    const raw = (await storage.getItem(DATA_OP_KEY)) as string | null;
    op = raw ? (JSON.parse(raw) as DataOp) : null;
  } catch {
    op = null;
  }
  if (!op) return null;
  const listed = await listParked(storage);
  if (op.op === 'park') {
    const copy = op.copy;
    if (listed.some((c) => c.id === copy.id)) await parkSteps(copy, storage, 'listed');
    // Never listed: the phone's own sections were never touched. Undo.
    else for (const section of Object.keys(LOCAL_DATA)) await storage.removeItem(parkedKey(copy.id, section));
  } else if (op.op === 'restore') {
    const copy = listed.find((c) => c.id === (op as { id: string }).id);
    if (copy) await restoreSteps(copy, op.mode, storage);
    else for (const section of Object.keys(LOCAL_DATA)) await storage.removeItem(parkedKey(op.id, section));
  } else {
    await clearSteps(storage);
  }
  await storage.removeItem(DATA_OP_KEY);
  return op.op;
}

// For tests: write every pending save now, instead of waiting a fixed time.
export async function __flushForTests(): Promise<void> {
  await persistence?.flushAll();
  await new Promise((r) => setTimeout(r, 0)); // settings' own async write
}

// For tests: forget the saver (a fresh app start).
export function __resetForTests(): void {
  persistence?.stop();
  persistence = null;
  queue = Promise.resolve();
  setDataSpace('real');
}
