// useEntitlement() rules: the entitlement matrix, trial boundaries, server
// time vs the device clock, the offline cache, and one trial per account.
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import type { StateStorage } from 'zustand/middleware';
import {
  computeEntitlement,
  estimateServerNow,
  hasSyncAccess,
  snapshotFromRaw,
  type EntitlementSnapshot,
  type RawEntitlement,
  type ServerSubscription,
  type SubscriptionStatus,
} from '../entitlement';
import { refreshEntitlement, type EntitlementServer } from '../entitlementSync';
import { createEntitlementStore } from '../../store/useEntitlementStore';
import { syncGate } from '../sync';
import { setAnalyticsTransport, type OutgoingEvent } from '../analytics';
import { useSettingsStore } from '../../store/useSettingsStore';
import { buildExport } from '../localData';
import { forcedSnapshot } from '../../hooks/useEntitlement';

const DAY = 86_400_000;
const T0 = Date.parse('2026-10-01T12:00:00Z'); // trial start (server time)
const iso = (ms: number) => new Date(ms).toISOString();

function snap(o: { now?: number; trial?: boolean | { endsAt: number }; sub?: Partial<ServerSubscription> | null; fetchedAt?: number }): EntitlementSnapshot {
  const now = o.now ?? T0;
  return {
    userId: 'u1',
    serverTime: iso(now),
    fetchedAt: o.fetchedAt ?? now,
    trial: o.trial ? { startedAt: iso(T0), endsAt: iso(typeof o.trial === 'object' ? o.trial.endsAt : T0 + 30 * DAY) } : null,
    subscription: o.sub ? { status: 'active', expiresAt: iso(now + 20 * DAY), isLifetime: false, willRenew: true, ...o.sub } : null,
  };
}

describe('entitlement matrix', () => {
  const now = T0 + 10 * DAY;
  const subs: Record<string, Partial<ServerSubscription> | null> = {
    none: null,
    active: { status: 'active' },
    canceledActive: { status: 'active', willRenew: false },
    canceledStatus: { status: 'canceled' },
    grace: { status: 'grace' },
    onHold: { status: 'on_hold' },
    paused: { status: 'paused' },
    expired: { status: 'expired', expiresAt: iso(now - DAY) },
    refunded: { status: 'refunded' },
    activeButPastEnd: { status: 'active', expiresAt: iso(now - 1) },
    lifetime: { status: 'active', isLifetime: true, expiresAt: null },
    lifetimeRefunded: { status: 'refunded', isLifetime: true, expiresAt: null },
  };
  // [subscription, trial] → [state, syncAccess]
  const cases: [string, 'active' | 'ended' | 'none', string, boolean][] = [];
  const expectBySub: Record<string, [string, boolean]> = {
    none: ['free', false],
    active: ['subscribed', true],
    canceledActive: ['canceledActive', true],
    canceledStatus: ['canceledActive', true],
    grace: ['grace', true],
    onHold: ['onHold', false],
    paused: ['onHold', false],
    expired: ['expired', false],
    refunded: ['expired', false],
    activeButPastEnd: ['expired', false],
    lifetime: ['lifetime', true],
    lifetimeRefunded: ['expired', false],
  };
  for (const sub of Object.keys(subs)) {
    for (const trial of ['active', 'ended', 'none'] as const) {
      let [state, access] = expectBySub[sub];
      if (!access) {
        if (trial === 'active') [state, access] = ['trial', true];
        else if (trial === 'ended' && sub === 'none') state = 'trialEnded';
      }
      cases.push([sub, trial, state, access]);
    }
  }

  test.each(cases)('subscription %s + trial %s → %s (sync %s)', (sub, trial, state, access) => {
    const s = snap({
      now,
      sub: subs[sub],
      trial: trial === 'none' ? false : trial === 'active' ? true : { endsAt: now - DAY },
    });
    const e = computeEntitlement(s, now);
    expect(e.state).toBe(state);
    expect(e.syncAccess).toBe(access);
    expect(hasSyncAccess(e.state)).toBe(access);
    expect(e.isLifetime).toBe(state === 'lifetime');
  });

  test('no account (no snapshot) is the free plan', () => {
    expect(computeEntitlement(null, now)).toMatchObject({ state: 'free', syncAccess: false });
  });

  test('renewal and end dates are exposed', () => {
    expect(computeEntitlement(snap({ now, sub: { status: 'active', expiresAt: '2026-11-11T00:00:00.000Z' } }), now).renewsAt).toBe('2026-11-11T00:00:00.000Z');
    const canceled = computeEntitlement(snap({ now, sub: { status: 'active', willRenew: false, expiresAt: '2026-10-20T00:00:00.000Z' } }), now);
    expect(canceled.endsAt).toBe('2026-10-20T00:00:00.000Z');
    expect(canceled.renewsAt).toBeNull();
  });
});

