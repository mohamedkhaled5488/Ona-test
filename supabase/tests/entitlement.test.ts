// The trial and sync access, decided by the server (local stack). Only sync
// writes are gated; reading and deleting your own data never are. The
// server's rule must match the app's computeEntitlement() for every state.
// IDs: docs/test-cases/backend.md
jest.mock('../../src/utils/notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import { computeEntitlement, snapshotFromRaw, type RawEntitlement } from '../../src/utils/entitlement';
import { admin, DAY, fromNow, newUser, setSubscription, setTrial, type TestUser } from './local';

const record = (id = 'r1') => ({ collection: 'journaling.entries', record_id: id, data: { text: 'hi' }, client_updated_at: new Date().toISOString() });
const write = (u: TestUser, id = 'r1') => u.db.from('sync_records').upsert({ ...record(id), user_id: u.id }, { onConflict: 'user_id,collection,record_id' });

describe('BE-TRIAL: the 30-day trial', () => {
  test('BE-TRIAL-001 starts on first sign-in, on the server\'s clock, for exactly 30 days', async () => {
    const u = await newUser('trial');
    const { data, error } = await u.db.rpc('start_trial');
    expect(error).toBeNull();
    const raw = data as RawEntitlement;
    expect(raw.trial_newly_started).toBe(true);
    const started = Date.parse(raw.trial_started_at!);
    expect(Date.parse(raw.trial_ends_at!) - started).toBe(30 * DAY);
    // Started "now" by the server's clock, which it also reports.
    expect(Math.abs(Date.parse(raw.server_time) - started)).toBeLessThan(5_000);
  });

  test('BE-TRIAL-002 calling it again (another sign-in, a reinstall, a second phone) never starts a second trial', async () => {
    const u = await newUser('trial');
    const first = (await u.db.rpc('start_trial')).data as RawEntitlement;
    const again = (await u.db.rpc('start_trial')).data as RawEntitlement;
    expect(again.trial_newly_started).toBe(false);
    expect(again.trial_ends_at).toBe(first.trial_ends_at);
    expect(await admin().from('account_trials').select('user_id').eq('user_id', u.id)).toMatchObject({ data: [{ user_id: u.id }] });
  });

  test('BE-TRIAL-003 an account that never started one gets an empty answer, not an error', async () => {
    const u = await newUser('fresh');
    const raw = (await u.db.rpc('get_entitlement')).data as RawEntitlement;
    expect(raw).toMatchObject({ trial_started_at: null, trial_ends_at: null, subscription: null });
    expect(computeEntitlement(snapshotFromRaw(u.id, raw, Date.now()), Date.now()).syncAccess).toBe(false);
  });

  test('BE-TRIAL-004 the app\'s reading of the server answer during a trial is "trial", 30 days left', async () => {
    const u = await newUser('trial');
    const raw = (await u.db.rpc('start_trial')).data as RawEntitlement;
    const ent = computeEntitlement(snapshotFromRaw(u.id, raw, Date.now()), Date.now());
    expect(ent).toMatchObject({ state: 'trial', syncAccess: true, trialDaysLeft: 30 });
  });
});

describe('BE-GATE: only sync writes need access', () => {
  test('BE-GATE-001 with no trial and no subscription, sync writes are refused', async () => {
    const u = await newUser('none');
    expect((await write(u)).error?.code).toBe('42501');
  });

  test('BE-GATE-002 during the trial, sync writes go through', async () => {
    const u = await newUser('trial');
    await u.db.rpc('start_trial');
    expect((await write(u)).error).toBeNull();
  });

  test('BE-GATE-003 after the trial ends: no new writes or edits, but reading and deleting your data still work', async () => {
    const u = await newUser('ended');
    await u.db.rpc('start_trial');
    expect((await write(u, 'kept')).error).toBeNull();
    await setTrial(u.id, fromNow(-60_000));
    expect((await write(u, 'new')).error?.code).toBe('42501');
    expect((await write(u, 'kept')).error?.code).toBe('42501'); // an edit
    expect((await u.db.from('sync_records').select('record_id')).data).toEqual([{ record_id: 'kept' }]);
    expect((await u.db.from('sync_records').delete().eq('record_id', 'kept').select()).data).toHaveLength(1);
  });

  // Every subscription state the webhook can store, with the server's answer
  // and the app's, which must agree.
  const CASES: [string, Parameters<typeof setSubscription>[1], boolean][] = [
    ['active, paid up', { status: 'active', expires_at: fromNow(10 * DAY).toISOString() }, true],
    ['active, but the period ended', { status: 'active', expires_at: fromNow(-DAY).toISOString() }, false],
    ['canceled, paid time left', { status: 'canceled', expires_at: fromNow(5 * DAY).toISOString(), will_renew: false }, true],
    ['canceled, time ran out', { status: 'canceled', expires_at: fromNow(-DAY).toISOString(), will_renew: false }, false],
    ['grace (payment retrying)', { status: 'grace', expires_at: fromNow(3 * DAY).toISOString() }, true],
    ['on hold', { status: 'on_hold' }, false],
    ['paused', { status: 'paused' }, false],
    ['expired', { status: 'expired', expires_at: fromNow(-DAY).toISOString() }, false],
    ['refunded', { status: 'refunded' }, false],
    ['lifetime', { status: 'active', is_lifetime: true, will_renew: false }, true],
    ['lifetime, refunded', { status: 'refunded', is_lifetime: true, will_renew: false }, false],
  ];
  test.each(CASES)('BE-GATE-004 subscription %s: server allows sync = %s, and the app agrees', async (_label, sub, allowed) => {
    const u = await newUser('sub');
    await setSubscription(u.id, sub);
    expect((await write(u)).error === null).toBe(allowed);
    const raw = (await u.db.rpc('get_entitlement')).data as RawEntitlement;
    expect(computeEntitlement(snapshotFromRaw(u.id, raw, Date.now()), Date.now()).syncAccess).toBe(allowed);
  });

  test('BE-GATE-005 an expired trial plus an active subscription: access (either is enough)', async () => {
    const u = await newUser('both');
    await setTrial(u.id, fromNow(-DAY));
    await setSubscription(u.id, { status: 'active', expires_at: fromNow(DAY).toISOString() });
    expect((await write(u)).error).toBeNull();
  });
});

describe('BE-SYNCROW: the server\'s rules for one synced item', () => {
  async function withAccess() {
    const u = await newUser('rows');
    await u.db.rpc('start_trial');
    return u;
  }
  const row = (u: TestUser, at: string, text: string) => ({ user_id: u.id, collection: 'journaling.entries', record_id: 'e1', data: { text }, client_updated_at: at });
  const stored = async (u: TestUser) => (await admin().from('sync_records').select('*').eq('user_id', u.id).single()).data;

  test('BE-SYNCROW-001 a newer change replaces an older one; an older one arriving late is ignored', async () => {
    const u = await withAccess();
    const up = (at: string, text: string) => u.db.from('sync_records').upsert(row(u, at, text), { onConflict: 'user_id,collection,record_id' });
    await up(new Date(Date.now() - 60_000).toISOString(), 'first');
    await up(new Date(Date.now() - 30_000).toISOString(), 'newer');
    await up(new Date(Date.now() - 45_000).toISOString(), 'late, older');
    expect((await stored(u)).data).toEqual({ text: 'newer' });
  });

  test('BE-SYNCROW-002 a phone whose clock is far ahead can\'t win every future conflict (capped at server time + 5 min)', async () => {
    const u = await withAccess();
    await u.db.from('sync_records').insert(row(u, '2099-01-01T00:00:00Z', 'from the future'));
    const s = await stored(u);
    expect(Date.parse(s.client_updated_at)).toBeLessThanOrEqual(Date.now() + 5 * 60_000 + 5_000);
    // A normal change a minute later still wins.
    await u.db.from('sync_records').upsert(row(u, new Date(Date.now() + 6 * 60_000).toISOString(), 'later'), { onConflict: 'user_id,collection,record_id' });
    expect((await stored(u)).data).toEqual({ text: 'later' });
  });

  test('BE-SYNCROW-003 the pull cursor is stamped by the server, whatever the phone sends', async () => {
    const u = await withAccess();
    await u.db.from('sync_records').insert({ ...row(u, new Date().toISOString(), 'x'), server_updated_at: '2000-01-01T00:00:00Z' });
    expect(Math.abs(Date.parse((await stored(u)).server_updated_at) - Date.now())).toBeLessThan(10_000);
  });
});
