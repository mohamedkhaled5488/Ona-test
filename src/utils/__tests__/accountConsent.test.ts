// "Store my data in my account" is kept with the account, answered once:
// every phone you sign in on (a new phone, a reinstall) syncs and brings
// your data back by itself, and restoring works even without a trial or
// subscription. Reported: after reinstalling and signing in, the app was
// empty, because the per-phone box hadn't been ticked again.
// IDs: docs/test-cases/integration.md (SYNC-ACC-*)
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));

import { reconcileConsent, startAccountConsent, answerConsentPrompt, consentGivenAtSignIn, useConsentPromptStore, type AccountConsent, type ConsentServer } from '../../sync/accountConsent';
import { useAuthStore } from '../../store/useAuthStore';
import { useSettingsStore, DEFAULT_SETTINGS } from '../../store/useSettingsStore';
import { setDataSpace, setSwitchingDataSpace } from '../dataSpace';
import { syncGate, canUpload, DOWNLOAD_ONLY_MESSAGE } from '../sync';
import { EMPTY_SYNC_STATE, syncOnce, type LocalData, type OutgoingRow, type RemoteRow, type SyncServer } from '../../sync/engine';

function consentServer(initial: Record<string, AccountConsent> = {}) {
  const answers = new Map(Object.entries(initial));
  const saved: [string, boolean][] = [];
  const server: ConsentServer & { answers: typeof answers; saved: typeof saved } = {
    answers,
    saved,
    load: async (id) => answers.get(id) ?? null,
    save: async (id, on) => {
      saved.push([id, on]);
      answers.set(id, on);
    },
  };
  return server;
}
const tick = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};
const signIn = (id: string) => useAuthStore.setState({ session: { user: { id } } as never });
const localConsent = () => useSettingsStore.getState().consent.storeData;

let stop: (() => void) | null = null;
beforeEach(() => {
  setDataSpace('real');
  setSwitchingDataSpace(false);
  useAuthStore.setState({ session: null });
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, consent: { ...DEFAULT_SETTINGS.consent } });
  useConsentPromptStore.getState().dismiss();
});
afterEach(() => {
  stop?.();
  stop = null;
});

describe('SYNC-ACC: the answer lives with the account', () => {
  test('SYNC-ACC-001 what a phone does when you sign in, for every combination', () => {
    expect(reconcileConsent(true, false)).toEqual({ local: true, saveToAccount: false, ask: false }); // new phone / reinstall
    expect(reconcileConsent(false, true)).toEqual({ local: false, saveToAccount: false, ask: false }); // turned off on another phone
    expect(reconcileConsent(null, true)).toEqual({ local: true, saveToAccount: true, ask: false }); // a yes from before this change
    expect(reconcileConsent(null, false)).toEqual({ local: false, saveToAccount: false, ask: true }); // never answered: ask
  });

  test('SYNC-ACC-002 reinstalling and signing in: the account already said yes, so this phone syncs at once, no question', async () => {
    const server = consentServer({ u1: true });
    stop = startAccountConsent(server);
    signIn('u1');
    await tick();
    expect(localConsent()).toBe(true);
    expect(useConsentPromptStore.getState().askFor).toBeNull();
    expect(server.saved).toEqual([]);
  });

  test('SYNC-ACC-003 a yes given on this phone before (an older version) becomes the account\'s answer', async () => {
    useSettingsStore.getState().setConsent({ storeData: true });
    const server = consentServer();
    stop = startAccountConsent(server);
    signIn('u1');
    await tick();
    expect(server.answers.get('u1')).toBe(true);
  });

  test('SYNC-ACC-004 never answered: Ona asks right after sign-in; "Yes" turns sync on and saves it to the account', async () => {
    const server = consentServer();
    stop = startAccountConsent(server);
    signIn('u1');
    await tick();
    expect(useConsentPromptStore.getState().askFor).toBe('u1');
    await answerConsentPrompt(true);
    await tick();
    expect(localConsent()).toBe(true);
    expect(server.answers.get('u1')).toBe(true);
    expect(useConsentPromptStore.getState().askFor).toBeNull();
  });

  test('SYNC-ACC-005 "Not now" is remembered for the account, so no phone asks again; Settings can still turn it on', async () => {
    const server = consentServer();
    stop = startAccountConsent(server);
    signIn('u1');
    await tick();
    await answerConsentPrompt(false);
    expect(server.answers.get('u1')).toBe(false);
    expect(localConsent()).toBe(false);
    useAuthStore.setState({ session: null });
    signIn('u1');
    await tick();
    expect(useConsentPromptStore.getState().askFor).toBeNull();
    useSettingsStore.getState().setConsent({ storeData: true }); // Settings → Privacy
    await tick();
    expect(server.answers.get('u1')).toBe(true);
  });

  test('SYNC-ACC-006 turning it off on one phone turns it off on the others when they next sign in or start', async () => {
    const server = consentServer({ u1: true });
    stop = startAccountConsent(server);
    signIn('u1');
    await tick();
    useSettingsStore.getState().setConsent({ storeData: false });
    await tick();
    expect(server.answers.get('u1')).toBe(false);
  });

  test('SYNC-ACC-007 the demo, and a switch between your data and the demo, never change the account\'s answer', async () => {
    const server = consentServer({ u1: true });
    stop = startAccountConsent(server);
    signIn('u1');
    await tick();
    setDataSpace('demo');
    useSettingsStore.getState().setConsent({ storeData: false }); // the demo's own settings
    setDataSpace('real');
    setSwitchingDataSpace(true);
    useSettingsStore.getState().setConsent({ storeData: true }); // yours, restored mid-switch
    setSwitchingDataSpace(false);
    await tick();
    expect(server.saved).toEqual([]);
  });

  test('SYNC-ACC-008 ticking the box on Create account always counts, even if the account had said no before', async () => {
    const server = consentServer({ u1: false });
    stop = startAccountConsent(server);
    consentGivenAtSignIn();
    signIn('u1');
    await tick();
    expect(localConsent()).toBe(true);
    expect(server.answers.get('u1')).toBe(true);
  });

  test('SYNC-ACC-009 offline at sign-in: nothing changes and nothing breaks; it\'s checked again next time', async () => {
    const server: ConsentServer = { load: async () => Promise.reject(new Error('Network request failed')), save: jest.fn(async () => {}) };
    stop = startAccountConsent(server);
    signIn('u1');
    await tick();
    expect(localConsent()).toBe(false);
    expect(useConsentPromptStore.getState().askFor).toBeNull();
  });
});

