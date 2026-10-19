// Finds the local Supabase stack (`npx supabase start`) and hands its URL and
// local keys to the test workers. Refuses anything that isn't on this
// machine, so these tests can never touch a hosted project.
const { execSync } = require('child_process');
const path = require('path');
const baseSetup = require('../../jest.globalSetup');

module.exports = async () => {
  await baseSetup();
  let out;
  try {
    out = execSync('npx supabase status -o env', { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    throw new Error('The local Supabase stack is not running. Start Docker, then run: npx supabase start');
  }
  const env = {};
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  const url = env.API_URL;
  if (!url || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) {
    throw new Error(`Backend tests only run against a local stack; got API_URL=${url ?? '(none)'}`);
  }
  if (!env.ANON_KEY || !env.SERVICE_ROLE_KEY || !env.JWT_SECRET) throw new Error('`supabase status` did not list the local keys');
  process.env.ONA_SB_URL = url;
  process.env.ONA_SB_ANON = env.ANON_KEY;
  process.env.ONA_SB_SERVICE = env.SERVICE_ROLE_KEY; // the local stack's built-in key, not a project's
  process.env.ONA_SB_JWT_SECRET = env.JWT_SECRET;
};
