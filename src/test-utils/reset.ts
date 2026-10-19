// A clean start for every test: no shared state between tests.
//
//   beforeEach(() => resetAll());
//
// Empties every section's store (the same registry export and "Delete data"
// use, so a new section is covered automatically), puts each section's
// preferences and the settings back to their defaults, clears the in-memory
// storage, and returns to your own data space with no saver running.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { INITIAL_PREFS, LOCAL_DATA } from '../utils/localData';
import { DEFAULT_SETTINGS, useSettingsStore } from '../store/useSettingsStore';
import { __resetForTests } from '../utils/dataSpaceController';
import { resetClock } from '../utils/clock';

function emptyLike(value: unknown): unknown {
  if (Array.isArray(value)) return [];
  if (value && typeof value === 'object') return {};
  return value;
}

export async function resetAll(): Promise<void> {
  __resetForTests();
  resetClock();
  for (const [section, { store, keys }] of Object.entries(LOCAL_DATA)) {
    const state = store.getState() as Record<string, unknown>;
    store.setState({ ...JSON.parse(JSON.stringify(INITIAL_PREFS[section] ?? {})), ...Object.fromEntries(keys.map((k) => [k, emptyLike(state[k])])) });
  }
  useSettingsStore.setState(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
  await AsyncStorage.clear();
}
