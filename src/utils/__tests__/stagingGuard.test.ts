// The staging guard (supabase/tests/globalSetup.staging.js): the real-account
// tests never run against production. IDs: docs/building.md (STAGING-GUARD-*)
const { guard } = require('../../../supabase/tests/globalSetup.staging.js') as { guard: (env: Record<string, string | undefined>) => string[] };

const STAGING = 'abcdefghijklmnopqrst';
const PROD = 'zyxwvutsrqponmlkjihg';
const jwt = (ref: string) => `x.${Buffer.from(JSON.stringify({ ref, role: 'anon' })).toString('base64url')}.y`;
const ok = { STAGING_PROJECT_REF: STAGING, PRODUCTION_PROJECT_REF: PROD, STAGING_SUPABASE_URL: `https://${STAGING}.supabase.co`, STAGING_SUPABASE_ANON_KEY: jwt(STAGING), STAGING_SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_example' };

test('STAGING-GUARD-001 everything pointing at staging: allowed', () => {
  expect(guard(ok)).toEqual([]);
});

test('STAGING-GUARD-002 production anywhere, or a value missing: refused', () => {
  expect(guard({ ...ok, STAGING_PROJECT_REF: PROD, STAGING_SUPABASE_URL: `https://${PROD}.supabase.co`, STAGING_SUPABASE_ANON_KEY: jwt(PROD) })).toContain('STAGING_PROJECT_REF is the production project');
  expect(guard({ ...ok, STAGING_SUPABASE_URL: `https://${PROD}.supabase.co` })).toEqual(expect.arrayContaining(['STAGING_SUPABASE_URL points at production']));
  expect(guard({ ...ok, STAGING_SUPABASE_ANON_KEY: jwt(PROD) })).toContain('STAGING_SUPABASE_ANON_KEY belongs to another project');
  expect(guard({ ...ok, PRODUCTION_PROJECT_REF: undefined })).toContain('PRODUCTION_PROJECT_REF must be set (so the guard can tell the two apart)');
  expect(guard({ ...ok, STAGING_SUPABASE_SERVICE_ROLE_KEY: undefined })).toContain('STAGING_SUPABASE_SERVICE_ROLE_KEY is missing');
  expect(guard({ ...ok, EXPO_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co` }).join(' ')).toMatch(/production URL is in this environment/);
});
