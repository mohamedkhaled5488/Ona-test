// Nothing secret can end up in the app: only EXPO_PUBLIC_* variables are
// inlined into the bundle, so the app may read only those, and none of them
// may be a server key. Also scans the app's code and config for anything
// that looks like a server key. IDs: docs/audit-report.md (AUD-SCAN-03)
const fs = require('fs') as { readFileSync: (p: string, e: string) => string; readdirSync: (p: string, o: { withFileTypes: true }) => { name: string; isDirectory: () => boolean }[] };
const path = require('path') as { join: (...p: string[]) => string; relative: (a: string, b: string) => string };

const ROOT = process.cwd();
function files(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!['__tests__', 'test-utils'].includes(e.name)) files(p, out);
    } else if (/\.(ts|tsx|js|json)$/.test(e.name)) out.push(p);
  }
  return out;
}
const APP_FILES = [...files(path.join(ROOT, 'src')), path.join(ROOT, 'App.tsx'), path.join(ROOT, 'app.json'), path.join(ROOT, 'app.config.js'), path.join(ROOT, 'eas.json')];

test('AUD-SCAN-03a the app reads only public (EXPO_PUBLIC_) variables, and none is a server key', () => {
  const vars = new Set<string>();
  for (const f of APP_FILES.filter((f) => !f.endsWith('.json') && !f.endsWith('app.config.js'))) {
    for (const [, name] of fs.readFileSync(f, 'utf8').matchAll(/process\.env\.([A-Z0-9_]+)/g)) vars.add(name);
  }
  const notPublic = [...vars].filter((v) => !v.startsWith('EXPO_PUBLIC_') && v !== 'NODE_ENV');
  expect(notPublic).toEqual([]);
  expect([...vars].filter((v) => /SERVICE|SECRET|PRIVATE|WEBHOOK/.test(v))).toEqual([]);
});

test('AUD-SCAN-03b no server key or private key is written into the app\'s code or config', () => {
  const KEYLIKE = /sb_secret_[A-Za-z0-9_-]{8,}|"role"\s*:\s*"service_role"|-----BEGIN [A-Z ]*PRIVATE KEY|SUPABASE_SERVICE_ROLE_KEY\s*[=:]\s*['"]?ey/;
  const found = APP_FILES.filter((f) => KEYLIKE.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(ROOT, f));
  expect(found).toEqual([]);
  // A JWT embedded anywhere would be a key: decode each and check its role.
  for (const f of APP_FILES) {
    for (const [jwt] of fs.readFileSync(f, 'utf8').matchAll(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)) {
      const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')) as { role?: string };
      expect({ file: path.relative(ROOT, f), role: payload.role }).not.toEqual({ file: path.relative(ROOT, f), role: 'service_role' });
    }
  }
});