describe('trial boundaries', () => {
  const trialSnap = (serverNow: number) => snap({ now: serverNow, trial: true });
  test.each([
    ['day 0', 0, 'trial', 30],
    ['day 29', 29 * DAY, 'trial', 1],
    ['one second before the end', 30 * DAY - 1000, 'trial', 1],
    ['the exact end moment', 30 * DAY, 'trialEnded', null],
    ['day 31', 31 * DAY, 'trialEnded', null],
  ])('%s', (_label, offset, state, daysLeft) => {
    const e = computeEntitlement(trialSnap(T0 + (offset as number)), T0 + (offset as number));
    expect(e.state).toBe(state);
    expect(e.trialDaysLeft).toBe(daysLeft);
  });

  test('the same moment written in another time zone gives the same answer', () => {
    const a = snap({ now: T0 + 29 * DAY, trial: true });
    const b = { ...a, serverTime: '2026-10-30T14:00:00+02:00', trial: { startedAt: '2026-10-01T15:00:00+03:00', endsAt: '2026-10-31T09:00:00-03:00' } };
    expect(Date.parse(b.serverTime)).toBe(Date.parse(a.serverTime));
    const ea = computeEntitlement(a, a.fetchedAt);
    const eb = computeEntitlement(b, a.fetchedAt);
    expect([eb.state, eb.trialDaysLeft, eb.syncAccess]).toEqual([ea.state, ea.trialDaysLeft, ea.syncAccess]);
    expect(Date.parse(eb.trialEndsAt!)).toBe(Date.parse(ea.trialEndsAt!));
  });
});

describe('server time wins over the device clock', () => {
  const fetchedAtDevice = Date.parse('2026-10-29T12:00:00Z');
  const s = snap({ now: T0 + 28 * DAY, trial: true, fetchedAt: fetchedAtDevice }); // 2 days left by the server

  test('real time passing on the device moves the estimate forward', () => {
    expect(estimateServerNow(s, fetchedAtDevice + DAY)).toBe(T0 + 29 * DAY);
    expect(computeEntitlement(s, fetchedAtDevice + 3 * DAY).state).toBe('trialEnded');
  });

  test('winding the phone back never makes the trial younger', () => {
    const wayBack = fetchedAtDevice - 365 * DAY;
    expect(estimateServerNow(s, wayBack)).toBe(T0 + 28 * DAY);
    expect(computeEntitlement(s, wayBack).trialDaysLeft).toBe(2); // not 367
  });

  test('a device clock set to the wrong zone or year does not matter once the server answers', () => {
    // Phone thinks it is 2030; the server says day 5 of the trial.
    const phoneNow = Date.parse('2030-01-01T00:00:00Z');
    const fresh = snapshotFromRaw('u1', raw({ serverNow: T0 + 5 * DAY }), phoneNow);
    expect(computeEntitlement(fresh, phoneNow)).toMatchObject({ state: 'trial', trialDaysLeft: 25 });
  });
});

function raw(o: { serverNow: number; trial?: boolean; newly?: boolean; sub?: RawEntitlement['subscription'] }): RawEntitlement {
  return {
    server_time: iso(o.serverNow),
    trial_started_at: o.trial === false ? null : iso(T0),
    trial_ends_at: o.trial === false ? null : iso(T0 + 30 * DAY),
    trial_newly_started: o.newly,
    subscription: o.sub ?? null,
  };
}

function memoryStorage(): StateStorage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

// A fake account server: one trial per account, started on first request.
function fakeServer(clock: () => number) {
  const trials = new Map<string, number>();
  let user = 'u1';
  let online = true;
  const calls: string[] = [];
  const answer = (newly: boolean): RawEntitlement => {
    const started = trials.get(user);
    return {
      server_time: iso(clock()),
      trial_started_at: started === undefined ? null : iso(started),
      trial_ends_at: started === undefined ? null : iso(started + 30 * DAY),
      trial_newly_started: newly,
      subscription: null,
    };
  };
  const server: EntitlementServer = {
    startTrial: async () => {
      calls.push('startTrial');
      if (!online) throw new Error('Network request failed');
      const newly = !trials.has(user);
      if (newly) trials.set(user, clock());
      return answer(newly);
    },
    getEntitlement: async () => {
      calls.push('get');
      if (!online) throw new Error('Network request failed');
      return answer(false);
    },
  };
  return { server, calls, setOnline: (v: boolean) => (online = v), setUser: (u: string) => (user = u) };
}

