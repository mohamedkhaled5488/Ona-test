// Sign-in methods against the real local stack (manual linking on, as the
// staging and production projects need): what an email account lists, the
// server refusing to remove the last way in, and a password added for email
// sign-in. (Linking Google needs a real Google token: on a phone, MAN-108.)
// IDs: docs/test-cases/backend.md (BE-LINK-*)
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { LINKING_COPY, listSignInMethods, setPassword, unlinkMethod, type LinkingAuth } from '../../src/auth/linking';
import { admin } from './local';

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
async function signedIn() {
  const email = `link-${randomUUID()}@ona.test`;
  const password = randomUUID();
  const { error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(error.message);
  const client = createClient(process.env.ONA_SB_URL!, process.env.ONA_SB_ANON!, noSession);
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw new Error(e2.message);
  return { client, email };
}

test('BE-LINK-001 an email account lists one way in: email, with its address', async () => {
  const { client, email } = await signedIn();
  const r = await listSignInMethods(client.auth as unknown as LinkingAuth);
  expect(r).toMatchObject({ ok: true, methods: [{ provider: 'email', email }] });
});

test('BE-LINK-002 the server refuses to remove the last way in, and Ona says so plainly', async () => {
  const { client } = await signedIn();
  const auth = client.auth as unknown as LinkingAuth;
  const r = (await listSignInMethods(auth)) as { ok: true; methods: Parameters<typeof unlinkMethod>[1] };
  // Ona never asks (one method); asked directly, the server refuses too.
  expect(await unlinkMethod(auth, r.methods, r.methods[0])).toEqual({ ok: false, message: LINKING_COPY.lastMethod });
  const direct = await client.auth.unlinkIdentity(r.methods[0].raw as never);
  expect(direct.error).not.toBeNull();
});

test('BE-LINK-003 a new password works for signing in', async () => {
  const { client, email } = await signedIn();
  expect(await setPassword(client.auth as unknown as LinkingAuth, 'another-long-password')).toEqual({ ok: true });
  const again = createClient(process.env.ONA_SB_URL!, process.env.ONA_SB_ANON!, noSession);
  const { error } = await again.auth.signInWithPassword({ email, password: 'another-long-password' });
  expect(error).toBeNull();
});
