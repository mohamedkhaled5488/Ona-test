// Demo mode, stage 1: isolation. The hard rule is that demo data never
// touches the user's real data. These tests fill the real data, enter the
// demo, change things in every section and in settings, leave, and check the
// real storage is byte-for-byte what it was. They also check that nothing
// leaves the phone while in demo: no sync, account calls, purchases,
// analytics or notifications.

// --- outside world, recorded --------------------------------------------------
const mockNetwork: string[] = [];
const mockScheduled: unknown[] = [];
const mockCancelled: string[] = [];
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
jest.mock('../../lib/supabase', () => {
  const record = (what: string) => (..._args: unknown[]) => {
    mockNetwork.push(what);
    return Promise.resolve({ data: { user: null, session: null }, error: null });
  };
  const query: Record<string, unknown> = {};
  for (const m of ['select', 'gt', 'order', 'limit', 'eq']) query[m] = () => query;
  (query as { then: unknown }).then = (resolve: (v: unknown) => void) => {
    mockNetwork.push('from.select');
    resolve({ data: [], error: null });
  };
  return {
    isSupabaseConfigured: true,
    supabaseUrl: 'https://example.supabase.co',
    supabase: {
      from: () => ({ ...query, upsert: record('from.upsert') }),
      rpc: record('rpc'),
      auth: {
        signInWithPassword: record('auth.signIn'),
        signUp: record('auth.signUp'),
        signOut: record('auth.signOut'),
        signInWithIdToken: record('auth.idToken'),
        updateUser: record('auth.updateUser'),
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
    },
  };
});
jest.mock('../network', () => ({ isOnline: async () => true }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEMO_META_KEY, SPACE_KEY, getDataSpace, isDemo, setDataSpace } from '../dataSpace';
import { __flushForTests, __resetForTests, readDemoMeta, resetDemoData, startAppData, switchDataSpace } from '../dataSpaceController';
import { LOCAL_DATA } from '../localData';
import { storageKey, startLocalPersistence } from '../localPersistence';
import { useSettingsStore, SETTINGS_KEY } from '../../store/useSettingsStore';
import { useDailyPlanningStore } from '../../store/useDailyPlanningStore';
import { useFeelingsStore } from '../../store/useFeelingsStore';
import { useJournalStore } from '../../store/useJournalStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useAccountStore } from '../../store/useAccountStore';
import { usePaywallStore } from '../../store/usePaywallStore';
import { cancelReminders, scheduleAt, scheduleReminder, scheduleWeeklyStoryReminder, sendTestNotification } from '../notifications';
import { setAnalyticsTransport, track, type OutgoingEvent } from '../analytics';
import { currentSyncGate, localData, supabaseSyncServer, syncNow } from '../../sync/syncController';
import { refreshEntitlement } from '../entitlementSync';
import { runPurchase, runRestore, DEMO_PURCHASE_MESSAGE } from '../../billing/purchaseFlow';
import { demoSeed } from '../../demo/demoData';
import { todayISO } from '../date';

const storage = AsyncStorage as unknown as { getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void>; removeItem: (k: string) => Promise<void>; getAllKeys: () => Promise<string[]>; clear: () => Promise<void> };

// Every key and value, sorted: the "checksum" of a storage.
async function dump(filter: (k: string) => boolean = () => true): Promise<string> {
  const keys = (await storage.getAllKeys()).filter(filter).sort();
  const pairs: [string, string | null][] = [];
  for (const k of keys) pairs.push([k, await storage.getItem(k)]);
  return JSON.stringify(pairs);
}
const realKeys = (k: string) => !k.startsWith('ona.demo.') && k !== SPACE_KEY;

const sectionState = () =>
  JSON.stringify(Object.fromEntries(Object.entries(LOCAL_DATA).map(([s, { store, keys }]) => [s, Object.fromEntries(keys.map((k) => [k, (store.getState() as Record<string, unknown>)[k]]))])));

// The user's own data, as if they'd used Ona for a while.
async function fillRealData() {
  await startAppData(storage, true);
  useDailyPlanningStore.getState().addTask(todayISO(), 'My real task', { scheduledTime: '09:00', reminders: [{ id: 'r', minutesBefore: 10 }] });
  useFeelingsStore.getState().addEntry('calm', ['content'], { content: 3 }, ['Work']);
  useSettingsStore.getState().set('theme', 'light');
  useSettingsStore.getState().set('journalLock', true);
  useSettingsStore.getState().set('appLock', true);
  useSettingsStore.getState().setConsent({ storeData: true, analytics: true });
  // Let saving catch up.
  await switchDataSpace('real');
  await __flushForTests();
}

// Changes to every section while in demo: add, edit, delete.
function changeEverything() {
  for (const { store, keys } of Object.values(LOCAL_DATA)) {
    const state = store.getState() as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const k of keys) {
      const v = state[k];
      if (Array.isArray(v)) patch[k] = v.length ? v.slice(1) : [{ id: `demo-added-${k}` }]; // delete one, or add one
      else if (v && typeof v === 'object') patch[k] = { ...v, demoEdited: true };
    }
    store.setState(patch);
  }
  useDailyPlanningStore.getState().addTask(todayISO(), 'Demo-only task');
  useSettingsStore.getState().set('theme', 'dark');
  useSettingsStore.getState().set('weekStartsOn', 6);
}

beforeEach(async () => {
  await storage.clear();
  __resetForTests();
  mockNetwork.length = 0;
  mockScheduled.length = 0;
  mockCancelled.length = 0;
});
afterEach(() => setAnalyticsTransport(null));

describe('isolation of the data', () => {
  test('enter demo, change every section and settings, exit: the real storage is byte-for-byte the same', async () => {
    await fillRealData();
    const realInMemory = sectionState();
    const realSettings = JSON.stringify(useSettingsStore.getState());

    await switchDataSpace('demo');
    expect(isDemo()).toBe(true);
    // The real storage as it was left (entering saves every section first).
    const before = await dump(realKeys);
    expect(before).toContain('My real task');
    changeEverything();
    await __flushForTests(); // demo saves happen
    await switchDataSpace('real');

    expect(await dump(realKeys)).toBe(before);
    expect(sectionState()).toBe(realInMemory);
    expect(JSON.stringify(useSettingsStore.getState())).toBe(realSettings);
    expect(await dump()).toContain('Demo-only task'); // ...kept in the demo's own keys
  });

  test('everything written while in demo goes to demo keys only', async () => {
    await fillRealData();
    const written: string[] = [];
    const original = storage.setItem;
    storage.setItem = async (k: string, v: string) => {
      if (isDemo()) written.push(k);
      return original(k, v);
    };
    await switchDataSpace('demo');
    changeEverything();
    await __flushForTests();
    storage.setItem = original;
    expect(written.length).toBeGreaterThan(5);
    for (const k of written) expect(k.startsWith('ona.demo.') || k === SPACE_KEY).toBe(true);
  });

  test('a save still waiting when you enter the demo lands in your own data, not the demo', async () => {
    await fillRealData();
    useDailyPlanningStore.getState().addTask(todayISO(), 'Typed just before entering demo');
    await switchDataSpace('demo'); // before the 400 ms save delay
    const real = await storage.getItem(storageKey('dailyPlanning', 'real'));
    const demo = await storage.getItem(storageKey('dailyPlanning', 'demo'));
    expect(real).toContain('Typed just before entering demo');
    expect(demo).not.toContain('Typed just before entering demo');
  });

  test('a saver from one space never writes after the space has changed', async () => {
    await storage.setItem(storageKey('journaling', 'real'), JSON.stringify({ v: 1, state: { entries: [] } }));
    const saver = startLocalPersistence(storage, 50);
    useJournalStore.setState({ entries: [] });
    setDataSpace('demo'); // as if the switch skipped stopping it
    useJournalStore.setState({ entries: [{ id: 'leak' }] as never });
    await saver.flush();
    await new Promise((r) => setTimeout(r, 100));
    saver.stop();
    expect(await storage.getItem(storageKey('journaling', 'real'))).not.toContain('leak');
    expect(await storage.getItem(storageKey('journaling', 'demo'))).toBeNull();
  });

  test('the demo has its own settings: no PIN, no app lock, no consents', async () => {
    await fillRealData();
    await switchDataSpace('demo');
    const s = useSettingsStore.getState();
    expect(s).toMatchObject({ journalLock: false, appLock: false, consent: { storeData: false, analytics: false, tips: false } });
    // Appearance is the one thing carried in (see the edge-case tests).
    expect(s.theme).toBe('light');
    await switchDataSpace('real');
    expect(useSettingsStore.getState()).toMatchObject({ journalLock: true, appLock: true, theme: 'light', consent: { storeData: true, analytics: true } });
  });

  test('the account, entitlement and sync state are never switched or written in demo', async () => {
    await fillRealData();
    const accountBefore = await storage.getItem('ona.account');
    await switchDataSpace('demo');
    changeEverything();
    await switchDataSpace('real');
    expect(await storage.getItem('ona.account')).toBe(accountBefore);
    expect((await storage.getAllKeys()).filter((k) => k.startsWith('ona.demo.') && /account|entitlement|sync/.test(k))).toEqual([]);
  });

  test('switches run one at a time', async () => {
    await fillRealData();
    await Promise.all([switchDataSpace('demo'), switchDataSpace('real'), switchDataSpace('demo')]);
    expect(getDataSpace()).toBe('demo');
    expect(await storage.getItem(SPACE_KEY)).toBe('demo');
  });
});

describe('restarting', () => {
  test('a restart in demo reopens in demo, with the demo data', async () => {
    await fillRealData();
    await switchDataSpace('demo');
    useDailyPlanningStore.getState().addTask(todayISO(), 'Demo task before restart');
    await switchDataSpace('demo'); // no-op
    await __flushForTests();
    __resetForTests(); // the app is killed
    expect(await startAppData(storage, false)).toBe('demo');
    expect(useDailyPlanningStore.getState().tasks.some((t) => t.title === 'Demo task before restart')).toBe(true);
    expect(useSettingsStore.getState().journalLock).toBe(false);
  });

  test('if the demo data is missing or damaged, it falls back to the real data', async () => {
    await fillRealData();
    await storage.setItem(SPACE_KEY, 'demo'); // but no demo meta
    __resetForTests();
    expect(await startAppData(storage, false)).toBe('real');
    expect(await storage.getItem(SPACE_KEY)).toBe('real');
    expect(useDailyPlanningStore.getState().tasks.some((t) => t.title === 'My real task')).toBe(true);
  });
});

describe('demo data', () => {
  test('first entry seeds the sample set and records its seed', async () => {
    await fillRealData();
    await switchDataSpace('demo');
    const meta = await readDemoMeta(storage);
    expect(meta).toMatchObject({ seed: 'ona-demo-1', noteSeen: false, tourDone: false, createdFor: todayISO() });
    expect(useDailyPlanningStore.getState().tasks.some((t) => t.title === 'My real task')).toBe(false);
  });

  test('the same seed gives the same data', () => {
    const at = new Date(2026, 9, 11, 15, 0).getTime();
    const images = { sketchEarly: 'a', sketchLatest: 'b', bookPage: 'c', practiceNotes: 'd' };
    expect(JSON.stringify(demoSeed('2026-10-11', images, 'EUR', at))).toBe(JSON.stringify(demoSeed('2026-10-11', images, 'EUR', at)));
  });

  test('"Reset demo data" restores the original set and leaves real data alone', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.now()); // the same moment, so today's sample times match
    await fillRealData();
    await switchDataSpace('demo');
    const before = await dump(realKeys);
    const seeded = sectionState();
    changeEverything();
    await resetDemoData(storage);
    expect(sectionState()).toBe(seeded);
    expect(await dump(realKeys)).toBe(before);
    expect(isDemo()).toBe(true);
    jest.restoreAllMocks();
  });
});

