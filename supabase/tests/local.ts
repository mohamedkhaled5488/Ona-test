/// <reference types="node" />
// Helpers for the backend tests. Everything here talks to the local stack
// that globalSetup.js found (and checked is on this machine).
import { createHmac, randomUUID } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = () => process.env.ONA_SB_URL!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

// Bypasses row-level security: used only to arrange a test (seed rows, move
// a trial's end date) and to check what is really stored.
export function admin(): SupabaseClient {
  return createClient(url(), process.env.ONA_SB_SERVICE!, noSession);
}

// Not signed in: just the public anon key.
export function anon(): SupabaseClient {
  return createClient(url(), process.env.ONA_SB_ANON!, noSession);
}

const b64url = (x: string | Buffer) => Buffer.from(x).toString('base64url');

// A signed-in user's access token, as Supabase Auth would issue it (signed
// with the local stack's JWT secret). Avoids Auth's sign-in rate limit.
export function tokenFor(userId: string, email: string): string {
  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ sub: userId, email, role: 'authenticated', aud: 'authenticated', iat, exp: iat + 3600 }));
  const sig = createHmac('sha256', process.env.ONA_SB_JWT_SECRET!).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export interface TestUser {
  id: string;
  email: string;
  token: string;
  db: SupabaseClient; // this user's own client: every request carries their token
}

// A brand-new account (as if just signed up), unique to the calling test.
export async function newUser(label = 'user'): Promise<TestUser> {
  const email = `${label}-${randomUUID()}@ona.test`;
  const { data, error } = await admin().auth.admin.createUser({ email, password: randomUUID(), email_confirm: true });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  const token = tokenFor(data.user.id, email);
  const db = createClient(url(), process.env.ONA_SB_ANON!, { ...noSession, global: { headers: { Authorization: `Bearer ${token}` } } });
  return { id: data.user.id, email, token, db };
}

// The REST API called directly, with a user's token (or none).
export async function rest(path: string, init: { method?: string; token?: string; body?: unknown; prefer?: string } = {}) {
  const res = await fetch(`${url()}/rest/v1/${path}`, {
    method: init.method ?? 'GET',
    headers: {
      apikey: process.env.ONA_SB_ANON!,
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      'Content-Type': 'application/json',
      ...(init.prefer ? { Prefer: init.prefer } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

export async function setTrial(userId: string, endsAt: Date, startedAt = new Date(endsAt.getTime() - 30 * 86_400_000)) {
  const { error } = await admin().from('account_trials').upsert({ user_id: userId, trial_started_at: startedAt.toISOString(), trial_ends_at: endsAt.toISOString() });
  if (error) throw new Error(error.message);
}

export async function setSubscription(userId: string, row: { status: string; expires_at?: string | null; is_lifetime?: boolean; will_renew?: boolean }) {
  const { error } = await admin().from('subscriptions').upsert({ user_id: userId, expires_at: null, is_lifetime: false, will_renew: true, ...row });
  if (error) throw new Error(error.message);
}

export const DAY = 86_400_000;
export const fromNow = (ms: number) => new Date(Date.now() + ms);

// One valid row per app table (only the columns each one requires).
export const TABLE_ROWS: Record<string, Record<string, unknown>> = {
  plans: { title: 'Run a 10K' },
  plan_templates: { name: 'Template' },
  daily_tasks: { date: '2026-10-18', title: 'Task' },
  day_templates: { name: 'Morning' },
  day_reflections: { date: '2026-10-18', text: 'Fine day' },
  journal_entries: { date: '2026-10-18', mood: 'okay', text: 'Private words' },
  journal_settings: {},
  thoughts: { kind: 'idea', text: 'An idea' },
  study_sessions: { date: '2026-10-18', focus_minutes: 25 },
  planned_meals: { date: '2026-10-18', slot: 'lunch', name: 'Soup' },
  favorite_meals: { name: 'Soup' },
  grocery_items: { label: 'Bread' },
  diet_settings: {},
  songs: { song_type_id: 'pop' },
  game_results: { game_id: 'memory', difficulty: 'easy', score: 10 },
  feeling_checkins: { feeling_id: 'calm', family: 'calm', date: '2026-10-18' },
  feeling_bookmarks: { feeling_id: 'calm' },
  feeling_guidance_votes: { vote_key: 'calm::Breathe' },
  reading_list_entries: { book_id: 'b1', status: 'want', book: { title: 'A book' } },
};
export const APP_TABLES = Object.keys(TABLE_ROWS);

export async function seedEveryTable(userId: string) {
  const db = admin();
  for (const [table, row] of Object.entries(TABLE_ROWS)) {
    const { error } = await db.from(table).insert({ ...row, user_id: userId });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  const { error } = await db.from('sync_records').insert({ user_id: userId, collection: 'journaling.entries', record_id: 'e1', data: { text: 'Private words' }, client_updated_at: new Date().toISOString() });
  if (error) throw new Error(`sync_records: ${error.message}`);
}

export async function countRows(table: string, userId: string): Promise<number> {
  const { count, error } = await admin().from(table).select('*', { count: 'exact', head: true }).eq(table === 'profiles' ? 'id' : 'user_id', userId);
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}
