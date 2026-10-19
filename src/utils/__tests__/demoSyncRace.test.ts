// Regression: after the demo, demo data appeared in the user's account (seen
// on a fresh sign-in on another install). Cause: leaving the demo marks the
// user's own space active and restores their settings (sync consent
// included) before their data has finished loading. The consent change
// starts a sync at once, which read the stores while they still held the
// demo's data, and uploaded it as the user's. IDs: docs/audit-report.md (FIX-14)
jest.setTimeout(20_000);

const mockPushed: { collection: string; record_id: string; data: unknown; deleted: boolean }[] = [];
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));
jest.mock('../reminders', () => ({ resyncFeature: jest.fn(async () => {}) }));
jest.mock('../network', () => ({ isOnline: async () => true }));
jest.mock('../../lib/supabase', () => {
  const query: Record<string, unknown> = {};
  for (const m of ['select', 'gt', 'order', 'limit', 'eq']) query[m] = () => query;
  // The server starts empty: every pull returns nothing.
  (query as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
  return {
    isSupabaseConfigured: true,
    supabaseUrl: 'https://example.supabase.co',
    supabase: {
      from: () => ({
        ...query,
        upsert: async (rows: typeof mockPushed) => {
          mockPushed.push(...rows);
          return { error: null };
        },
      }),
      rpc: async () => ({ data: null, error: null }),
      auth: {
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { setDataSpace } from '../dataSpace';
import { __flushForTests, __resetForTests, startAppData, switchDataSpace } from '../dataSpaceController';
import { LOCAL_DATA } from '../localData';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useEntitlementStore } from '../../store/useEntitlementStore';
import { useJournalStore } from '../../store/useJournalStore';
import { startSync, syncInFlight } from '../../sync/syncController';
import { useClock, restoreClock } from '../../test-utils';

const storage = AsyncStorage as unknown as { clear: () => Promise<void> };
const DAY = 86_400_000;

// Every item id that belongs to the demo, collected while in it.
function itemIds(): Set<string> {
  const ids = new Set<string>();
  for (const { store, keys } of Object.values(LOCAL_DATA)) {
    const state = store.getState() as Record<string, unknown>;
    for (const k of keys) {
      const v = state[k];
      if (Array.isArray(v)) for (const item of v) if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') ids.add((item as { id: string }).id);
    }
  }
  return ids;
}

async function settle() {
  for (let i = 0; i < 5; i++) {
    await syncInFlight();
    await new Promise((r) => setTimeout(r, 0));
  }
}

beforeEach(async () => {
  await storage.clear();
  __resetForTests();
  setDataSpace('real');
  mockPushed.length = 0;
  useClock('2026-10-18T12:00');
});
afterEach(() => restoreClock());

test('FIX-14 entering and leaving the demo while signed in with sync on uploads nothing of the demo', async () => {
  // You, signed in, syncing during your trial, with one journal entry.
  await startAppData(storage as never, false);
  useJournalStore.setState({ entries: [{ id: 'mine', date: '2026-10-18', zone: 'calm', text: 'My own words', tags: [], createdAt: '2026-10-18T09:00:00.000Z', updatedAt: '2026-10-18T09:00:00.000Z' }] } as never);
  useSettingsStore.getState().setConsent({ storeData: true });
  useAuthStore.setState({ session: { user: { id: 'u1' } } as never });
  useEntitlementStore.getState().saveSnapshot({ userId: 'u1', serverTime: new Date().toISOString(), fetchedAt: Date.now(), trial: { startedAt: new Date(Date.now() - DAY).toISOString(), endsAt: new Date(Date.now() + 20 * DAY).toISOString() }, subscription: null });
  await __flushForTests();
  const stop = startSync();
  try {
    await settle();
    expect(mockPushed.map((r) => r.record_id)).toContain('mine'); // sync really runs
    mockPushed.length = 0;

    await switchDataSpace('demo', storage as never);
    const demoIds = itemIds();
    expect(demoIds.size).toBeGreaterThan(20);
    await settle();
    await switchDataSpace('real', storage as never);
    await settle();

    const uploadedDemo = mockPushed.filter((r) => !r.deleted && demoIds.has(r.record_id)).map((r) => `${r.collection}/${r.record_id}`);
    expect(uploadedDemo).toEqual([]);
    expect(useJournalStore.getState().entries.map((e) => e.id)).toEqual(['mine']);
  } finally {
    stop();
  }
});
