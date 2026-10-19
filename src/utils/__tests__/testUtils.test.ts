// The test helpers themselves: the clock really controls "today", time zones
// really change, DST dates are right, and a reset really leaves nothing behind.
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DST_2026, TEST_ZONE, makeCheckIn, makeTask, prepareZones, resetAll, restoreClock, useClock } from '../../test-utils';
import { todayISO } from '../date';
import { now } from '../clock';
import { useDailyPlanningStore } from '../../store/useDailyPlanningStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { LOCAL_DATA } from '../localData';

afterEach(() => restoreClock());

describe('the clock', () => {
  test('sets "today" for the app and for Date itself', () => {
    const clock = useClock('2026-10-18T23:59');
    expect(todayISO()).toBe('2026-10-18');
    expect(new Date().getDate()).toBe(18);
    clock.advance(2 * 60_000); // past midnight
    expect(todayISO()).toBe('2026-10-19');
    expect(now()).toBe(Date.now());
    clock.set('2028-02-29T12:00');
    expect(todayISO()).toBe('2028-02-29');
  });

  test('timers and awaits still work while it is set', async () => {
    useClock('2026-10-18T09:00');
    await new Promise((r) => setTimeout(r, 5));
    expect(todayISO()).toBe('2026-10-18');
  });

  test('restoring gives back the real time', () => {
    useClock('2001-01-01T00:00');
    restoreClock();
    expect(new Date().getFullYear()).toBeGreaterThan(2001);
  });
});

describe('time zones and DST', () => {
  test('the workers run in the DST zone, and the 2026 change dates are right', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(TEST_ZONE);
    // On the start date the day is 23 hours long; on the end date, 25.
    const len = (d: string) => (new Date(`${d}T00:00:00`).getTime() - new Date(`${d}T00:00:00`).setDate(new Date(`${d}T00:00:00`).getDate() - 1)) / 3_600_000;
    expect(len('2026-03-09')).toBe(23);
    expect(len('2026-11-02')).toBe(25);
    expect(DST_2026).toEqual({ start: '2026-03-08', end: '2026-11-01' });
  });

  test('code can be run in any time zone', () => {
    const z = prepareZones(['clock', 'date']);
    expect(z.run('Asia/Kolkata', 'return Intl.DateTimeFormat().resolvedOptions().timeZone')).toMatch(/^Asia\/(Kolkata|Calcutta)$/); // Node may use the old name
    expect(z.run('Pacific/Auckland', 'return m.date.addDaysISO("2026-04-05", 1)')).toBe('2026-04-06'); // Auckland DST ends that day
  });
});

describe('a clean start', () => {
  test('resetAll empties every section, the settings and storage', async () => {
    useDailyPlanningStore.getState().addTask('2026-10-18', 'leftover');
    useSettingsStore.getState().set('theme', 'dark');
    await AsyncStorage.setItem('ona.data.dailyPlanning', 'x');
    await resetAll();
    for (const { store, keys } of Object.values(LOCAL_DATA)) {
      const state = store.getState() as Record<string, unknown>;
      for (const k of keys) {
        const v = state[k];
        if (Array.isArray(v)) expect(v).toEqual([]);
      }
    }
    expect(useSettingsStore.getState().theme).not.toBe('dark');
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });

  test('factories make valid records with unique ids and no real clock', () => {
    const a = makeTask();
    const b = makeTask({ title: 'b' });
    expect(a.id).not.toBe(b.id);
    expect(makeCheckIn({ date: '2026-03-08', hour: 2 }).completedAt).toBe(new Date(2026, 2, 8, 2).toISOString());
  });
});
