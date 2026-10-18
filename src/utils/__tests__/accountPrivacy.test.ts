// Account, consent and data rules from Settings → Account and Privacy.
jest.mock('../notifications', () => ({
  cancelReminders: jest.fn(async () => {}),
  scheduleReminder: jest.fn(async () => []),
}));

import { deleteAccount, withdrawStoreDataConsent, OFFLINE_MESSAGE, type DeleteAccountDeps } from '../accountActions';
import { syncGate, type SyncGateInput } from '../sync';
import { capUsage, computeEntitlement } from '../entitlement';
import { forcedSnapshot } from '../../hooks/useEntitlement';
import { useEntitlementStore } from '../../store/useEntitlementStore';
import { buildExport, wipeLocalData, LOCAL_DATA, restoreSampleData } from '../localData';
import { ALLOWED_EVENTS, setAnalyticsTransport, track, type OutgoingEvent } from '../analytics';
import { FREE_CAPS } from '../../config/plans';
import { useSettingsStore, DEFAULT_SETTINGS } from '../../store/useSettingsStore';
import { useAccountStore } from '../../store/useAccountStore';
import { usePlanStore } from '../../store/usePlanStore';
import { useFeelingsStore } from '../../store/useFeelingsStore';
import { useReadingListStore } from '../../store/useReadingListStore';
import { useHabitsStore } from '../../store/useHabitsStore';
import { cancelReminders } from '../notifications';
import type { Habit, Plan, QuitTrack, Skill } from '../../types/sections';

function deps(overrides: Partial<DeleteAccountDeps> = {}) {
  const calls: string[] = [];
  const d: DeleteAccountDeps = {
    isOnline: async () => true,
    deleteOnServer: async () => (calls.push('server'), { error: null }),
    signOutLocally: async () => void calls.push('signOut'),
    wipeLocalData: async () => void calls.push('wipe'),
    forgetAccount: () => void calls.push('forget'),
    ...overrides,
  };
  return { d, calls };
}

const habit = (id: string, extra: Partial<Habit> = {}): Habit =>
  ({ id, name: id, targetDays: 30, createdAt: '2026-01-01', reminderEnabled: false, reminderNotificationIds: [], ...extra }) as Habit;

beforeEach(() => {
  restoreSampleData();
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, consent: { ...DEFAULT_SETTINGS.consent } });
});

describe('delete account', () => {
  test('offline: nothing is deleted anywhere, and the user is told', async () => {
    const { d, calls } = deps({ isOnline: async () => false });
    expect(await deleteAccount(false, d)).toEqual({ ok: false, message: OFFLINE_MESSAGE });
    expect(calls).toEqual([]);
  });

  test('a dropped connection mid-request also leaves everything in place', async () => {
    const { d, calls } = deps({ deleteOnServer: async () => Promise.reject(new Error('Network request failed')) });
    expect((await deleteAccount(false, d)).ok).toBe(false);
    expect(calls).toEqual([]);
  });

  test('keep the local copy: server data removed, signed out, device data kept', async () => {
    const { d, calls } = deps();
    expect(await deleteAccount(true, d)).toEqual({ ok: true });
    expect(calls).toEqual(['server', 'signOut', 'forget']);
  });

  test("don't keep it: the device's data is deleted too", async () => {
    const { d, calls } = deps();
    await deleteAccount(false, d);
    expect(calls).toEqual(['server', 'signOut', 'forget', 'wipe']);
  });

  test('a server error changes nothing locally', async () => {
    const { d, calls } = deps({ deleteOnServer: async () => ({ error: { message: 'permission denied' } }) });
    const result = await deleteAccount(false, d);
    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });
});

const gateInput = (o: Partial<SyncGateInput> = {}): SyncGateInput => ({
  configured: true,
  signedIn: true,
  syncAccess: true,
  consentStoreData: true,
  paused: false,
  offline: false,
  ...o,
});

