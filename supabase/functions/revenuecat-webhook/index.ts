// Supabase Edge Function: receives RevenueCat webhooks and keeps the
// `subscriptions` row current. The server is the source of truth for sync
// access; the app only reads it (get_entitlement()).
//
// Secrets (supabase secrets set …):
//   REVENUECAT_WEBHOOK_AUTH  the Authorization header value set in RevenueCat
//   REVENUECAT_SECRET_KEY    RevenueCat secret API key (for TRANSFER events)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
//
// Deploy without JWT verification (RevenueCat doesn't send a Supabase JWT):
//   supabase functions deploy revenuecat-webhook --no-verify-jwt
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { applyEvent, resolveUserId, rowFromSubscriber, safeEqual, type RcEvent, type SubscriptionRow } from './logic.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function loadRow(userId: string): Promise<SubscriptionRow | null> {
  const { data, error } = await admin.from('subscriptions').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data as SubscriptionRow | null) ?? null;
}

// False when the account no longer exists (deleted in the app while the
// store subscription lives on): there's nothing to update, and an error
// would make RevenueCat retry the event forever.
async function saveRow(row: SubscriptionRow): Promise<boolean> {
  const { error } = await admin.from('subscriptions').upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error?.code === '23503') return false; // no such user
  if (error) throw error;
  return true;
}

async function alreadyProcessed(eventId: string): Promise<boolean> {
  const { data, error } = await admin.from('revenuecat_events').select('id').eq('id', eventId).maybeSingle();
  if (error) throw error;
  return !!data;
}

async function markProcessed(event: RcEvent, outcome: string): Promise<void> {
  // Recorded only after the row is saved, so a failed attempt is retried.
  const { error } = await admin.from('revenuecat_events').upsert({ id: event.id, type: event.type, outcome }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw error;
}

async function fetchSubscriber(userId: string) {
  const key = Deno.env.get('REVENUECAT_SECRET_KEY');
  if (!key) throw new Error('REVENUECAT_SECRET_KEY is not set');
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`RevenueCat API ${res.status}`);
  const body = await res.json();
  return body.subscriber;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  const expected = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');
  const given = req.headers.get('Authorization') ?? '';
  if (!expected || !safeEqual(given, expected)) return json(401, { error: 'unauthorized' });

  let event: RcEvent;
  try {
    event = (await req.json()).event as RcEvent;
    if (!event?.id || !event.type || typeof event.event_timestamp_ms !== 'number') throw new Error('bad event');
  } catch {
    return json(400, { error: 'invalid body' });
  }

  try {
    if (await alreadyProcessed(event.id)) return json(200, { ok: true, skipped: 'duplicate' });

    const userId = resolveUserId(event);
    const current = userId ? await loadRow(userId) : null;
    const result = applyEvent(current, event);

    if (result.action === 'upsert') {
      if (!(await saveRow(result.row))) {
        await markProcessed(event, 'skip:unknownUser');
        return json(200, { ok: true, result: 'skip' });
      }
    } else if (result.action === 'refetch') {
      for (const id of result.userIds) {
        const subscriber = await fetchSubscriber(id);
        await saveRow(rowFromSubscriber(id, subscriber, Date.now(), event.id, event.event_timestamp_ms)); // a deleted account is just skipped
      }
    }
    await markProcessed(event, result.action === 'skip' ? `skip:${result.reason}` : result.action);
    return json(200, { ok: true, result: result.action });
  } catch (e) {
    // A 5xx makes RevenueCat retry later.
    console.error('[revenuecat-webhook]', e instanceof Error ? e.message : e);
    return json(500, { error: 'processing failed' });
  }
});
