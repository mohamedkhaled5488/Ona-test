/// <reference types="node" />
// The revenuecat-webhook Edge Function, served locally
// (`npx supabase functions serve revenuecat-webhook --no-verify-jwt --env-file supabase/tests/webhook.env`),
// writing to the local database. IDs: docs/test-cases/backend.md
import { randomUUID } from 'crypto';
import { admin, DAY, newUser } from './local';

const AUTH = 'Bearer local-test-only'; // supabase/tests/webhook.env
const endpoint = () => `${process.env.ONA_SB_URL}/functions/v1/revenuecat-webhook`;

async function send(event: Record<string, unknown> | null, init: { auth?: string | null; method?: string; raw?: string } = {}) {
  const res = await fetch(endpoint(), {
    method: init.method ?? 'POST',
    headers: { 'Content-Type': 'application/json', ...(init.auth === null ? {} : { Authorization: init.auth ?? AUTH }) },
    body: init.method === 'GET' ? undefined : init.raw ?? JSON.stringify({ event }),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

let at = Date.now();
const event = (userId: string, type: string, extra: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  type,
  app_user_id: userId,
  product_id: 'ona_sync_monthly',
  entitlement_ids: ['sync_access'],
  store: 'PLAY_STORE',
  event_timestamp_ms: (at += 1000),
  expiration_at_ms: Date.now() + 30 * DAY,
  ...extra,
});
const subscription = async (userId: string) => (await admin().from('subscriptions').select('*').eq('user_id', userId).maybeSingle()).data;
const canWrite = async (u: Awaited<ReturnType<typeof newUser>>) =>
  (await u.db.from('sync_records').upsert({ user_id: u.id, collection: 'x.y', record_id: 'r', data: {}, client_updated_at: new Date().toISOString() }, { onConflict: 'user_id,collection,record_id' })).error === null;

beforeAll(async () => {
  const probe = await fetch(endpoint(), { method: 'GET' }).catch(() => null);
  if (!probe || probe.status === 404 || probe.status === 503) {
    throw new Error('Serve the function first: npx supabase functions serve revenuecat-webhook --no-verify-jwt --env-file supabase/tests/webhook.env');
  }
});

describe('BE-WH: who may call it', () => {
  test('BE-WH-001 a request without the right Authorization header is refused and changes nothing', async () => {
    const u = await newUser('wh');
    expect((await send(event(u.id, 'INITIAL_PURCHASE'), { auth: null })).status).toBe(401);
    expect((await send(event(u.id, 'INITIAL_PURCHASE'), { auth: 'Bearer wrong' })).status).toBe(401);
    expect(await subscription(u.id)).toBeNull();
  });

  test('BE-WH-002 only POST; a malformed body is a 400', async () => {
    expect((await send(null, { method: 'GET' })).status).toBe(405);
    expect((await send(null, { raw: 'not json' })).status).toBe(400);
    expect((await send({ id: 'x' })).status).toBe(400);
  });
});

describe('BE-WH: events update the subscription and sync access', () => {
  test('BE-WH-003 a purchase gives sync access; expiry takes it away', async () => {
    const u = await newUser('wh');
    expect(await canWrite(u)).toBe(false);
    expect((await send(event(u.id, 'INITIAL_PURCHASE'))).body).toEqual({ ok: true, result: 'upsert' });
    expect(await subscription(u.id)).toMatchObject({ status: 'active', will_renew: true, product_id: 'ona_sync_monthly' });
    expect(await canWrite(u)).toBe(true);
    await send(event(u.id, 'EXPIRATION', { expiration_at_ms: Date.now() - 1000 }));
    expect(await subscription(u.id)).toMatchObject({ status: 'expired', will_renew: false });
    expect(await canWrite(u)).toBe(false);
  });

  test('BE-WH-004 the same event delivered twice is applied once', async () => {
    const u = await newUser('wh');
    const purchase = event(u.id, 'INITIAL_PURCHASE');
    await send(purchase);
    await send(event(u.id, 'CANCELLATION'));
    expect((await send(purchase)).body).toEqual({ ok: true, skipped: 'duplicate' });
    expect(await subscription(u.id)).toMatchObject({ status: 'active', will_renew: false });
  });

  test('BE-WH-005 an older event arriving late can\'t roll the subscription back', async () => {
    const u = await newUser('wh');
    const old = event(u.id, 'INITIAL_PURCHASE');
    const newer = event(u.id, 'EXPIRATION', { expiration_at_ms: Date.now() - 1000 });
    await send(newer);
    expect((await send(old)).body).toEqual({ ok: true, result: 'skip' });
    expect(await subscription(u.id)).toMatchObject({ status: 'expired' });
  });

  test('BE-WH-006 billing trouble: grace keeps access, on hold ends it', async () => {
    const u = await newUser('wh');
    await send(event(u.id, 'INITIAL_PURCHASE'));
    await send(event(u.id, 'BILLING_ISSUE', { grace_period_expiration_at_ms: Date.now() + 3 * DAY }));
    expect(await subscription(u.id)).toMatchObject({ status: 'grace' });
    expect(await canWrite(u)).toBe(true);
    await send(event(u.id, 'BILLING_ISSUE', { grace_period_expiration_at_ms: null }));
    expect(await subscription(u.id)).toMatchObject({ status: 'on_hold' });
    expect(await canWrite(u)).toBe(false);
  });

  test('BE-WH-007 lifetime: survives an EXPIRATION event; a support refund ends it', async () => {
    const u = await newUser('wh');
    await send(event(u.id, 'NON_RENEWING_PURCHASE', { expiration_at_ms: null, product_id: 'ona_sync_lifetime' }));
    expect(await subscription(u.id)).toMatchObject({ status: 'active', is_lifetime: true, expires_at: null });
    await send(event(u.id, 'EXPIRATION'));
    expect(await canWrite(u)).toBe(true);
    await send(event(u.id, 'CANCELLATION', { cancel_reason: 'CUSTOMER_SUPPORT' }));
    expect(await subscription(u.id)).toMatchObject({ status: 'refunded', is_lifetime: false });
    expect(await canWrite(u)).toBe(false);
  });

  test('BE-WH-008 events for another entitlement, an anonymous buyer, or RevenueCat\'s TEST change nothing', async () => {
    const u = await newUser('wh');
    for (const e of [
      event(u.id, 'INITIAL_PURCHASE', { entitlement_ids: ['something_else'] }),
      event('$RCAnonymousID:abc', 'INITIAL_PURCHASE'),
      event(u.id, 'TEST'),
    ]) {
      expect((await send(e)).body).toEqual({ ok: true, result: 'skip' });
    }
    expect(await subscription(u.id)).toBeNull();
  });

  test('BE-WH-009 a renewal for an account that was deleted is acknowledged, not retried forever', async () => {
    const u = await newUser('gone');
    await send(event(u.id, 'INITIAL_PURCHASE'));
    await u.db.rpc('delete_my_account');
    const renewal = event(u.id, 'RENEWAL');
    const res = await send(renewal);
    expect(res.status).toBe(200);
    expect(await subscription(u.id)).toBeNull();
    // Recorded as handled, so a redelivery is a no-op too.
    const { data } = await admin().from('revenuecat_events').select('outcome').eq('id', renewal.id).single();
    expect(data?.outcome).toBe('skip:unknownUser');
    expect((await send(renewal)).body).toEqual({ ok: true, skipped: 'duplicate' });
  });
});
