// Signing in keeps your data in your account, with the sentence shown next to
// every sign-in button. The answer lives with the account: "off" stays off
// everywhere (also after a reinstall); "on" by default only when the account
// has no answer; an unreadable answer changes nothing (and a server missing
// the columns says so); every answer is recorded with its date, wording
// version and screen; accounts from before the sentence see it once.
// Restoring never needs a subscription.
// IDs: docs/test-cases/integration.md (SYNC-ACC-*)
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));

import { AppState } from 'react-native';
import { reconcileConsent, startAccountConsent, noteConsentSource, acknowledgeConsentNotice, useConsentStatusStore, ServerNeedsUpdateError, SERVER_NEEDS_UPDATE, type ConsentServer } from '../../sync/accountConsent';
import { CONSENT_WORDING_VERSION, type ConsentSource } from '../../config/consentWording';
import { useAuthStore } from '../../store/useAuthStore';
import { useSettingsStore, DEFAULT_SETTINGS } from '../../store/useSettingsStore';
import { setDataSpace, setSwitchingDataSpace } from '../dataSpace';
import { syncGate, canUpload, DOWNLOAD_ONLY_MESSAGE } from '../sync';
import { EMPTY_SYNC_STATE, syncOnce, type LocalData, type OutgoingRow, type RemoteRow, type SyncServer } from '../../sync/engine';

type Rec = { on: boolean | null; version: string | null; source: string | null };
function consentServer(initial: Record<string, Partial<Rec>> = {}, fail?: Error) {
  const answers = new Map<string, Rec>(Object.entries(initial).map(([k, v]) => [k, { on: null, version: null, source: null, ...v }]));
  const saved: [string, boolean, string][] = [];
  const server: ConsentServer & { answers: typeof answers; saved: typeof saved; fail?: Error } = {
    answers,
    saved,
    fail,
    load: async (id) => {
      if (server.fail) throw server.fail;
      return answers.get(id) ?? { on: null, version: null, source: null };
    },
    save: async (id, on, source) => {
      saved.push([id, on, source]);
      answers.set(id, { on, version: CONSENT_WORDING_VERSION, source });
    },
  };
  return server;
}
const tick = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
};
// As the sign-in screen does: note the screen, then the session appears.
const signInFrom = (id: string, source: ConsentSource) => {
  noteConsentSource(source);
  useAuthStore.setState({ session: { user: { id } } as never, initializing: false });
};
const localConsent = () => useSettingsStore.getState().consent.storeData;

let stop: (() => void) | null = null;
beforeEach(() => {
  setDataSpace('real');
  setSwitchingDataSpace(false);
  useAuthStore.setState({ session: null, initializing: false });
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, consent: { ...DEFAULT_SETTINGS.consent } });
  useConsentStatusStore.setState({ problem: null, notice: null });
});
afterEach(() => {
  stop?.();
  stop = null;
});

