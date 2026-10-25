// No tester APK from a commit whose CI isn't green (scripts/require-green-ci.js,
// run by EAS before every build). IDs: docs/building.md (GATE-*)
const { verdict, stagingVerdict, REQUIRED, GUARDED_PROFILES } = require('../../../scripts/require-green-ci.js') as {
  verdict: (runs: object[]) => { ok: boolean; problems: string[] };
  stagingVerdict: (latest: object | undefined, now?: number) => string[];
  REQUIRED: string[];
  GUARDED_PROFILES: string[];
};
const fs = require('fs') as { readFileSync: (p: string, e: string) => string };

const run = (name: string, status: string, conclusion: string | null, created_at = '2026-10-25T08:00:00Z') => ({ name, status, conclusion, created_at, html_url: `https://example/${name}` });

test('GATE-001 both workflows green on the commit: build', () => {
  expect(verdict([run('CI', 'completed', 'success'), run('E2E (Android)', 'completed', 'success')])).toEqual({ ok: true, problems: [] });
});

test('GATE-002 failed, cancelled, still running or never run: no build, with the reason', () => {
  const r = verdict([run('CI', 'completed', 'failure'), run('E2E (Android)', 'in_progress', null)]);
  expect(r.ok).toBe(false);
  expect(r.problems).toEqual(['CI: failure (https://example/CI)', 'E2E (Android): still in_progress']);
  expect(verdict([run('CI', 'completed', 'success')]).problems).toEqual(["E2E (Android): hasn't run on this commit (push it first)"]);
  expect(verdict([run('CI', 'completed', 'success'), run('E2E (Android)', 'completed', 'cancelled')]).ok).toBe(false);
});

test('GATE-003 a re-run that passed counts (the latest run decides)', () => {
  const runs = [run('CI', 'completed', 'success'), run('E2E (Android)', 'completed', 'failure', '2026-10-25T08:00:00Z'), run('E2E (Android)', 'completed', 'success', '2026-10-25T09:00:00Z')];
  expect(verdict(runs).ok).toBe(true);
});

test('GATE-004 EAS runs the check before every build, guards the tester profile, and builds only committed code', () => {
  const pkg = JSON.parse(fs.readFileSync(`${process.cwd()}/package.json`, 'utf8'));
  const eas = JSON.parse(fs.readFileSync(`${process.cwd()}/eas.json`, 'utf8'));
  expect(pkg.scripts['eas-build-pre-install']).toBe('node scripts/require-green-ci.js');
  expect(eas.cli.requireCommit).toBe(true);
  expect(GUARDED_PROFILES).toContain('preview');
  expect(Object.keys(eas.build)).toContain('preview');
  expect(REQUIRED).toEqual(['CI', 'E2E (Android)']);
  const workflows = ['ci.yml', 'e2e-android.yml'].map((f) => fs.readFileSync(`${process.cwd()}/.github/workflows/${f}`, 'utf8').match(/^name:\s*(.+)$/m)?.[1].trim());
  expect(workflows).toEqual(REQUIRED); // the names the check looks for are the workflows' names
});

test('GATE-005 the real-account tests on staging: the latest nightly run passed within 30 hours, or no tester build', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  const latest = (conclusion: string, hoursAgo: number) => ({ conclusion, status: 'completed', html_url: 'https://example/staging', updated_at: new Date(now - hoursAgo * 3_600_000).toISOString() });
  expect(stagingVerdict(latest('success', 5), now)).toEqual([]);
  expect(stagingVerdict(undefined, now).join(' ')).toMatch(/hasn't run yet/);
  expect(stagingVerdict(latest('failure', 2), now).join(' ')).toMatch(/last run failure/);
  expect(stagingVerdict(latest('skipped', 2), now).join(' ')).toMatch(/last run skipped/);
  expect(stagingVerdict(latest('success', 40), now).join(' ')).toMatch(/40 h ago/);
});
