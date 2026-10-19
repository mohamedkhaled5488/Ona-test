// Node's test environment, keeping Node's real fetch: the app's test setup
// (React Native) replaces global fetch with a stub, but these tests talk to
// the local Supabase stack for real.
const NodeEnvironment = require('jest-environment-node').TestEnvironment;

module.exports = class BackendEnvironment extends NodeEnvironment {
  constructor(config, context) {
    super(config, context);
    this.global.__realFetch = fetch;
  }
};
