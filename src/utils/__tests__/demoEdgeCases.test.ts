// Demo mode, stage 5: edge cases. Entering the demo from every kind of
// starting point (no account, a trial, an expired trial, offline, PIN and
// app lock on, large text, dark theme), restarting in it, account actions in
// it, dates around midnight and daylight saving, what a bug report says, and
// a whole session that must not touch the network, the real data, the PINs or
// the real reminders.
// These build the full 8-week sample set; give them room on a slow, busy
// machine (a coverage run) instead of the default 5 seconds.
jest.setTimeout(20_000);


const mockNetwork: string[] = [];
const mockScheduled: unknown[] = [];
const mockCancelled: string[] = [];
const mockPin = { hasPin: jest.fn(async () => true), setPin: jest.fn(), verifyPin: jest.fn(), clearPin: jest.fn() };
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: async () => ({ granted: true }),
  requestPermissionsAsync: async () => ({ granted: true }),
  scheduleNotificationAsync: async (req: unknown) => {
    mockScheduled.push(req);
    return `n-${mockScheduled.length}`;
  },
  cancelScheduledNotificationAsync: async (id: string) => void mockCancelled.push(id),
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', WEEKLY: 'weekly' },
  setNotificationChannelAsync: async () => {},
  setNotificationHandler: () => {},
}));
jest.mock('../pinLock', () => ({ ...jest.requireActual('../pinLock'), ...mockPin }));
jest.mock('../../lib/supabase', () => {
  const record = (what: string) => (..._a: unknown[]) => {
    mockNetwork.push(what);
    return Promise.resolve({ data: { user: null, session: null }, error: null });
  };
  return {
    isSupabaseConfigured: true,
    supabaseUrl: 'https://example.supabase.co',
    supabase: {
      from: () => ({ select: record('select'), upsert: record('upsert') }),
      rpc: record('rpc'),
      auth: {
        signInWithPassword: record('auth'),
        signUp: record('auth'),
        signOut: record('auth'),
        signInWithIdToken: record('auth'),
        updateUser: record('auth'),
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
    },
  };
});
let mockOnline = true;
jest.mock('../network', () => ({ isOnline: async () => mockOnline }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { SPACE_KEY, isDemo } from '../dataSpace';
import { CARRIED_INTO_DEMO, __flushForTests, __resetForTests, startAppData, switchDataSpace } from '../dataSpaceController';
import { LOCAL_DATA, buildExport, wipeLocalData } from '../localData';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useDailyPlanningStore } from '../../store/useDailyPlanningStore';
import { useEntitlementStore } from '../../store/useEntitlementStore';
import { useAuthStore } from '../../store/useAuthStore';
import { currentSyncGate, syncNow } from '../../sync/syncController';
import { refreshEntitlement } from '../entitlementSync';
import { setAnalyticsTransport, track } from '../analytics';
import { generateDemoData } from '../../demo/generate';
import { diagnostics } from '../diagnostics';
import { todayISO } from '../date';
import type { FeelingCheckIn, DailyTask } from '../../types/sections';
import type { EntitlementSnapshot } from '../entitlement';
import { useClock, restoreClock } from '../../test-utils';

// A fixed time, so nothing here depends on the real date (see src/test-utils/time.ts).
beforeEach(() => {
  useClock('2026-10-18T12:00');
});
afterEach(() => restoreClock());

const storage = AsyncStorage as unknown as { getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void>; getAllKeys: () => Promise<string[]>; clear: () => Promise<void> };
const fs = require('fs') as { readFileSync: (p: string, e: string) => string };
const path = require('path') as { join: (...p: string[]) => string };

async function realDump(): Promise<string> {
  const keys = (await storage.getAllKeys()).filter((k) => !k.startsWith('ona.demo.') && k !== SPACE_KEY).sort();
  return JSON.stringify(await Promise.all(keys.map(async (k) => [k, await storage.getItem(k)])));
}


// Which storage keys changed between two dumps (a readable failure message
// instead of two giant strings): key, then the first difference.
function changedKeys(before: string, after: string): string[] {
  const a = new Map(JSON.parse(before) as [string, string | null][]);
  const b = new Map(JSON.parse(after) as [string, string | null][]);
  const keys = [...new Set([...a.keys(), ...b.keys()])].sort();
  return keys
    .filter((k) => a.get(k) !== b.get(k))
    .map((k) => {
      const x = a.get(k) ?? '(missing)';
      const y = b.get(k) ?? '(missing)';
      let i = 0;
      while (i < x.length && x[i] === y[i]) i++;
      return `${k}: was …${x.slice(Math.max(0, i - 40), i + 60)}… now …${y.slice(Math.max(0, i - 40), i + 60)}…`;
    });
}

const HOUR = 3_600_000;
const snapshot = (userId: string, trialEndsInMs: number): EntitlementSnapshot => ({
  userId,
  serverTime: new Date().toISOString(),
  fetchedAt: Date.now(),
  trial: { startedAt: new Date(Date.now() - 20 * 24 * HOUR).toISOString(), endsAt: new Date(Date.now() + trialEndsInMs).toISOString() },
  subscription: null,
});

async function realUser(opts: { session?: string; trialEndsInMs?: number } = {}) {
  await startAppData(storage as never, false);
  useDailyPlanningStore.getState().addTask(todayISO(), 'Real task with an alarm', { scheduledTime: '23:59', reminders: [{ id: 'r', minutesBefore: 0 }] });
  if (opts.session) {
    useAuthStore.setState({ session: { user: { id: opts.session } } as never });
    if (opts.trialEndsInMs !== undefined) useEntitlementStore.getState().saveSnapshot(snapshot(opts.session, opts.trialEndsInMs));
  }
  await __flushForTests();
}

// Everything a curious person might do in the demo.
async function aDemoSession() {
  useDailyPlanningStore.getState().addTask(todayISO(), 'Demo task', { scheduledTime: '23:58', reminders: [{ id: 'r', minutesBefore: 0 }] });
  for (const { store, keys } of Object.values(LOCAL_DATA)) {
    const state = store.getState() as Record<string, unknown>;
    store.setState(Object.fromEntries(keys.filter((k) => Array.isArray(state[k])).map((k) => [k, (state[k] as unknown[]).slice(1)])));
  }
  useSettingsStore.getState().set('theme', 'light');
  useSettingsStore.getState().setConsent({ storeData: true, analytics: true });
  await syncNow();
  track('signup');
  await refreshEntitlement('u1', { fetch: jest.fn(), startTrial: jest.fn() } as never);
  await useAuthStore.getState().signOut();
  await useAuthStore.getState().deleteAccount(false);
  await useDailyPlanningStore.getState().resyncAllReminders();
  await __flushForTests();
}

let fetchSpy: jest.SpyInstance;
beforeEach(async () => {
  await storage.clear();
  __resetForTests();
  mockNetwork.length = 0;
  mockScheduled.length = 0;
  mockCancelled.length = 0;
  mockOnline = true;
  Object.values(mockPin).forEach((f) => f.mockClear());
  useAuthStore.setState({ session: null, error: null });
  useEntitlementStore.setState({ snapshots: {} });
  fetchSpy = jest.spyOn(globalThis, 'fetch' as never).mockImplementation((() => Promise.reject(new Error('no network in tests'))) as never);
  setAnalyticsTransport(() => mockNetwork.push('analytics'));
});
afterEach(() => {
  fetchSpy.mockRestore();
  setAnalyticsTransport(null);
});

describe.each([
  ['no account', {}],
  ['an account on a trial', { session: 'u-trial', trialEndsInMs: 10 * 24 * HOUR }],
  ['an account whose trial has ended', { session: 'u-expired', trialEndsInMs: -2 * 24 * HOUR }],
])('entering with %s', (_label, opts) => {
  // Builds the full 8-week sample set: allow for a slow, busy machine (coverage runs).
  test('a whole demo session: no network, no reminders, real data and account state untouched', async () => {
    await realUser(opts);
    const scheduledBefore = mockScheduled.length;
    const entitlementBefore = JSON.stringify(useEntitlementStore.getState().snapshots);
    const sessionBefore = useAuthStore.getState().session;

    await switchDataSpace('demo');
    const realBefore = await realDump(); // the real storage as it was left
    expect(currentSyncGate()).toMatchObject({ allowed: false, reason: 'demo' });
    await aDemoSession();
    await switchDataSpace('real');

    expect(changedKeys(realBefore, await realDump())).toEqual([]);
    expect(mockNetwork).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockScheduled.length).toBe(scheduledBefore);
    expect(mockCancelled).toEqual([]);
    expect(JSON.stringify(useEntitlementStore.getState().snapshots)).toBe(entitlementBefore);
    expect(useAuthStore.getState().session).toBe(sessionBefore); // still signed in, as before
    expect(useDailyPlanningStore.getState().tasks.some((t: DailyTask) => t.title === 'Real task with an alarm')).toBe(true);
  });
});

test('the plan state shown in demo is a neutral free plan, never the account\'s', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'src/hooks/useEntitlement.ts'), 'utf8');
  expect(src).toMatch(/if \(demo\) return \{ \.\.\.computeEntitlement\(null, now\), loading: false \};/);
});

