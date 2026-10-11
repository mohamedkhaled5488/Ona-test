// Saves every section's data on the device and loads it back at startup, so
// nothing is lost when Ona closes. Works with or without an account.
//
// One storage entry per section (ona.data.<section>), written shortly after a
// change and straight away when Ona goes to the background. The sections and
// their keys come from LOCAL_DATA, the same registry export and "Delete data
// on this device" use.
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateStorage } from 'zustand/middleware';
import { INITIAL_PREFS, LOCAL_DATA, normalizeField } from './localData';
import { getDataSpace, spaceKey, type DataSpace } from './dataSpace';

export const DATA_FORMAT_VERSION = 1;
const WRITE_DELAY_MS = 400;

interface Envelope {
  v: number;
  state: Record<string, unknown>;
}

type Storage = Pick<StateStorage, 'getItem' | 'setItem'>;

// `ona.data.<section>` for the user's own data; Demo mode's live elsewhere (see dataSpace.ts).
export const storageKey = (section: string, space: DataSpace = getDataSpace()) => spaceKey(`ona.data.${section}`, space);

function savedKeys(section: string): string[] {
  const entry = LOCAL_DATA[section];
  return [...entry.keys, ...(entry.prefs ?? [])];
}

function pick(section: string): Record<string, unknown> {
  const state = LOCAL_DATA[section].store.getState() as Record<string, unknown>;
  return Object.fromEntries(savedKeys(section).map((k) => [k, state[k]]));
}

function emptyLike(value: unknown): unknown {
  if (Array.isArray(value)) return [];
  if (value && typeof value === 'object') return {};
  return null;
}

// Loads saved data into every store. On a first launch there is nothing
// saved: release builds start with empty sections, debug builds keep the
// built-in sample data so there's something to test with.
export async function hydrateLocalData(storage: Storage = AsyncStorage, keepSamplesOnFirstRun: boolean = __DEV__): Promise<{ restored: string[] }> {
  const restored: string[] = [];
  for (const [section, { store, keys }] of Object.entries(LOCAL_DATA)) {
    let raw: string | null = null;
    try {
      raw = (await storage.getItem(storageKey(section))) as string | null;
    } catch {
      raw = null;
    }
    if (raw) {
      try {
        const env = JSON.parse(raw) as Envelope;
        const allowed = new Set(savedKeys(section));
        // Preferences not in the saved copy start from the defaults, not from
        // whatever is in memory (which may belong to the other data space).
        const patch = {
          ...INITIAL_PREFS[section],
          ...Object.fromEntries(
            Object.entries(env.state ?? {})
              .filter(([k]) => allowed.has(k))
              .map(([k, v]) => [k, normalizeField(section, k, v)])
          ),
        };
        store.setState(patch);
        restored.push(section);
        continue;
      } catch {
        // A damaged entry is ignored rather than crashing; the section starts fresh.
      }
    }
    if (!keepSamplesOnFirstRun) {
      const state = store.getState() as Record<string, unknown>;
      store.setState({ ...INITIAL_PREFS[section], ...Object.fromEntries(keys.map((k) => [k, emptyLike(state[k])])) });
    }
  }
  return { restored };
}

async function write(section: string, storage: Storage, space: DataSpace): Promise<void> {
  // A saver belongs to one space. If the space has changed, the stores now
  // hold the other space's data: never write it under this space's keys.
  if (getDataSpace() !== space) return;
  const env: Envelope = { v: DATA_FORMAT_VERSION, state: pick(section) };
  try {
    await storage.setItem(storageKey(section, space), JSON.stringify(env));
  } catch (e) {
    if (__DEV__) console.warn(`[data] couldn't save ${section}`, e);
  }
}

// Call once, after hydrateLocalData(). Returns a stop function.
export function startLocalPersistence(
  storage: Storage = AsyncStorage,
  delayMs = WRITE_DELAY_MS
): { stop: () => void; flush: () => Promise<void>; flushAll: () => Promise<void> } {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const dirty = new Set<string>();
  const space = getDataSpace();

  const flushSection = (section: string) => {
    const t = timers.get(section);
    if (t) clearTimeout(t);
    timers.delete(section);
    dirty.delete(section);
    return write(section, storage, space);
  };
  const flush = async () => {
    await Promise.all([...dirty].map(flushSection));
  };

  const unsubs = Object.entries(LOCAL_DATA).map(([section, { store }]) =>
    (store as unknown as { subscribe: (fn: (s: Record<string, unknown>, p: Record<string, unknown>) => void) => () => void }).subscribe((s, prev) => {
      if (!savedKeys(section).some((k) => s[k] !== prev[k])) return;
      dirty.add(section);
      const existing = timers.get(section);
      if (existing) clearTimeout(existing);
      timers.set(section, setTimeout(() => void flushSection(section), delayMs));
    })
  );

  // Don't wait for the timer if Ona is about to be suspended or closed.
  const appState = AppState.addEventListener('change', (state) => {
    if (state !== 'active') void flush();
  });

  return {
    flush,
    // Every section, changed or not: what's in memory is saved as it is.
    flushAll: async () => {
      Object.keys(LOCAL_DATA).forEach((s) => dirty.add(s));
      await flush();
    },
    stop: () => {
      unsubs.forEach((u) => u());
      appState.remove();
      timers.forEach((t) => clearTimeout(t));
    },
  };
}