describe('SYNC-ACC: restoring never needs a subscription', () => {
  const base = { configured: true, signedIn: true, consentStoreData: true, paused: false, offline: false };

  test('SYNC-ACC-010 without a trial or subscription, sync still downloads, and only sending is off', () => {
    const gate = syncGate({ ...base, syncAccess: false });
    expect(gate).toEqual({ allowed: true, uploads: false, message: DOWNLOAD_ONLY_MESSAGE });
    expect(canUpload(gate)).toBe(false);
    expect(canUpload(syncGate({ ...base, syncAccess: true }))).toBe(true);
  });

  function fakeServer(rows: RemoteRow[]) {
    const map = new Map(rows.map((r) => [r.record_id, r]));
    const pushes: OutgoingRow[][] = [];
    let n = 0;
    const server: SyncServer = {
      pull: async (since, limit) => [...map.values()].filter((r) => !since || r.server_updated_at > since).slice(0, limit),
      push: async (batch) => {
        pushes.push(batch);
        for (const r of batch) map.set(r.record_id, { ...r, server_updated_at: `2026-10-20T10:00:00.${String(++n).padStart(3, '0')}Z` });
      },
    };
    return { server, pushes, map };
  }
  const phone = (initial: Record<string, unknown> = {}): LocalData & { data: Map<string, unknown> } => {
    const data = new Map(Object.entries(initial));
    return { data, read: (c) => data.get(c) ?? (c.endsWith('dayReflections') || c.endsWith('guidanceVotes') ? {} : []), write: (c, v) => void data.set(c, v) };
  };
  const entry = (id: string, text: string) => ({ id, date: '2026-10-19', zone: 'calm', text });

  test('SYNC-ACC-011 a reinstall without sync access gets your data back; its own new entries are sent once access returns', async () => {
    const { server, pushes } = fakeServer([{ collection: 'journaling.entries', record_id: 'j1', data: entry('j1', 'Written on the old phone'), deleted: false, client_updated_at: '2026-10-19T09:00:00.000Z', server_updated_at: '2026-10-19T09:00:00.001Z' }]);
    const p = phone();
    const first = await syncOnce('u1', server, EMPTY_SYNC_STATE, p, Date.now, { upload: false });
    expect(p.data.get('journaling.entries')).toEqual([entry('j1', 'Written on the old phone')]);
    expect(pushes).toEqual([]);
    // A new entry on this phone, still without access: kept here, not sent.
    p.data.set('journaling.entries', [entry('j1', 'Written on the old phone'), entry('j2', 'Written after reinstalling')]);
    const second = await syncOnce('u1', server, first.state, p, Date.now, { upload: false });
    expect(pushes).toEqual([]);
    // Access is back: the new entry goes up, the old one isn't re-sent.
    await syncOnce('u1', server, second.state, p, Date.now, { upload: true });
    expect(pushes.flat().map((r) => r.record_id)).toEqual(['j2']);
  });
});
