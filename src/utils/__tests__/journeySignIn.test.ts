// Journeys, as a person does them: Ona's real start-up, sign-in, consent,
// trial and sync code together, with only the server faked. Reported: "the
// data should be sent to the database once the user signs in, and come back
// when they sign in again". IDs: docs/test-cases/integration.md (JRN-SYNC-*)
jest.setTimeout(30_000);

type Row = { user_id?: string; collection: string; record_id: string; data: unknown; deleted: boolean; client_updated_at: string; server_updated_at: string };
const mockServer = { rows: [] as Row[], consent: new Map<string, boolean | null>(), consentColumnMissing: false, tick: 0, onUpsert: null as null | (() => void) };

jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));
jest.mock('../reminders', () => ({ resyncFeature: jest.fn(async () => {}) }));
jest.mock('../network', () => ({ isOnline: async () => true }));
jest.mock('../../lib/supabase', () => {
  const stamp = () => new Date(Date.UTC(2026, 9, 21, 9, 0, 0, ++mockServer.tick)).toISOString();
  const from = (table: string) => {
    const filters: { since?: string; id?: string } = {};
    const q: Record<string, unknown> = {
      select: () => q,
      order: () => q,
      limit: () => q,
      gt: (_c: string, v: string) => ((filters.since = v), q),
      eq: (_c: string, v: string) => ((filters.id = v), q),
      maybeSingle: async () =>
        mockServer.consentColumnMissing
          ? { data: null, error: { message: 'column profiles.store_data_consent does not exist' } }
          : { data: { store_data_consent: mockServer.consent.get(filters.id!) ?? null, store_data_consent_version: mockServer.consent.has(filters.id!) ? '2026-10-21' : null, store_data_consent_source: null }, error: null },
      update: (patch: { store_data_consent?: boolean }) => ({
        eq: async (_c: string, id: string) => {
          if (mockServer.consentColumnMissing) return { error: { message: 'column does not exist' } };
          mockServer.consent.set(id, patch.store_data_consent ?? null);
          return { error: null };
        },
      }),
      upsert: async (rows: Row[]) => {
        mockServer.onUpsert?.();
        for (const r of rows) {
          const i = mockServer.rows.findIndex((x) => x.collection === r.collection && x.record_id === r.record_id);
          const row = { ...r, server_updated_at: stamp() };
          if (i >= 0) mockServer.rows[i] = row;
          else mockServer.rows.push(row);
        }
        return { error: null };
      },
      then: (resolve: (v: unknown) => void) => {
        const rows = table === 'sync_records' ? mockServer.rows.filter((r) => !filters.since || r.server_updated_at > filters.since).sort((a, b) => a.server_updated_at.localeCompare(b.server_updated_at)) : [];
        resolve({ data: rows, error: null });
      },
    };
    return q;
  };
  const DAY = 86_400_000;
  const trial = () => ({ server_time: new Date().toISOString(), trial_started_at: new Date(Date.now() - DAY).toISOString(), trial_ends_at: new Date(Date.now() + 29 * DAY).toISOString(), subscription: null, trial_newly_started: false });
  return {
    isSupabaseConfigured: true,
    supabaseUrl: 'https://example.supabase.co',
    supabase: {
      from,
      rpc: async () => ({ data: trial(), error: null }),
      auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { setDataSpace } from '../dataSpace';
import { __flushForTests, __resetForTests, startAppData } from '../dataSpaceController';
import { useAuthStore } from '../../store/useAuthStore';
import { useSettingsStore, DEFAULT_SETTINGS } from '../../store/useSettingsStore';
import { useEntitlementStore } from '../../store/useEntitlementStore';
import { useSyncStore } from '../../store/useSyncStore';
import { useJournalStore } from '../../store/useJournalStore';
import { startSync, syncInFlight, syncNow } from '../../sync/syncController';
import { chooseForAccount } from '../../sync/signInFlow';
import { startAccountConsent, noteConsentSource, useConsentStatusStore, SERVER_NEEDS_UPDATE } from '../../sync/accountConsent';
import { startEntitlementSync } from '../entitlementBootstrap';
import { useClock, restoreClock } from '../../test-utils';

const storage = AsyncStorage as unknown as { clear: () => Promise<void> };
const entry = (id: string, text: string) => ({ id, date: '2026-10-21', zone: 'calm', text, tags: [], createdAt: '2026-10-21T08:00:00.000Z', updatedAt: '2026-10-21T08:00:00.000Z' });

let stops: (() => void)[] = [];
// A fresh install: empty phone, nobody signed in, Ona started as App.tsx does.
async function freshInstall() {
  await storage.clear();
  __resetForTests();
  setDataSpace('real');
  useAuthStore.setState({ session: null, initializing: false });
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, consent: { ...DEFAULT_SETTINGS.consent } });
  useSyncStore.getState().reset();
  useEntitlementStore.setState({ snapshots: {} } as never);
  await startAppData(storage as never, false);
  stops = [startEntitlementSync(), startAccountConsent(), startSync()];
}
async function settle() {
  for (let i = 0; i < 8; i++) {
    await syncInFlight();
    await new Promise((r) => setTimeout(r, 0));
  }
}
// As the sign-in screen does: note the screen (with the sentence), then sign in.
const signIn = (id: string) => {
  noteConsentSource('sign-in');
  useAuthStore.setState({ session: { user: { id } } as never, initializing: false });
};
const signOut = () => useAuthStore.setState({ session: null });
const serverIds = () => mockServer.rows.filter((r) => !r.deleted).map((r) => r.record_id).sort();

beforeEach(() => {
  mockServer.rows = [];
  mockServer.consent = new Map();
  mockServer.consentColumnMissing = false;
  mockServer.onUpsert = null;
  useConsentStatusStore.setState({ problem: null, notice: null });
  useClock('2026-10-21T09:00');
});
afterEach(() => {
  stops.forEach((s) => s());
  stops = [];
  restoreClock();
});

test('JRN-SYNC-001 sign in, write something: it reaches your account by itself, with nothing to tick, answer or tap', async () => {
  await freshInstall();
  signIn('u1');
  await settle();
  useJournalStore.setState({ entries: [entry('j1', 'First entry')] } as never);
  jest.advanceTimersByTime(16_000); // "a little after a change"
  await settle();
  expect(serverIds()).toEqual(['j1']);
});

test('JRN-SYNC-002 uninstall, reinstall, sign in: your data comes back by itself', async () => {
  await freshInstall();
  signIn('u1');
  await settle();
  useJournalStore.setState({ entries: [entry('j1', 'Written before reinstalling')] } as never);
  jest.advanceTimersByTime(16_000);
  await settle();
  stops.forEach((s) => s());

  await freshInstall(); // uninstall + install: the phone is empty again
  expect(useJournalStore.getState().entries).toEqual([]);
  signIn('u1');
  await settle();
  expect(useJournalStore.getState().entries.map((e) => e.text)).toEqual(['Written before reinstalling']);
});

test('JRN-SYNC-003 the server missing the 0007/0008 update: nothing is sent, nothing turns on by itself, and Settings says why', async () => {
  mockServer.consentColumnMissing = true;
  await freshInstall();
  signIn('u1');
  await settle();
  useJournalStore.setState({ entries: [entry('j1', 'Stays on this phone')] } as never);
  jest.advanceTimersByTime(16_000);
  await settle();
  expect(serverIds()).toEqual([]);
  expect(useSettingsStore.getState().consent.storeData).toBe(false);
  expect(useConsentStatusStore.getState().problem).toBe(SERVER_NEEDS_UPDATE);
});

test('JRN-SYNC-004 data written before signing in goes to the account at sign-in, after one tap (Continue)', async () => {
  await freshInstall();
  useJournalStore.setState({ entries: [entry('j0', 'Written while signed out')] } as never);
  await __flushForTests();
  signIn('u1');
  await settle();
  expect(serverIds()).toEqual([]); // asked first (owner's decision 2026-10-24)
  await chooseForAccount('continue');
  void syncNow();
  await settle();
  expect(serverIds()).toEqual(['j0']);
});

test('JRN-SYNC-005 turned off in Settings: nothing more is sent, and signing in again elsewhere keeps it off', async () => {
  await freshInstall();
  signIn('u1');
  await settle();
  useSettingsStore.getState().setConsent({ storeData: false }); // Settings → Privacy
  await settle();
  useJournalStore.setState({ entries: [entry('j9', 'Not to be sent')] } as never);
  jest.advanceTimersByTime(16_000);
  await settle();
  expect(serverIds()).toEqual([]);
  signOut();
  stops.forEach((s) => s());
  await freshInstall();
  signIn('u1');
  await settle();
  expect(useSettingsStore.getState().consent.storeData).toBe(false);
});

test('JRN-SYNC-006 (point 4) turning sync off in the middle of a big upload stops it at once: no further batch is sent', async () => {
  await freshInstall();
  useJournalStore.setState({ entries: Array.from({ length: 650 }, (_, i) => entry(`j${i}`, `Entry ${i}`)) } as never);
  await __flushForTests();
  let batches = 0;
  mockServer.onUpsert = () => {
    batches++;
    if (batches === 1) useSettingsStore.getState().setConsent({ storeData: false }); // turned off during the first batch
  };
  signIn('u1');
  await settle();
  await chooseForAccount('continue');
  void syncNow();
  await settle();
  expect(batches).toBe(1); // 650 entries would take 4 batches of 200
  expect(serverIds().length).toBe(200);
  expect(useSyncStore.getState().lastError).toMatch(/turned off/);
});

// Every AppState listener Ona registered (sync, consent, entitlement): what
// the phone tells Ona when it is left or opened.
function phoneSays(state: 'active' | 'background' | 'inactive') {
  const { AppState } = require('react-native') as { AppState: { addEventListener: jest.Mock } };
  for (const [event, fn] of AppState.addEventListener.mock.calls) if (event === 'change') (fn as (s: string) => void)(state);
}

test('JRN-SYNC-007 reported: add something and leave Ona right away (to close or uninstall it): it is in your account', async () => {
  await freshInstall();
  signIn('u1');
  await settle();
  useJournalStore.setState({ entries: [entry('j1', 'Added just before leaving')] } as never);
  phoneSays('background'); // Home button / app switcher, no time passes
  await settle();
  expect(serverIds()).toEqual(['j1']);
});

test('JRN-SYNC-008 changes that keep coming never hold your data back: it goes up within 10 seconds', async () => {
  await freshInstall();
  signIn('u1');
  await settle();
  for (let s = 0; s <= 10; s += 2) {
    useJournalStore.setState({ entries: [entry('j1', `Version at ${s}s`)] } as never);
    jest.advanceTimersByTime(2_000);
    await settle();
  }
  expect(serverIds()).toEqual(['j1']);
});

test('JRN-SYNC-009 a change made while a sync is running is sent right after it', async () => {
  await freshInstall();
  signIn('u1');
  await settle();
  let once = true;
  mockServer.onUpsert = () => {
    if (once) {
      once = false;
      useJournalStore.setState({ entries: [...useJournalStore.getState().entries, entry('j2', 'Made during the sync')] } as never);
    }
  };
  useJournalStore.setState({ entries: [entry('j1', 'First')] } as never);
  phoneSays('background');
  await settle();
  phoneSays('background');
  await settle();
  expect(serverIds()).toEqual(['j1', 'j2']);
});

test('JRN-SYNC-010 a single change goes up about 3 seconds later, without leaving Ona', async () => {
  await freshInstall();
  signIn('u1');
  await settle();
  useJournalStore.setState({ entries: [entry('j1', 'Just one')] } as never);
  jest.advanceTimersByTime(3_100);
  await settle();
  expect(serverIds()).toEqual(['j1']);
});