test('offline: entering and leaving need no connection', async () => {
  mockOnline = false;
  await realUser();
  await switchDataSpace('demo');
  expect(isDemo()).toBe(true);
  await switchDataSpace('real');
  expect(isDemo()).toBe(false);
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('PIN and app lock on: the demo has neither, the PINs are never read or changed, and they\'re back after', async () => {
  await realUser();
  useSettingsStore.getState().set('journalLock', true);
  useSettingsStore.getState().set('appLock', true);
  await switchDataSpace('demo');
  expect(useSettingsStore.getState()).toMatchObject({ journalLock: false, appLock: false });
  await switchDataSpace('real');
  expect(useSettingsStore.getState()).toMatchObject({ journalLock: true, appLock: true });
  for (const fn of Object.values(mockPin)) expect(fn).not.toHaveBeenCalled();
});

test('large text and dark theme come along into the demo; demo changes never go back', async () => {
  await realUser();
  useSettingsStore.getState().set('textSize', 'xlarge' as never);
  useSettingsStore.getState().set('theme', 'dark');
  useSettingsStore.getState().set('weekStartsOn', 6);
  await switchDataSpace('demo');
  expect(useSettingsStore.getState()).toMatchObject({ textSize: 'xlarge', theme: 'dark', weekStartsOn: 6 });
  useSettingsStore.getState().set('theme', 'light');
  useSettingsStore.getState().set('textSize', 'small' as never);
  await switchDataSpace('real');
  expect(useSettingsStore.getState()).toMatchObject({ textSize: 'xlarge', theme: 'dark' });
  expect([...CARRIED_INTO_DEMO]).toEqual(['theme', 'accent', 'textSize', 'timeFormat', 'weekStartsOn', 'haptics']);
});

describe('restarting', () => {
  test('a damaged space marker falls back to the real data', async () => {
    await realUser();
    await switchDataSpace('demo');
    await storage.setItem(SPACE_KEY, 'something-else');
    __resetForTests();
    expect(await startAppData(storage as never, false)).toBe('real');
    expect(useDailyPlanningStore.getState().tasks.some((t: DailyTask) => t.title === 'Real task with an alarm')).toBe(true);
  });

  test('killed in the middle of the demo, it comes back in the demo, banner and all', async () => {
    await realUser();
    await switchDataSpace('demo');
    __resetForTests();
    expect(await startAppData(storage as never, false)).toBe('demo');
    expect(isDemo()).toBe(true);
  });
});

describe('the demo\'s own data tools only touch demo data', () => {
  test('"Delete data on this device" in demo empties the demo, not yours', async () => {
    await realUser();
    await switchDataSpace('demo');
    const realBefore = await realDump();
    await wipeLocalData();
    await __flushForTests();
    expect(useDailyPlanningStore.getState().tasks).toEqual([]);
    await switchDataSpace('real');
    expect(changedKeys(realBefore, await realDump())).toEqual([]);
    expect(useDailyPlanningStore.getState().tasks.length).toBeGreaterThan(0);
  });

  test('exporting in demo exports the sample data, never yours', async () => {
    await realUser();
    await switchDataSpace('demo');
    const json = JSON.stringify(buildExport());
    expect(json).not.toContain('Real task with an alarm');
    expect(json).toContain('Prepare slides for the team update');
  });
});

describe('dates around midnight and daylight saving (New York, as these tests run)', () => {
  const IMAGES = { sketchEarly: 'a', sketchLatest: 'b', bookPage: 'c', practiceNotes: 'd' };
  test.each([
    ['2026-03-08', 0, 30], // spring forward
    ['2026-03-08', 23, 30],
    ['2026-11-01', 1, 30], // fall back (01:30 happens twice)
    ['2026-11-01', 23, 59],
    ['2026-03-31', 0, 1], // month end, just after midnight
  ])('%s at %i:%i: every feeling sits on its own local day, nothing in the future', (today, h, m) => {
    const [y, mo, d] = today.split('-').map(Number);
    const now = new Date(y, mo - 1, d, h, m).getTime();
    const data = generateDemoData({ today, now, images: IMAGES });
    const entries = data.feelings.entries as FeelingCheckIn[];
    for (const e of entries) {
      const local = new Date(e.createdAt);
      const localDay = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
      expect({ id: e.id, day: localDay }).toEqual({ id: e.id, day: e.date });
      expect(Date.parse(e.createdAt)).toBeLessThanOrEqual(now);
    }
  });
});

describe('bug reports', () => {
  test('say when Demo mode was on, and carry nothing from the data', async () => {
    await realUser();
    expect(diagnostics()).not.toMatch(/Demo/);
    await switchDataSpace('demo');
    const report = diagnostics();
    expect(report).toMatch(/Mode: Demo \(sample data\)/);
    expect(report).not.toMatch(/Prepare slides|Real task|Morning walk|Guitar/);
  });
});

describe('accessibility of the banner', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'src/demo/DemoBanner.tsx'), 'utf8');
  test('read out by screen readers, with a reachable Exit button', () => {
    expect(src).toMatch(/accessibilityLabel="Demo mode\. You are looking at sample data\. Your own data is untouched\."/);
    expect(src).toMatch(/accessibilityRole="button"\s*accessibilityLabel="Exit demo"/);
    expect(src).toMatch(/minHeight: 30/);
    expect(src).toMatch(/hitSlop=\{8\}/);
  });
  test('it sits above the app, never over it', () => {
    expect(src).not.toMatch(/position: 'absolute'/);
    expect(src).toMatch(/SafeAreaInsetsContext\.Provider value=\{\{ \.\.\.insets, top: 0 \}\}/);
  });
});
