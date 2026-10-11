// "Continue with Google": every outcome gets a calm, defined result; one email
// is one account and one trial whichever way you sign in; and Google accounts
// get exactly the same trial, entitlement, sync and deletion behaviour.
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import { Platform } from 'react-native';
import { GOOGLE_MESSAGES, GOOGLE_SCOPES, signInWithGoogle, signOutOfGoogle, type GoogleDeps, type GoogleModule } from '../../auth/googleSignIn';
import { refreshEntitlement, type EntitlementServer } from '../entitlementSync';
import { createEntitlementStore } from '../../store/useEntitlementStore';
import { computeEntitlement, type RawEntitlement } from '../entitlement';
import { syncGate } from '../sync';
import { deleteAccount } from '../accountActions';
import { EMPTY_SYNC_STATE, syncOnce, OtherAccountError, type LocalData, type RemoteRow, type SyncServer } from '../../sync/engine';
import type { StateStorage } from 'zustand/middleware';

type Calls = string[];
function fakeGoogle(behaviour: Partial<{ signIn: GoogleModule['signIn']; hasPlayServices: GoogleModule['hasPlayServices']; getTokens: GoogleModule['getTokens'] }> = {}) {
  const calls: Calls = [];
  const configured: unknown[] = [];
  const google: GoogleModule = {
    configure: (o) => void configured.push(o),
    hasPlayServices: behaviour.hasPlayServices ?? (async () => true),
    signIn: behaviour.signIn ?? (async () => ({ type: 'success', data: { idToken: 'google-id-token', user: { email: 'sam@example.com' } } })),
    getTokens: behaviour.getTokens ?? (async () => ({ idToken: 'fresh-token', accessToken: 'a' })),
    signOut: async () => void calls.push('signOut'),
    revokeAccess: async () => void calls.push('revokeAccess'),
  };
  return { google, calls, configured };
}

const deps = (google: GoogleModule | null, over: Partial<GoogleDeps> = {}): GoogleDeps => ({
  google,
  webClientId: 'web-client.apps.googleusercontent.com',
  isOnline: async () => true,
  exchange: async () => ({ error: null, isNewUser: false }),
  ...over,
});

const err = (code: string, message = code) => Object.assign(new Error(message), { code });
const kindOf = (r: Awaited<ReturnType<typeof signInWithGoogle>>) => (r.ok ? 'ok' : r.kind);

