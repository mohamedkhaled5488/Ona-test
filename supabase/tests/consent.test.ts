// "Store my data in my account", kept with the account (migration 0007), on
// the local stack: each account reads and changes only its own answer.
// IDs: docs/test-cases/backend.md (BE-CON-*)
import { admin, anon, newUser, rest } from './local';

test('BE-CON-001 a new account has not answered yet; it can say yes, and read its answer back', async () => {
  const u = await newUser('con');
  const before = await u.db.from('profiles').select('store_data_consent, store_data_consent_at').eq('id', u.id).single();
  expect(before.data).toEqual({ store_data_consent: null, store_data_consent_at: null });
  const at = new Date().toISOString();
  expect((await u.db.from('profiles').update({ store_data_consent: true, store_data_consent_at: at }).eq('id', u.id)).error).toBeNull();
  const after = await u.db.from('profiles').select('store_data_consent').eq('id', u.id).single();
  expect(after.data).toEqual({ store_data_consent: true });
});

test('BE-CON-002 one account can neither read nor change another account\'s answer', async () => {
  const a = await newUser('a');
  const b = await newUser('b');
  await a.db.from('profiles').update({ store_data_consent: true }).eq('id', a.id);
  expect((await b.db.from('profiles').select('store_data_consent').eq('id', a.id)).data).toEqual([]);
  const changed = await b.db.from('profiles').update({ store_data_consent: false }).eq('id', a.id).select();
  expect(changed.data).toEqual([]);
  const raw = await rest(`profiles?id=eq.${a.id}`, { method: 'PATCH', token: b.token, body: { store_data_consent: false }, prefer: 'return=representation' });
  expect(raw.body).toEqual([]);
  expect((await admin().from('profiles').select('store_data_consent').eq('id', a.id).single()).data).toEqual({ store_data_consent: true });
});

test('BE-CON-003 without signing in, no answer can be read or changed', async () => {
  const a = await newUser('a');
  await admin().from('profiles').update({ store_data_consent: true }).eq('id', a.id);
  expect((await anon().from('profiles').select('store_data_consent')).data ?? []).toEqual([]);
  await anon().from('profiles').update({ store_data_consent: false }).eq('id', a.id);
  expect((await admin().from('profiles').select('store_data_consent').eq('id', a.id).single()).data).toEqual({ store_data_consent: true });
});
