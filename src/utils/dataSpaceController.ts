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
import { DEMO_META_KEY, SPACE_KEY, getDataSpace, isDemo, setDataSpace, spaceKey, type DataSpace } from './dataSpace';
import { hydrateLocalData, startLocalPersistence, storageKey, DATA_FORMAT_VERSION } from './localPersistence';
import { LOCAL_DATA } from './localData';
import { DEFAULT_SETTINGS, SETTINGS_KEY, SETTINGS_VERSION, migrateSettings, useSettingsStore, type SettingsData } from '../store/useSettingsStore';
import { syncInFlight } from '../sync/syncController';
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
}

// At app start. Reopens in Demo mode if that's where the app was; if the
// demo data isn't all there, falls back to the user's own data.
export async function startAppData(storage: Storage = AsyncStorage, keepSamplesOnFirstRun: boolean = __DEV__): Promise<DataSpace> {
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
  }
  return space;
}

export function switchDataSpace(target: DataSpace, storage: Storage = AsyncStorage): Promise<void> {
  const run = queue.then(async () => {
    if (target === getDataSpace()) return;
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

// For tests: forget the saver (a fresh app start).
export function __resetForTests(): void {
  persistence?.stop();
  persistence = null;
  queue = Promise.resolve();
  setDataSpace('real');
}
