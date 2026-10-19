// Backend tests: run against the LOCAL Supabase stack only (Docker), never a
// hosted project. `npm run test:backend` resets the local database from
// supabase/migrations first, so every run starts from the real schema.
// Kept out of `npm test`, which needs no Docker.
const base = require('./package.json').jest;

module.exports = {
  ...base,
  rootDir: __dirname,
  testMatch: ['<rootDir>/supabase/tests/**/*.test.ts'],
  testEnvironment: '<rootDir>/supabase/tests/environment.js',
  globalSetup: '<rootDir>/supabase/tests/globalSetup.js',
  setupFiles: [...base.setupFiles, '<rootDir>/supabase/tests/realFetch.js'],
  testTimeout: 30_000,
  maxWorkers: 2,
};