describe('starting the trial and caching', () => {
  const sent: OutgoingEvent[] = [];
  beforeAll(() => {
    useSettingsStore.getState().setConsent({ analytics: true });
    setAnalyticsTransport((e) => sent.push(e));
  });
  afterAll(() => setAnalyticsTransport(null));
  beforeEach(() => (sent.length = 0));

  test('the first sign-in starts the trial on the server', async () => {
    let serverClock = T0;
    const f = fakeServer(() => serverClock);
    const store = createEntitlementStore(memoryStorage());
    expect(await refreshEntitlement('u1', f.server, store, () => T0)).toBe(true);
    const e = computeEntitlement(store.getState().snapshots.u1, T0);
    expect(e).toMatchObject({ state: 'trial', trialDaysLeft: 30, syncAccess: true });
    expect(sent.map((x) => x.name)).toEqual(['trial_started']);
    // Later launches just read it.
    serverClock = T0 + DAY;
    await refreshEntitlement('u1', f.server, store, () => T0 + DAY);
    expect(f.calls).toEqual(['startTrial', 'get']);
  });

  test('reinstalling (empty cache) does not restart the trial', async () => {
    let serverClock = T0;
    const f = fakeServer(() => serverClock);
    const firstInstall = createEntitlementStore(memoryStorage());
    await refreshEntitlement('u1', f.server, firstInstall, () => T0);

    serverClock = T0 + 20 * DAY;
    const reinstall = createEntitlementStore(memoryStorage()); // all local storage gone
    await refreshEntitlement('u1', f.server, reinstall, () => serverClock);
    const e = computeEntitlement(reinstall.getState().snapshots.u1, serverClock);
    expect(e).toMatchObject({ state: 'trial', trialDaysLeft: 10 });
    expect(e.trialEndsAt).toBe(iso(T0 + 30 * DAY));
    expect(sent.filter((x) => x.name === 'trial_started')).toHaveLength(1);
  });

  test('a second account gets its own trial', async () => {
    const f = fakeServer(() => T0 + 40 * DAY);
    const store = createEntitlementStore(memoryStorage());
    await refreshEntitlement('u1', f.server, store, () => T0 + 40 * DAY);
    f.setUser('u2');
    await refreshEntitlement('u2', f.server, store, () => T0 + 40 * DAY);
    expect(computeEntitlement(store.getState().snapshots.u2, T0 + 40 * DAY).state).toBe('trial');
  });

  test('offline: the cached answer is used, nothing is cleared, and sync resumes after reconnecting', async () => {
    let clock = T0;
    const f = fakeServer(() => clock);
    const store = createEntitlementStore(memoryStorage());
    await refreshEntitlement('u1', f.server, store, () => clock);
    const cached = store.getState().snapshots.u1;

    f.setOnline(false);
    clock = T0 + 2 * DAY;
    expect(await refreshEntitlement('u1', f.server, store, () => clock)).toBe(false);
    expect(store.getState().snapshots.u1).toBe(cached); // kept, not cleared
    expect(store.getState().lastError).toMatch(/Network/);
    const offline = computeEntitlement(store.getState().snapshots.u1, clock);
    expect(offline.syncAccess).toBe(true);
    const gate = { configured: true, signedIn: true, syncAccess: offline.syncAccess, consentStoreData: true, paused: false };
    expect(syncGate({ ...gate, offline: true })).toMatchObject({ allowed: false, reason: 'offline' });

    f.setOnline(true);
    expect(await refreshEntitlement('u1', f.server, store, () => clock)).toBe(true);
    expect(syncGate({ ...gate, offline: false })).toEqual({ allowed: true });
  });

  test('the cache survives a restart', async () => {
    const storage = memoryStorage();
    const f = fakeServer(() => T0);
    const a = createEntitlementStore(storage);
    await refreshEntitlement('u1', f.server, a, () => T0);
    const b = createEntitlementStore(storage);
    await b.persist.rehydrate();
    expect(b.getState().snapshots.u1.trial?.endsAt).toBe(iso(T0 + 30 * DAY));
    expect(b.getState().trialRequested.u1).toBe(true);
  });

  test('the end of a trial is noticed once', async () => {
    let clock = T0;
    const f = fakeServer(() => clock);
    const store = createEntitlementStore(memoryStorage());
    await refreshEntitlement('u1', f.server, store, () => clock);
    clock = T0 + 31 * DAY;
    await refreshEntitlement('u1', f.server, store, () => clock);
    await refreshEntitlement('u1', f.server, store, () => clock);
    expect(sent.filter((x) => x.name === 'trial_ended')).toHaveLength(1);
  });

  test('two refreshes at once share one request', async () => {
    const f = fakeServer(() => T0);
    const store = createEntitlementStore(memoryStorage());
    await Promise.all([refreshEntitlement('u1', f.server, store, () => T0), refreshEntitlement('u1', f.server, store, () => T0)]);
    expect(f.calls).toEqual(['startTrial']);
  });
});

describe('only sync is gated', () => {
  test('every state, including ended and on hold, leaves local data fully readable and exportable', () => {
    for (const state of ['free', 'trialEnded', 'expired', 'onHold'] as const) {
      const e = computeEntitlement(forcedSnapshot(state, T0), T0);
      expect(e.state).toBe(state);
      expect(e.syncAccess).toBe(false);
      const data = buildExport();
      expect(Object.keys(data.sections).length).toBeGreaterThan(10);
    }
  });

  test('developer forced states map to the states they name', () => {
    for (const state of ['free', 'trial', 'trialEnded', 'subscribed', 'canceledActive', 'grace', 'onHold', 'expired', 'lifetime'] as const) {
      expect(computeEntitlement(forcedSnapshot(state, T0), T0).state).toBe(state);
    }
  });
});
