// "Delete the copy in my account" and "Delete my account", on the real
// schema (local stack). Each acts on the caller only. IDs: docs/test-cases/backend.md
import { admin, APP_TABLES, countRows, newUser, seedEveryTable } from './local';

const EVERY_TABLE = [...APP_TABLES, 'sync_records'];

test('BE-DEL-001 deleting the server copy removes every row of mine in every table, keeps my account and trial, and leaves others alone', async () => {
  const a = await newUser('a');
  const b = await newUser('b');
  await a.db.rpc('start_trial');
  await seedEveryTable(a.id);
  await seedEveryTable(b.id);
  const { error } = await a.db.rpc('delete_my_server_data');
  expect(error).toBeNull();
  for (const table of EVERY_TABLE) {
    expect({ table, mine: await countRows(table, a.id), theirs: await countRows(table, b.id) }).toEqual({ table, mine: 0, theirs: 1 });
  }
  expect(await countRows('profiles', a.id)).toBe(1);
  expect(await countRows('account_trials', a.id)).toBe(1); // so deleting data can't restart the trial
});

test('BE-DEL-002 deleting my account removes the account and everything tied to it, and nothing of anyone else\'s', async () => {
  const a = await newUser('a');
  const b = await newUser('b');
  await a.db.rpc('start_trial');
  await admin().from('subscriptions').insert({ user_id: a.id, status: 'active' });
  await seedEveryTable(a.id);
  await seedEveryTable(b.id);
  expect((await a.db.rpc('delete_my_account')).error).toBeNull();
  expect((await admin().auth.admin.getUserById(a.id)).data.user).toBeNull();
  for (const table of [...EVERY_TABLE, 'profiles', 'account_trials', 'subscriptions']) {
    expect({ table, mine: await countRows(table, a.id) }).toEqual({ table, mine: 0 });
  }
  for (const table of EVERY_TABLE) expect({ table, theirs: await countRows(table, b.id) }).toEqual({ table, theirs: 1 });
  expect((await admin().auth.admin.getUserById(b.id)).data.user?.id).toBe(b.id);
});

test('BE-DEL-003 after the account is deleted, its old token can\'t write anything back', async () => {
  const a = await newUser('a');
  await a.db.rpc('start_trial');
  await a.db.rpc('delete_my_account');
  const { error } = await a.db.from('journal_entries').insert({ user_id: a.id, date: '2026-10-18', mood: 'okay' });
  expect(error).not.toBeNull();
  const sync = await a.db.from('sync_records').insert({ user_id: a.id, collection: 'x.y', record_id: 'r', data: {}, client_updated_at: new Date().toISOString() });
  expect(sync.error).not.toBeNull();
  expect(await countRows('journal_entries', a.id)).toBe(0);
});

test('BE-DEL-004 calling either one twice is harmless', async () => {
  const a = await newUser('a');
  await seedEveryTable(a.id);
  expect((await a.db.rpc('delete_my_server_data')).error).toBeNull();
  expect((await a.db.rpc('delete_my_server_data')).error).toBeNull();
  expect((await a.db.rpc('delete_my_account')).error).toBeNull();
  expect((await a.db.rpc('delete_my_account')).error).toBeNull();
});