describe('SYNC-ACC: signing in keeps your data in your account', () => {
  const none = { on: null, version: null, source: null };

  test('SYNC-ACC-001 the rule, for every case', () => {
    expect(reconcileConsent(none, 'sign-in')).toEqual({ kind: 'on', record: 'sign-in' }); // no answer yet: on, recorded
    expect(reconcileConsent({ on: true, version: CONSENT_WORDING_VERSION, source: 'sign-up' }, 'sign-in')).toEqual({ kind: 'on' });
    expect(reconcileConsent({ on: true, version: null, source: null }, 'google-sign-in')).toEqual({ kind: 'on', record: 'google-sign-in' }); // on before the wording existed
    expect(reconcileConsent({ on: false, version: 'x', source: 'settings' }, 'sign-in')).toEqual({ kind: 'off' }); // off stays off
    expect(reconcileConsent(none, null)).toEqual({ kind: 'notice' }); // already signed in, never saw it
    expect(reconcileConsent({ on: true, version: null, source: null }, null)).toEqual({ kind: 'notice' });
    expect(reconcileConsent({ on: true, version: CONSENT_WORDING_VERSION, source: 'sign-in' }, null)).toEqual({ kind: 'on' });
  });

  test('SYNC-ACC-002 (point 3) signing in records the answer with the date, wording version and screen', async () => {
    const server = consentServer();
    stop = startAccountConsent(server);
    signInFrom('u1', 'google-sign-up');
    await tick();
    expect(localConsent()).toBe(true);
    expect(server.saved).toEqual([['u1', true, 'google-sign-up']]);
    expect(server.answers.get('u1')).toEqual({ on: true, version: CONSENT_WORDING_VERSION, source: 'google-sign-up' });
  });

  test('SYNC-ACC-003 (point 2) an account that said "off" stays off after a reinstall; nothing is recorded over it', async () => {
    const server = consentServer({ u1: { on: false, version: CONSENT_WORDING_VERSION, source: 'settings' } });
    stop = startAccountConsent(server);
    signInFrom('u1', 'sign-in');
    await tick();
    expect(localConsent()).toBe(false);
    expect(server.saved).toEqual([]);
  });

  test('SYNC-ACC-004 (point 2) the server missing the 0007/0008 columns: nothing turns on, and Settings says so plainly', async () => {
    const server = consentServer({}, new ServerNeedsUpdateError('column profiles.store_data_consent does not exist'));
    stop = startAccountConsent(server);
    signInFrom('u1', 'sign-in');
    await tick();
    expect(localConsent()).toBe(false);
    expect(useConsentStatusStore.getState().problem).toBe(SERVER_NEEDS_UPDATE);
  });

  test('SYNC-ACC-005 (point 2) unreadable because of the network: nothing changes; it is tried again when Ona comes back', async () => {
    const server = consentServer({}, new Error('Network request failed'));
    stop = startAccountConsent(server);
    signInFrom('u1', 'sign-in');
    await tick();
    expect(localConsent()).toBe(false);
    expect(useConsentStatusStore.getState().problem).toBeNull();
    server.fail = undefined;
    const listener = (AppState.addEventListener as unknown as jest.Mock).mock.calls.at(-1)?.[1] as (s: string) => void;
    listener('active');
    await tick();
    expect(localConsent()).toBe(true);
    expect(server.saved).toEqual([['u1', true, 'sign-in']]); // recorded with the screen they used
  });

  test('SYNC-ACC-006 (point 3) an account that signed in before the sentence existed sees it once; "OK" records that wording', async () => {
    useAuthStore.setState({ session: { user: { id: 'u1' } } as never, initializing: false });
    useSettingsStore.getState().setConsent({ storeData: true }); // syncing under the old per-phone setting
    const server = consentServer({ u1: { on: true, version: null, source: null } });
    stop = startAccountConsent(server); // Ona starts, already signed in
    await tick();
    expect(useConsentStatusStore.getState().notice).toBe('u1');
    expect(localConsent()).toBe(true); // keeps syncing while the notice is open
    await acknowledgeConsentNotice(true);
    expect(server.answers.get('u1')).toEqual({ on: true, version: CONSENT_WORDING_VERSION, source: 'notice' });
    stop();
    stop = startAccountConsent(server); // the next start: not shown again
    await tick();
    expect(useConsentStatusStore.getState().notice).toBeNull();
  });

  test('SYNC-ACC-007 (point 3) "Turn off" on the notice records off, with the notice as the screen', async () => {
    useAuthStore.setState({ session: { user: { id: 'u1' } } as never, initializing: false });
    const server = consentServer();
    stop = startAccountConsent(server);
    await tick();
    expect(useConsentStatusStore.getState().notice).toBe('u1');
    await acknowledgeConsentNotice(false);
    expect(localConsent()).toBe(false);
    expect(server.answers.get('u1')).toMatchObject({ on: false, source: 'notice' });
  });

  test('SYNC-ACC-008 (point 4) turning it off or on in Settings is saved to the account at once, with Settings as the screen', async () => {
    const server = consentServer();
    stop = startAccountConsent(server);
    signInFrom('u1', 'sign-in');
    await tick();
    useSettingsStore.getState().setConsent({ storeData: false });
    await tick();
    expect(server.answers.get('u1')).toMatchObject({ on: false, source: 'settings' });
    useSettingsStore.getState().setConsent({ storeData: true });
    await tick();
    expect(server.answers.get('u1')).toMatchObject({ on: true, source: 'settings' });
  });

  test("SYNC-ACC-009 the demo, and a switch between your data and the demo, never change the account's answer", async () => {
    const server = consentServer({ u1: { on: true, version: CONSENT_WORDING_VERSION, source: 'sign-in' } });
    stop = startAccountConsent(server);
    signInFrom('u1', 'sign-in');
    await tick();
    server.saved.length = 0;
    setDataSpace('demo');
    useSettingsStore.getState().setConsent({ storeData: false }); // the demo's own settings
    setDataSpace('real');
    setSwitchingDataSpace(true);
    useSettingsStore.getState().setConsent({ storeData: true }); // yours, restored mid-switch
    setSwitchingDataSpace(false);
    await tick();
    expect(server.saved).toEqual([]);
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
    p.data.set('journaling.entries', [entry('j1', 'Written on the old phone'), entry('j2', 'Written after reinstalling')]);
    const second = await syncOnce('u1', server, first.state, p, Date.now, { upload: false });
    expect(pushes).toEqual([]);
    await syncOnce('u1', server, second.state, p, Date.now, { upload: true });
    expect(pushes.flat().map((r) => r.record_id)).toEqual(['j2']);
  });
});
