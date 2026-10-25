// Real-account tests against the STAGING Supabase project (nightly in CI, and
// before tester builds): supabase/tests/globalSetup.staging.js refuses to run
// unless every value points at staging and none at production. The service
// key comes only from CI secrets.
const backend = require('./jest.backend.config.js');

module.exports = {
  ...backend,
  testMatch: ['<rootDir>/supabase/tests/realAccount.test.ts', '<rootDir>/supabase/tests/staging.schema.test.ts'],
  globalSetup: '<rootDir>/supabase/tests/globalSetup.staging.js',
  maxWorkers: 1,
};
