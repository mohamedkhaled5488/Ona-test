// Real-account tests against the STAGING project ("ona-staging"), never
// production. Hard guard, before any test runs: everything below must hold,
// or the run stops with nothing sent.
//   - STAGING_PROJECT_REF is set, looks like a project ref, and is not
//     PRODUCTION_PROJECT_REF (which must be set too, so the check can't pass
//     by accident);
//   - STAGING_SUPABASE_URL is exactly https://<staging ref>.supabase.co;
//   - both keys belong to that project: a JWT-style key's "ref" claim must be
//     the staging ref, and the service key must be accepted by that URL;
//   - nothing here comes from the app's .env (production).
// Then the test accounts from earlier runs (email ending @ona.test, and only
// those) are deleted, so every run starts from a known state.
const { createClient } = require('@supabase/supabase-js');
const baseSetup = require('../../jest.globalSetup');

const REF = /^[a-z0-9]{20}$/;

function jwtRef(key) {
  const parts = String(key).split('.');
  if (parts.length !== 3) return undefined; // a new-style key (sb_...): checked against the URL below
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).ref;
  } catch {
    return undefined;
  }
}

function guard(env) {
  const ref = env.STAGING_PROJECT_REF;
  const prod = env.PRODUCTION_PROJECT_REF;
  const url = env.STAGING_SUPABASE_URL;
  const problems = [];
  if (!ref || !REF.test(ref)) problems.push('STAGING_PROJECT_REF is missing or not a project ref');
  if (!prod || !REF.test(prod)) problems.push('PRODUCTION_PROJECT_REF must be set (so the guard can tell the two apart)');
  if (ref && prod && ref === prod) problems.push('STAGING_PROJECT_REF is the production project');
  if (url !== `https://${ref}.supabase.co`) problems.push('STAGING_SUPABASE_URL is not https://<STAGING_PROJECT_REF>.supabase.co');
  if (prod && url && url.includes(prod)) problems.push('STAGING_SUPABASE_URL points at production');
  for (const name of ['STAGING_SUPABASE_ANON_KEY', 'STAGING_SUPABASE_SERVICE_ROLE_KEY']) {
    if (!env[name]) problems.push(`${name} is missing`);
    const claim = jwtRef(env[name]);
    if (claim !== undefined && claim !== ref) problems.push(`${name} belongs to another project`);
  }
  if (env.EXPO_PUBLIC_SUPABASE_URL && prod && env.EXPO_PUBLIC_SUPABASE_URL.includes(prod)) problems.push("the app's production URL is in this environment: run from CI, not with .env loaded");
  return problems;
}

module.exports = async () => {
  await baseSetup();
  const env = process.env;
  const problems = guard(env);
  if (problems.length) throw new Error(`Staging guard: refusing to run.\n  - ${problems.join('\n  - ')}`);
  // The service key must be this URL's: a key from another project is refused here.
  const admin = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const probe = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (probe.error) throw new Error(`Staging guard: the service key isn't accepted by the staging URL (${probe.error.message})`);
  // A clean start: delete earlier test accounts (@ona.test only).
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Staging clean-up: ${error.message}`);
    const mine = data.users.filter((u) => (u.email ?? '').endsWith('@ona.test'));
    for (const u of mine) await admin.auth.admin.deleteUser(u.id);
    if (data.users.length < 200) break;
  }
  process.env.ONA_SB_URL = env.STAGING_SUPABASE_URL;
  process.env.ONA_SB_ANON = env.STAGING_SUPABASE_ANON_KEY;
  process.env.ONA_SB_SERVICE = env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  process.env.ONA_SB_SIGN_IN = 'password';
};
module.exports.guard = guard;
