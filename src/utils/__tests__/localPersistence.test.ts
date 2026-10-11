// Every section's data is saved on the device and comes back after a restart.
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import type { StateStorage } from 'zustand/middleware';
import { hydrateLocalData, startLocalPersistence, storageKey } from '../localPersistence';
import { LOCAL_DATA, restoreSampleData, wipeLocalData } from '../localData';
import { useFeelingsStore } from '../../store/useFeelingsStore';
import { useHabitsStore } from '../../store/useHabitsStore';
import { useSleepStore } from '../../store/useSleepStore';
import { useDietStore } from '../../store/useDietStore';
import { useJournalStore } from '../../store/useJournalStore';

function memoryStorage() {
  const m = new Map<string, string>();
  const s: StateStorage & { m: Map<string, string> } = { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
  return s;
}

beforeEach(() => restoreSampleData());

test('changes are saved and come back after a restart', async () => {
  const storage = memoryStorage();
  const p = startLocalPersistence(storage, 5);
  useHabitsStore.getState().addHabit({ name: 'Stretch', targetDays: 30 });
  useDietStore.setState({ currency: 'EGP' });
  await p.flush();
  p.stop();
  expect(storage.m.has(storageKey('habits'))).toBe(true);

  // "Restart": the stores go back to how a fresh process starts.
  restoreSampleData();
  useDietStore.setState({ currency: 'USD' });
  expect(useHabitsStore.getState().habits.some((h) => h.name === 'Stretch')).toBe(false);

  const { restored } = await hydrateLocalData(storage, true);
  expect(restored).toEqual(expect.arrayContaining(['habits', 'dietPlanning']));
  expect(useHabitsStore.getState().habits.some((h) => h.name === 'Stretch')).toBe(true);
  expect(useDietStore.getState().currency).toBe('EGP');
});

test('writes happen shortly after a change, without waiting for a flush', async () => {
  const storage = memoryStorage();
  const p = startLocalPersistence(storage, 5);
  useFeelingsStore.getState().addCustomReasonTag('commute');
  await new Promise((r) => setTimeout(r, 30));
  expect(JSON.parse(storage.m.get(storageKey('feelings'))!).state.customReasonTags).toContain('commute');
  p.stop();
});

test('a release build starts empty on first launch; debug keeps the samples', async () => {
  await hydrateLocalData(memoryStorage(), true);
  expect(useJournalStore.getState().entries.length).toBeGreaterThan(0);

  await hydrateLocalData(memoryStorage(), false);
  for (const { store, keys } of Object.values(LOCAL_DATA)) {
    const state = store.getState() as Record<string, unknown>;
    for (const k of keys) {
      const v = state[k];
      if (Array.isArray(v)) expect(v).toEqual([]);
    }
  }
  // Section preferences keep their defaults.
  expect(useSleepStore.getState().windDownItems.length).toBeGreaterThan(0);
});

test('a damaged save is ignored instead of crashing', async () => {
  const storage = memoryStorage();
  storage.setItem(storageKey('journaling'), '{not json');
  await expect(hydrateLocalData(storage, true)).resolves.toBeDefined();
  expect(useJournalStore.getState().entries.length).toBeGreaterThan(0);
});

test('reminder ids are saved too, so reminders can still be cancelled after a restart', async () => {
  const storage = memoryStorage();
  const p = startLocalPersistence(storage, 5);
  useSleepStore.setState({ bedtime: { time: '22:30', enabled: true, notificationIds: ['n-1'] } });
  await p.flush();
  p.stop();
  useSleepStore.setState({ bedtime: { time: undefined, enabled: false, notificationIds: [] } });
  await hydrateLocalData(storage, true);
  expect(useSleepStore.getState().bedtime.notificationIds).toEqual(['n-1']);
});

test('"Delete data on this device" is saved as empty, so it stays deleted after a restart', async () => {
  const storage = memoryStorage();
  const p = startLocalPersistence(storage, 5);
  await wipeLocalData();
  await p.flush();
  p.stop();
  restoreSampleData();
  await hydrateLocalData(storage, true);
  expect(useJournalStore.getState().entries).toEqual([]);
  expect(useFeelingsStore.getState().entries).toEqual([]);
});
