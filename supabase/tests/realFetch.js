// Runs after the app's setup files: put Node's real fetch back (see environment.js).
globalThis.fetch = globalThis.__realFetch;