describe('consent and sync', () => {
  test('sync runs only when every condition holds', () => {
    expect(syncGate(gateInput()).allowed).toBe(true);
    expect(syncGate(gateInput({ signedIn: false }))).toMatchObject({ allowed: false, reason: 'signedOut' });
    expect(syncGate(gateInput({ consentStoreData: false }))).toMatchObject({ allowed: false, reason: 'noConsent' });
    expect(syncGate(gateInput({ paused: true }))).toMatchObject({ allowed: false, reason: 'paused' });
    expect(syncGate(gateInput({ offline: true }))).toMatchObject({ allowed: false, reason: 'offline' });
    expect(syncGate(gateInput({ configured: false }))).toMatchObject({ allowed: false, reason: 'notConfigured' });
  });

  test('withdrawing "store my data" stops sync at once, and server copies are only deleted if chosen', async () => {
    let consent = true;
    const deleteServerData = jest.fn(async () => ({ error: null }));
    const d = { setConsent: (on: boolean) => (consent = on), isOnline: async () => true, deleteServerData };

    expect(await withdrawStoreDataConsent(false, d)).toEqual({ ok: true });
    expect(consent).toBe(false);
    expect(syncGate(gateInput({ consentStoreData: consent })).allowed).toBe(false);
    expect(deleteServerData).not.toHaveBeenCalled();

    consent = true;
    expect(await withdrawStoreDataConsent(true, d)).toEqual({ ok: true });
    expect(consent).toBe(false);
    expect(deleteServerData).toHaveBeenCalledTimes(1);
  });

  test('withdrawal sticks even when deleting the server copy fails offline', async () => {
    let consent = true;
    const deleteServerData = jest.fn(async () => ({ error: null }));
    const result = await withdrawStoreDataConsent(true, { setConsent: (on) => (consent = on), isOnline: async () => false, deleteServerData });
    expect(result.ok).toBe(false);
    expect(consent).toBe(false);
    expect(deleteServerData).not.toHaveBeenCalled();
  });
});

describe('trial and plan', () => {
  const now = Date.parse('2026-10-06T12:00:00Z');
  test('when a trial ends nothing is deleted and sync pauses', () => {
    const ended = computeEntitlement(forcedSnapshot('trialEnded', now), now);
    expect(ended.state).toBe('trialEnded');
    const gate = syncGate(gateInput({ syncAccess: ended.syncAccess }));
    expect(gate).toMatchObject({ allowed: false, reason: 'noEntitlement', message: 'Nothing was deleted. Sync is paused.' });
    // The entitlement is a pure read — no data changes when a trial ends.
    expect(usePlanStore.getState().plans.length).toBeGreaterThan(0);
  });

  test('free-cap usage matches the data, and archiving frees a slot', () => {
    const plans = [{ status: 'active' }, { status: 'active' }, { status: 'archived' }] as Plan[];
    const habits = [habit('a'), habit('b'), habit('c', { archivedAt: '2026-05-01' }), habit('d', { graduationChoice: 'formed' })];
    const quitTracks = [{ status: 'active' }, { status: 'archived' }] as QuitTrack[];
    const skills = [{ id: 's1' }, { id: 's2', archivedAt: '2026-02-02' }] as Skill[];
    const usage = Object.fromEntries(capUsage({ plans, habits, quitTracks, skills }).map((u) => [u.id, u]));
    expect(usage.activePlans).toEqual({ id: 'activePlans', used: 2, cap: FREE_CAPS.activePlans });
    expect(usage.buildHabits.used).toBe(2);
    expect(usage.quitTracks.used).toBe(1);
    expect(usage.skills.used).toBe(1);

    habits[0].archivedAt = '2026-10-01';
    expect(capUsage({ plans, habits, quitTracks, skills }).find((u) => u.id === 'buildHabits')!.used).toBe(1);
  });
});

