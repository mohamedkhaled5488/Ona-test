// Row-level security on the real schema (supabase/migrations), local stack.
// One account must never read, change, add to or delete another account's
// data: not through the app's client, and not by calling the REST API
// directly with a valid token. IDs: docs/test-cases/backend.md
import { admin, anon, APP_TABLES, countRows, newUser, rest, seedEveryTable, TABLE_ROWS } from './local';

const ALL_USER_TABLES = [...APP_TABLES, 'sync_records', 'account_trials', 'subscriptions'];

async function twoUsersWithData() {
  const a = await newUser('a');
  const b = await newUser('b');
  await seedEveryTable(a.id);
  await admin().from('account_trials').insert({ user_id: a.id, trial_ends_at: new Date(Date.now() + 86_400_000).toISOString() });
  await admin().from('subscriptions').insert({ user_id: a.id, status: 'active' });
  return { a, b };
}

test('BE-RLS-001 signing up creates exactly one profile, and a user sees only their own', async () => {
  const { a, b } = await twoUsersWithData();
  expect(await countRows('profiles', a.id)).toBe(1);
  const { data } = await b.db.from('profiles').select('id, email');
  expect(data).toEqual([{ id: b.id, email: b.email }]);
});

test('BE-RLS-002 in every table, user B reads none of user A\'s rows, while A reads all of them', async () => {
  const { a, b } = await twoUsersWithData();
  for (const table of ALL_USER_TABLES) {
    const asB = await b.db.from(table).select('*');
    expect({ table, error: asB.error, rows: asB.data }).toEqual({ table, error: null, rows: [] });
    const asA = await a.db.from(table).select('user_id');
    expect({ table, rows: asA.data }).toEqual({ table, rows: [{ user_id: a.id }] });
  }
});

test('BE-RLS-003 user B can\'t add a row in A\'s name to any table', async () => {
  const { a, b } = await twoUsersWithData();
  for (const [table, row] of Object.entries(TABLE_ROWS)) {
    const { error } = await b.db.from(table).insert({ ...row, user_id: a.id, ...(table === 'feeling_bookmarks' ? { feeling_id: 'other' } : {}) });
    expect({ table, code: error?.code }).toEqual({ table, code: '42501' });
  }
  const sync = await b.db.from('sync_records').insert({ user_id: a.id, collection: 'x.y', record_id: 'r', data: {}, client_updated_at: new Date().toISOString() });
  expect(sync.error?.code).toBe('42501');
});

test('BE-RLS-004 user B\'s updates and deletes of A\'s rows change nothing', async () => {
  const { a, b } = await twoUsersWithData();
  for (const table of [...APP_TABLES, 'sync_records']) {
    const upd = await b.db.from(table).update({ user_id: b.id }).eq('user_id', a.id).select();
    expect({ table, rows: upd.data }).toEqual({ table, rows: [] });
    const del = await b.db.from(table).delete().eq('user_id', a.id).select();
    expect({ table, rows: del.data }).toEqual({ table, rows: [] });
    expect({ table, left: await countRows(table, a.id) }).toEqual({ table, left: 1 });
  }
  const journal = await admin().from('journal_entries').select('text').eq('user_id', a.id).single();
  expect(journal.data?.text).toBe('Private words');
});

test('BE-RLS-005 a user can\'t hand their own row over to someone else', async () => {
  const { a, b } = await twoUsersWithData();
  await seedEveryTable(b.id);
  for (const table of APP_TABLES) {
    const { error } = await b.db.from(table).update({ user_id: a.id }).eq('user_id', b.id);
    expect({ table, code: error?.code }).toEqual({ table, code: '42501' });
  }
});

test('BE-RLS-006 calling the REST API directly with B\'s valid token and a filter on A\'s id returns nothing', async () => {
  const { a, b } = await twoUsersWithData();
  for (const table of ['journal_entries', 'feeling_checkins', 'sync_records', 'subscriptions']) {
    const res = await rest(`${table}?user_id=eq.${a.id}&select=*`, { token: b.token });
    expect({ table, status: res.status, body: res.body }).toEqual({ table, status: 200, body: [] });
  }
  const patch = await rest(`journal_entries?user_id=eq.${a.id}`, { method: 'PATCH', token: b.token, body: { text: 'changed' }, prefer: 'return=representation' });
  expect(patch.body).toEqual([]);
  const del = await rest(`journal_entries?user_id=eq.${a.id}`, { method: 'DELETE', token: b.token, prefer: 'return=representation' });
  expect(del.body).toEqual([]);
  expect(await countRows('journal_entries', a.id)).toBe(1);
});

test('BE-RLS-007 without signing in, nothing can be read, written or called', async () => {
  const { a } = await twoUsersWithData();
  const db = anon();
  for (const table of [...ALL_USER_TABLES, 'profiles', 'revenuecat_events']) {
    const { data } = await db.from(table).select('*');
    expect({ table, rows: data ?? [] }).toEqual({ table, rows: [] });
  }
  expect((await db.from('journal_entries').insert({ ...TABLE_ROWS.journal_entries, user_id: a.id })).error).not.toBeNull();
  for (const fn of ['get_entitlement', 'start_trial', 'delete_my_server_data', 'delete_my_account']) {
    const { error } = await db.rpc(fn);
    expect({ fn, denied: !!error }).toEqual({ fn, denied: true });
  }
  expect(await countRows('journal_entries', a.id)).toBe(1);
});

test('BE-RLS-008 the app can\'t give itself a trial or a subscription, or touch webhook records', async () => {
  const u = await newUser('cheat');
  const trial = await u.db.from('account_trials').insert({ user_id: u.id, trial_ends_at: '2099-01-01T00:00:00Z' });
  expect(trial.error?.code).toBe('42501');
  const sub = await u.db.from('subscriptions').insert({ user_id: u.id, status: 'active', is_lifetime: true });
  expect(sub.error?.code).toBe('42501');
  await u.db.rpc('start_trial');
  const longer = await u.db.from('account_trials').update({ trial_ends_at: '2099-01-01T00:00:00Z' }).eq('user_id', u.id).select();
  expect(longer.data).toEqual([]);
  expect((await u.db.from('revenuecat_events').insert({ id: 'x', type: 'TEST', outcome: 'x' })).error).not.toBeNull();
  expect((await u.db.from('revenuecat_events').select('*')).data ?? []).toEqual([]);
});

test('BE-RLS-009 a user can\'t ask the server whether another account has sync access', async () => {
  const { a, b } = await twoUsersWithData(); // A has an active subscription
  const { data } = await b.db.rpc('has_sync_access', { uid: a.id });
  expect(data).toBe(false);
  expect((await a.db.rpc('has_sync_access', { uid: a.id })).data).toBe(true);
});