describe('nothing leaves the phone in demo', () => {
  test('sync is blocked at the gate, and the server can\'t be reached even directly', async () => {
    await fillRealData();
    useAuthStore.setState({ session: { user: { id: 'u1' } } as never });
    await switchDataSpace('demo');
    const gate = currentSyncGate();
    expect(gate).toMatchObject({ allowed: false, reason: 'demo' });
    expect(await syncNow()).toMatchObject({ ok: false });
    await expect(supabaseSyncServer('u1').push([])).rejects.toThrow(/Demo mode/);
    await expect(supabaseSyncServer('u1').pull(null, 10)).rejects.toThrow(/Demo mode/);
    expect(() => localData.write('dailyPlanning.tasks', [])).toThrow(/Demo mode/);
    expect(mockNetwork).toEqual([]);
    useAuthStore.setState({ session: null });
  });

  test('account actions are refused without calling the server', async () => {
    await fillRealData();
    await switchDataSpace('demo');
    const auth = useAuthStore.getState();
    expect(await auth.signIn('a@b.co', 'x')).toBe(false);
    expect(await auth.signUp('a@b.co', 'x', { storeData: true, analytics: true, tips: true })).toBe(false);
    expect(await auth.signInWithGoogle({})).toMatchObject({ ok: false });
    await auth.signOut();
    expect(useAuthStore.getState().error).toMatch(/Demo mode/);
    expect(await auth.deleteAccount(true)).toMatchObject({ ok: false });
    expect(await auth.updateEmail('x@y.z')).toMatchObject({ ok: false });
    expect(await auth.withdrawStoreDataConsent(true)).toMatchObject({ ok: false });
    expect(mockNetwork).toEqual([]);
  });

  test('the entitlement isn\'t refreshed, purchases are off and the paywall never opens', async () => {
    await fillRealData();
    await switchDataSpace('demo');
    const server = { fetch: jest.fn(), startTrial: jest.fn() };
    expect(await refreshEntitlement('u1', server as never)).toBe(false);
    expect(server.fetch).not.toHaveBeenCalled();
    const client = { purchase: jest.fn(), restore: jest.fn() };
    const deps = { client, track: jest.fn(), refreshEntitlement: jest.fn(), hasAccess: () => false, setPending: jest.fn(), country: undefined, now: Date.now } as never;
    expect(await runPurchase({ role: 'annual' } as never, deps)).toEqual({ message: DEMO_PURCHASE_MESSAGE, outcome: 'demo' });
    expect(await runRestore(deps)).toBe(DEMO_PURCHASE_MESSAGE);
    expect(client.purchase).not.toHaveBeenCalled();
    expect(client.restore).not.toHaveBeenCalled();
    expect(usePaywallStore.getState().open('syncTapped' as never)).toBe(false);
  });

  test('no analytics events, even with analytics allowed in the demo\'s settings', async () => {
    await fillRealData();
    await switchDataSpace('demo');
    useSettingsStore.getState().setConsent({ analytics: true });
    const sent: OutgoingEvent[] = [];
    setAnalyticsTransport((e) => sent.push(e));
    track('signup');
    track('paywall_viewed');
    expect(sent).toEqual([]);
    // ...and in the real space, the same call does send (the test can see it).
    await switchDataSpace('real');
    track('signup');
    expect(sent.map((e) => e.name)).toEqual(['signup']);
  });

  test('no notifications are scheduled in demo, and real ones are never cancelled', async () => {
    await fillRealData();
    const realIds = useDailyPlanningStore.getState().tasks.flatMap((t) => t.notificationIds);
    await switchDataSpace('demo');
    mockScheduled.length = 0;
    expect(await scheduleReminder({ feature: 'tasks', title: 'x', date: '2099-01-01', scheduledTime: '09:00', minutesBefore: 0, repeat: 'none' })).toEqual([]);
    expect(await scheduleAt(new Date(Date.now() + 3_600_000), 'studyEnd', 'x', 'y')).toEqual([]);
    expect(await scheduleWeeklyStoryReminder(1)).toEqual([]);
    expect(await sendTestNotification()).toBe(false);
    useDailyPlanningStore.getState().addTask(todayISO(), 'Demo alarm', { scheduledTime: '23:59', reminders: [{ id: 'r', minutesBefore: 0 }] });
    await useDailyPlanningStore.getState().resyncAllReminders();
    await cancelReminders(['anything', ...realIds]);
    expect(mockScheduled).toEqual([]);
    expect(mockCancelled).toEqual([]);
    // Back home, the real task still has its reminder ids.
    await switchDataSpace('real');
    expect(useDailyPlanningStore.getState().tasks.flatMap((t) => t.notificationIds)).toEqual(realIds);
  });

  test('the account store is never written while in demo', async () => {
    await fillRealData();
    await switchDataSpace('demo');
    const before = await storage.getItem('ona.account');
    await syncNow();
    expect(await storage.getItem('ona.account')).toBe(before);
    expect(useAccountStore.getState().lastSyncedAt).toBeUndefined();
  });
});