describe('export and delete on this device', () => {
  test('the export contains every section and exactly the stored records', () => {
    const data = buildExport(undefined, new Date('2026-10-06T10:00:00Z'));
    expect(data.format).toBe('ona-export');
    expect(Object.keys(data.sections).sort()).toEqual(Object.keys(LOCAL_DATA).sort());
    for (const [section, { store, keys }] of Object.entries(LOCAL_DATA)) {
      const state = store.getState() as Record<string, unknown>;
      for (const key of keys) expect(JSON.stringify(data.sections[section][key])).toBe(JSON.stringify(state[key]));
    }
    expect(data.sections.feelings.entries).toHaveLength(useFeelingsStore.getState().entries.length);
    // Survives a JSON round trip unchanged.
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });

  test('photos are left out unless asked for, and embedded when they are', () => {
    useReadingListStore.setState({
      quotes: [{ id: 'q1', entryId: 'e1', text: 'A line', createdAt: '2026-10-01', photoUri: 'file:///page.jpg' } as never],
    });
    const without = buildExport();
    expect(JSON.stringify(without)).not.toContain('page.jpg');
    expect((without.sections.book.quotes as any[])[0].text).toBe('A line');

    const withPhotos = buildExport({ 'file:///page.jpg': 'data:image/jpeg;base64,AAAA' });
    expect(withPhotos.includesPhotos).toBe(true);
    expect((withPhotos.sections.book.quotes as any[])[0].photoUri).toBe('data:image/jpeg;base64,AAAA');
  });

  test('"Delete on this device" clears every section but leaves the account and settings alone', async () => {
    useAccountStore.setState({ lastSyncedAt: '2026-10-01T00:00:00.000Z', syncPaused: false });
    useEntitlementStore.getState().saveSnapshot(forcedSnapshot('trial', Date.now()));
    useSettingsStore.getState().set('theme', 'light');
    useHabitsStore.setState({ habits: [habit('h1', { reminderEnabled: true, reminderNotificationIds: ['r1', 'r2'] })] });

    await wipeLocalData();

    for (const { store, keys } of Object.values(LOCAL_DATA)) {
      const state = store.getState() as Record<string, unknown>;
      for (const key of keys) {
        const v = state[key];
        if (Array.isArray(v)) expect(v).toEqual([]);
        else if (v && typeof v === 'object') expect(v).toEqual({});
        else expect(v).toBeNull();
      }
    }
    // Reminders for deleted habits are cancelled so they can't fire.
    expect(cancelReminders).toHaveBeenCalledWith(expect.arrayContaining(['r1', 'r2']));
    // Account and settings untouched.
    expect(useAccountStore.getState().lastSyncedAt).toBe('2026-10-01T00:00:00.000Z');
    expect(useEntitlementStore.getState().snapshots.dev).toBeDefined();
    expect(useSettingsStore.getState().theme).toBe('light');
  });
});

describe('analytics', () => {
  const sent: OutgoingEvent[] = [];
  beforeAll(() => setAnalyticsTransport((e) => sent.push(e)));
  afterAll(() => setAnalyticsTransport(null));
  beforeEach(() => (sent.length = 0));

  const sensitive = ['feeling_logged', 'mood_check', 'quit_relapse', 'urge_logged', 'journal_entry', 'tag_added', 'habit_check_in', 'sleep_logged'];

  test('nothing is sent without consent', () => {
    for (const e of ALLOWED_EVENTS) track(e);
    expect(sent).toEqual([]);
  });

  test('with consent, sensitive events still never reach the transport', () => {
    useSettingsStore.getState().setConsent({ analytics: true });
    for (const e of sensitive) track(e);
    expect(sent).toEqual([]);
  });

  test('allowed events go out with no properties at all', () => {
    useSettingsStore.getState().setConsent({ analytics: true });
    track('signup');
    expect(sent).toHaveLength(1);
    expect(Object.keys(sent[0]).sort()).toEqual(['at', 'name']);
    expect(sent[0].name).toBe('signup');
  });

  test('the allowlist holds only generic events', () => {
    expect([...ALLOWED_EVENTS].sort()).toEqual(
      ['demo_started', 'discover_opened', 'install', 'paywall_viewed', 'plan_selected', 'purchase_canceled', 'purchase_completed', 'purchase_started', 'restore_clicked', 'signup', 'tour_completed', 'tour_started', 'trial_ended', 'trial_started']
    );
  });

  test('only a plan id and a country code may travel with an event', () => {
    useSettingsStore.getState().setConsent({ analytics: true });
    track('plan_selected', { planId: 'annual', country: 'EG', feeling: 'anxious', note: 'private', email: 'a@b.co' });
    track('purchase_started', { planId: 'annual; drop table', country: 'egypt' });
    expect(sent[0]).toEqual({ name: 'plan_selected', at: expect.any(String), planId: 'annual', country: 'EG' });
    expect(Object.keys(sent[1]).sort()).toEqual(['at', 'name']);
  });
});
