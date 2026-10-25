#!/usr/bin/env node
// Tester builds only from a commit that passed CI. Runs on EAS before every
// build (package.json "eas-build-pre-install") and can be run by hand:
//   node scripts/require-green-ci.js [commit]
// For the tester profile ("preview"), both workflows must have finished
// successfully on the exact commit being built: "CI" (type check, Jest, and
// the backend tests on a local Supabase) and "E2E (Android)" (Maestro).
// Anything else (still running, failed, cancelled, never run, or GitHub not
// reachable) stops the build. Other profiles are left alone.
const { execSync } = require('child_process');

const REPO = 'mohamedkhaled5488/Ona-test';
const REQUIRED = ['CI', 'E2E (Android)'];
const GUARDED_PROFILES = ['preview'];

function commitToCheck() {
  // GitHub needs the full id: a short one given by hand is resolved here.
  if (process.argv[2]) return execSync(`git rev-parse ${process.argv[2]}`).toString().trim();
  if (process.env.EAS_BUILD_GIT_COMMIT_HASH) return process.env.EAS_BUILD_GIT_COMMIT_HASH;
  return execSync('git rev-parse HEAD').toString().trim();
}

// Pure, so it can be tested: what to say about these runs.
function verdict(runs, required = REQUIRED) {
  const problems = [];
  for (const name of required) {
    const mine = runs.filter((r) => r.name === name).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const latest = mine[0];
    if (!latest) problems.push(`${name}: hasn't run on this commit (push it first)`);
    else if (latest.status !== 'completed') problems.push(`${name}: still ${latest.status}`);
    else if (latest.conclusion !== 'success') problems.push(`${name}: ${latest.conclusion} (${latest.html_url})`);
  }
  return { ok: problems.length === 0, problems };
}

async function main() {
  const profile = process.env.EAS_BUILD_PROFILE;
  if (profile && !GUARDED_PROFILES.includes(profile)) return;
  const sha = commitToCheck();
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'ona-build-check' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  let runs;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/actions/runs?head_sha=${sha}&per_page=50`, { headers });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    runs = (await res.json()).workflow_runs ?? [];
  } catch (e) {
    console.error(`✖ Can't check CI for ${sha.slice(0, 7)}: ${e.message}. No tester build without a green CI.`);
    process.exit(1);
  }
  const { ok, problems } = verdict(runs);
  if (!ok) {
    console.error(`✖ No tester build from ${sha.slice(0, 7)}: CI isn't green.\n  - ${problems.join('\n  - ')}`);
    process.exit(1);
  }
  console.log(`✔ CI and E2E passed on ${sha.slice(0, 7)}: building.`);
}

if (require.main === module) void main();
module.exports = { verdict, REQUIRED, GUARDED_PROFILES };