describe('the code paths themselves', () => {
  const fs = require('fs') as { readFileSync: (p: string, e: string) => string; readdirSync: (p: string, o: { withFileTypes: true }) => { name: string; isDirectory: () => boolean }[] };
  const path = require('path') as { join: (...p: string[]) => string; relative: (a: string, b: string) => string };
  const files = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === '__tests__' ? [] : files(path.join(dir, e.name))) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));

  test('only the data layer reads or writes storage directly, and always through a space-aware key', () => {
    const allowed = ['lib/supabase.ts', 'utils/localPersistence.ts', 'utils/dataSpaceController.ts', 'store/useSettingsStore.ts', 'store/useAccountStore.ts', 'store/useEntitlementStore.ts', 'store/useSyncStore.ts', 'screens/MoodCheckScreen.tsx'];
    const src = path.join(process.cwd(), 'src');
    const users = files(src).filter((f) => /AsyncStorage/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(src, f).replace(/\\/g, '/'));
    expect(users.sort()).toEqual(allowed.sort());
    // The one screen that keeps a flag uses a space-aware key.
    const mood = fs.readFileSync(path.join(src, 'screens/MoodCheckScreen.tsx'), 'utf8');
    for (const line of mood.split('\n').filter((l) => /AsyncStorage\.(get|set)Item/.test(l))) expect(line).toMatch(/spaceKey\(/);
  });

  test('the settings store saves through the space-aware storage', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/store/useSettingsStore.ts'), 'utf8');
    expect(src).toMatch(/createJSONStorage\(\(\) => spacedStorage\(storage\)\)/);
    expect(SETTINGS_KEY).toBe('ona.settings');
  });

  test('the space marker and demo meta live outside both spaces\' data keys', () => {
    expect(SPACE_KEY).toBe('ona.space');
    expect(DEMO_META_KEY).toBe('ona.demo.meta');
    expect(storageKey('feelings', 'real')).toBe('ona.data.feelings');
    expect(storageKey('feelings', 'demo')).toBe('ona.demo.data.feelings');
  });
});