describe('outcomes', () => {
  test('success exchanges the Google ID token for an Ona session, asking only for profile and email', async () => {
    const { google, configured } = fakeGoogle();
    const tokens: string[] = [];
    const r = await signInWithGoogle(deps(google, { webClientId: 'scopes-check.apps.googleusercontent.com', exchange: async (t) => (tokens.push(t), { error: null, isNewUser: true }) }));
    expect(r).toEqual({ ok: true, isNewUser: true });
    expect(tokens).toEqual(['google-id-token']);
    expect(configured).toEqual([{ webClientId: 'scopes-check.apps.googleusercontent.com', scopes: ['profile', 'email'], offlineAccess: false }]);
    expect(GOOGLE_SCOPES).toEqual(['profile', 'email']);
  });

  test('closing the Google sheet says nothing (both ways the library reports it)', async () => {
    expect(await signInWithGoogle(deps(fakeGoogle({ signIn: async () => ({ type: 'cancelled', data: null }) }).google))).toEqual({ ok: false, kind: 'cancelled', message: null });
    expect(await signInWithGoogle(deps(fakeGoogle({ signIn: async () => Promise.reject(err('SIGN_IN_CANCELLED')) }).google))).toEqual({ ok: false, kind: 'cancelled', message: null });
  });

  test('no network: checked before opening Google, and also if the connection drops midway', async () => {
    expect(await signInWithGoogle(deps(fakeGoogle().google, { isOnline: async () => false }))).toEqual({ ok: false, kind: 'offline', message: GOOGLE_MESSAGES.offline });
    expect(kindOf(await signInWithGoogle(deps(fakeGoogle({ signIn: async () => Promise.reject(err('7', 'NETWORK_ERROR')) }).google)))).toBe('offline');
    const { google, calls } = fakeGoogle();
    const r = await signInWithGoogle(deps(google, { exchange: async () => Promise.reject(new TypeError('Network request failed')) }));
    expect(kindOf(r)).toBe('offline');
    expect(calls).toContain('signOut'); // no half-signed-in state left behind
  });

  test('no Google Play services (Android)', async () => {
    const original = Platform.OS;
    (Platform as { OS: string }).OS = 'android';
    try {
      expect(await signInWithGoogle(deps(fakeGoogle({ hasPlayServices: async () => false }).google))).toEqual({ ok: false, kind: 'noPlayServices', message: GOOGLE_MESSAGES.noPlayServices });
      expect(kindOf(await signInWithGoogle(deps(fakeGoogle({ hasPlayServices: async () => Promise.reject(err('PLAY_SERVICES_NOT_AVAILABLE')) }).google)))).toBe('noPlayServices');
      expect(kindOf(await signInWithGoogle(deps(fakeGoogle({ signIn: async () => Promise.reject(err('PLAY_SERVICES_NOT_AVAILABLE')) }).google)))).toBe('noPlayServices');
    } finally {
      (Platform as { OS: string }).OS = original;
    }
  });

  test('an expired token is refreshed once and retried', async () => {
    const tokens: string[] = [];
    const r = await signInWithGoogle(
      deps(fakeGoogle().google, {
        exchange: async (t) => {
          tokens.push(t);
          return t === 'google-id-token' ? { error: { message: 'Bad ID token: token is expired' } } : { error: null };
        },
      })
    );
    expect(r.ok).toBe(true);
    expect(tokens).toEqual(['google-id-token', 'fresh-token']);
  });

  test('a token that stays expired gets a calm "try again", and Google is signed out', async () => {
    const { google, calls } = fakeGoogle();
    const r = await signInWithGoogle(deps(google, { exchange: async () => ({ error: { message: 'ID token has expired' } }) }));
    expect(r).toEqual({ ok: false, kind: 'expired', message: GOOGLE_MESSAGES.expired });
    expect(calls).toContain('signOut');
  });

  test('not set up, not available in this build, already open, or no token: defined results', async () => {
    expect(kindOf(await signInWithGoogle(deps(fakeGoogle().google, { webClientId: undefined })))).toBe('notConfigured');
    expect(kindOf(await signInWithGoogle(deps(null)))).toBe('unavailable');
    expect(await signInWithGoogle(deps(fakeGoogle({ signIn: async () => Promise.reject(err('IN_PROGRESS')) }).google))).toEqual({ ok: false, kind: 'inProgress', message: null });
    expect(kindOf(await signInWithGoogle(deps(fakeGoogle({ signIn: async () => ({ type: 'success', data: { idToken: null, user: { email: 'x@y.z' } } }) }).google)))).toBe('failed');
  });

  test("an unknown Google failure keeps Google's code for diagnosis, separate from the calm message", async () => {
    const r = await signInWithGoogle(deps(fakeGoogle({ signIn: async () => Promise.reject(err('10', 'DEVELOPER_ERROR')) }).google));
    expect(r).toEqual({ ok: false, kind: 'failed', message: GOOGLE_MESSAGES.failed, code: 'Google 10' });
  });

  test('every message is calm: no codes, no blame, no exclamation marks', () => {
    for (const m of Object.values(GOOGLE_MESSAGES)) {
      if (m === null) continue;
      expect(m).not.toMatch(/error|failed|invalid|!|\d{2,}/i);
    }
  });

  test('signing out also signs out of Google; deleting the account also revokes access', async () => {
    const a = fakeGoogle();
    await signOutOfGoogle(a.google);
    expect(a.calls).toEqual(['signOut']);
    const b = fakeGoogle();
    await signOutOfGoogle(b.google, true);
    expect(b.calls).toEqual(['revokeAccess', 'signOut']);
    await expect(signOutOfGoogle(null)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// One email = one account = one trial
//
// A model of Supabase Auth's documented automatic identity linking (see
// docs/google-signin-setup.md): a Google sign-in whose verified email matches
// an existing user is linked to that user; if that user never confirmed their
// email, the unconfirmed email/password identity is removed and the Google
// identity is linked to the same user. The live check is in the setup doc.
// ---------------------------------------------------------------------------
function fakeSupabaseAuth() {
  type User = { id: string; email: string; confirmed: boolean; identities: Set<'email' | 'google'>; password?: string };
  const users = new Map<string, User>(); // by email
  let n = 0;
  return {
    users,
    signUp(email: string, password: string) {
      const existing = users.get(email);
      if (existing) return { userId: existing.id, identities: existing.confirmed ? [] : ['email'] };
      const u: User = { id: `user-${++n}`, email, confirmed: false, identities: new Set(['email']), password };
      users.set(email, u);
      return { userId: u.id, identities: ['email'] };
    },
    confirm(email: string) {
      users.get(email)!.confirmed = true;
    },
    signInWithPassword(email: string, password: string) {
      const u = users.get(email);
      if (!u || !u.identities.has('email') || u.password !== password) return { error: 'Invalid login credentials' };
      if (!u.confirmed) return { error: 'Email not confirmed' };
      return { userId: u.id };
    },
    signInWithGoogle(email: string) {
      // Google says the email is verified.
      const u = users.get(email);
      if (!u) {
        const created: User = { id: `user-${++n}`, email, confirmed: true, identities: new Set(['google']) };
        users.set(email, created);
        return { userId: created.id, isNewUser: true };
      }
      if (!u.confirmed) {
        u.identities.delete('email'); // the unconfirmed password login is dropped
        u.password = undefined;
        u.confirmed = true;
      }
      u.identities.add('google');
      return { userId: u.id, isNewUser: false };
    },
  };
}

function memoryStorage(): StateStorage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

// The trial server, one trial per user id (as start_trial() does).
function trialServer(userIdRef: { current: string }) {
  const trials = new Map<string, number>();
  const started: string[] = [];
  const answer = (newly: boolean): RawEntitlement => {
    const t = trials.get(userIdRef.current);
    return { server_time: new Date().toISOString(), trial_started_at: t ? new Date(t).toISOString() : null, trial_ends_at: t ? new Date(t + 30 * 86_400_000).toISOString() : null, trial_newly_started: newly, subscription: null };
  };
  const server: EntitlementServer = {
    startTrial: async () => {
      const newly = !trials.has(userIdRef.current);
      if (newly) {
        trials.set(userIdRef.current, Date.now());
        started.push(userIdRef.current);
      }
      return answer(newly);
    },
    getEntitlement: async () => answer(false),
  };
  return { server, started };
}

describe('one email, one account, one trial', () => {
  test('email/password first (confirmed), then Google with the same email: same account, same trial', async () => {
    const auth = fakeSupabaseAuth();
    const me = { current: '' };
    const { server, started } = trialServer(me);

    const created = auth.signUp('sam@example.com', 'secret1');
    auth.confirm('sam@example.com');
    me.current = auth.signInWithPassword('sam@example.com', 'secret1').userId!;
    await refreshEntitlement(me.current, server, createEntitlementStore(memoryStorage()));

    const viaGoogle = auth.signInWithGoogle('sam@example.com');
    expect(viaGoogle.userId).toBe(created.userId);
    expect(viaGoogle.isNewUser).toBe(false);
    me.current = viaGoogle.userId;
    const store = createEntitlementStore(memoryStorage()); // e.g. a second phone
    await refreshEntitlement(me.current, server, store);
    expect(started).toEqual([created.userId]); // one trial, ever
    expect(computeEntitlement(store.getState().snapshots[me.current], Date.now()).state).toBe('trial');
    // Both ways in still work.
    expect(auth.signInWithPassword('sam@example.com', 'secret1').userId).toBe(created.userId);
  });

  test('email/password never confirmed, then Google: still one account; the unconfirmed password login is dropped', async () => {
    const auth = fakeSupabaseAuth();
    const me = { current: '' };
    const { server, started } = trialServer(me);
    const created = auth.signUp('alex@example.com', 'secret1');
    expect(auth.signInWithPassword('alex@example.com', 'secret1').error).toBe('Email not confirmed');

    const viaGoogle = auth.signInWithGoogle('alex@example.com');
    expect(viaGoogle.userId).toBe(created.userId);
    expect(auth.users.size).toBe(1);
    me.current = viaGoogle.userId;
    await refreshEntitlement(me.current, server, createEntitlementStore(memoryStorage()));
    expect(started).toEqual([created.userId]);
    // Someone who registered the address without owning it can't get in.
    expect(auth.signInWithPassword('alex@example.com', 'secret1').error).toBe('Invalid login credentials');
  });

  test('Google first, then signing up with the same email: told to sign in instead, no second account', () => {
    const auth = fakeSupabaseAuth();
    const viaGoogle = auth.signInWithGoogle('kim@example.com');
    const again = auth.signUp('kim@example.com', 'secret1');
    expect(again.userId).toBe(viaGoogle.userId);
    expect(again.identities).toEqual([]); // what the app turns into "This email already has an Ona account"
    expect(auth.users.size).toBe(1);
  });

  test('the same account on this phone keeps syncing after switching sign-in method', async () => {
    const rows = new Map<string, RemoteRow>();
    const server: SyncServer = {
      pull: async () => [...rows.values()],
      push: async (batch) => batch.forEach((r) => rows.set(`${r.collection}/${r.record_id}`, { ...r, server_updated_at: new Date().toISOString() })),
    };
    const data = new Map<string, unknown>([['feelings.entries', [{ id: 'f1', feelingId: 'calm' }]]]);
    const local: LocalData = { read: (c) => data.get(c) ?? [], write: (c, v) => void data.set(c, v) };
    const auth = fakeSupabaseAuth();
    const id = auth.signUp('sam@example.com', 'secret1').userId;
    auth.confirm('sam@example.com');
    const first = await syncOnce(id, server, EMPTY_SYNC_STATE, local);
    const viaGoogle = auth.signInWithGoogle('sam@example.com');
    await expect(syncOnce(viaGoogle.userId, server, first.state, local)).resolves.toBeDefined(); // not "another account"
    // A genuinely different account would be refused.
    await expect(syncOnce('someone-else', server, first.state, local)).rejects.toBeInstanceOf(OtherAccountError);
  });
});

describe('Google accounts behave exactly like email accounts', () => {
  test('trial, entitlement and the sync gate depend only on the account, not how it signed in', async () => {
    const auth = fakeSupabaseAuth();
    const results = [];
    for (const how of ['email', 'google'] as const) {
      const email = `${how}@example.com`;
      let userId: string;
      if (how === 'email') {
        auth.signUp(email, 'secret1');
        auth.confirm(email);
        userId = auth.signInWithPassword(email, 'secret1').userId!;
      } else userId = auth.signInWithGoogle(email).userId;
      const me = { current: userId };
      const { server } = trialServer(me);
      const store = createEntitlementStore(memoryStorage());
      await refreshEntitlement(userId, server, store);
      const e = computeEntitlement(store.getState().snapshots[userId], Date.now());
      const gate = syncGate({ configured: true, signedIn: true, consentStoreData: true, syncAccess: e.syncAccess, paused: false, offline: false });
      results.push({ state: e.state, days: e.trialDaysLeft, access: e.syncAccess, gate: gate.allowed });
    }
    expect(results[1]).toEqual(results[0]);
    expect(results[0]).toEqual({ state: 'trial', days: 30, access: true, gate: true });
  });

  test('deleting a Google account follows the same steps, plus revoking Google access', async () => {
    const steps: string[] = [];
    const g = fakeGoogle();
    const result = await deleteAccount(false, {
      isOnline: async () => true,
      deleteOnServer: async () => (steps.push('server'), { error: null }),
      signOutLocally: async () => {
        steps.push('signOut');
        await signOutOfGoogle(g.google, true);
      },
      wipeLocalData: async () => void steps.push('wipe'),
      forgetAccount: () => void steps.push('forget'),
    });
    expect(result).toEqual({ ok: true });
    expect(steps).toEqual(['server', 'signOut', 'forget', 'wipe']);
    expect(g.calls).toEqual(['revokeAccess', 'signOut']);
  });
});
