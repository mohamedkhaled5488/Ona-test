// The Maestro end-to-end flows (.maestro/) tap and wait for on-screen text.
// If a label in the app is renamed, the flow would only fail on an emulator,
// so this checks every selector against the app's source on every `npm test`.
// IDs: docs/test-cases/e2e.md
const fs = require('fs') as { readFileSync: (p: string, e: string) => string; readdirSync: (p: string, o?: { withFileTypes: true }) => { name: string; isDirectory: () => boolean }[]; existsSync: (p: string) => boolean };
const path = require('path') as { join: (...p: string[]) => string; dirname: (p: string) => string };

const ROOT = process.cwd();
const FLOWS = path.join(ROOT, '.maestro');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__') walk(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const SOURCE = walk(path.join(ROOT, 'src')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');

const flowFiles = [
  ...fs.readdirSync(FLOWS, { withFileTypes: true }).filter((e) => !e.isDirectory() && e.name.endsWith('.yaml') && e.name !== 'config.yaml').map((e) => e.name),
  ...fs.readdirSync(path.join(FLOWS, 'subflows'), { withFileTypes: true }).map((e) => `subflows/${e.name}`),
];
const read = (f: string) => fs.readFileSync(path.join(FLOWS, f), 'utf8');

// Text that is built at run time (from what the flow typed, or a template),
// with the piece of source that produces it.
const DYNAMIC: Record<string, string> = {
  'Felt calm': 'Felt {feeling.label.toLowerCase()}',
  'Calm: Pleasant, quiet': "label: 'Calm', description: 'Pleasant, quiet'",
  'Mark "Buy running shoes" done': 'Mark "${resolved.title}" done',
  'Mark "Buy running shoes" not done': 'Mark "${resolved.title}" not done',
  'Add to .*': 'label={`Add to ${formatDisplayDate(date)}',
  'Added to Daily Planning for .*': 'Added to Daily Planning for ${date}',
  'Marked done today.*': "Marked {todayEntry.done ? 'done' : 'missed'}",
  '.*2 chapters so far.*': 'chapters so far',
  '(Home|Check .* for a confirmation link, then come back and sign in.)':'for a confirmation link, then come back and sign in.',
};

// YAML's escapes first (a doubled backslash, an escaped quote), then the
// regex escapes Maestro itself sees (\? and \.).
const unescape = (s: string) => s.replace(/\\(["\\])/g, '$1').replace(/\\([?.])/g, '$1');

// Positive selectors only: assertNotVisible text is meant to be absent.
function selectors(yaml: string): { text: string[]; ids: string[]; typed: string[] } {
  const text: string[] = [];
  const ids: string[] = [];
  const typed: string[] = [];
  for (const line of yaml.split(/\r?\n/)) {
    if (/^\s*#/.test(line) || /assertNotVisible|notVisible/.test(line)) continue;
    const m = line.match(/^\s*-?\s*(tapOn|assertVisible|visible|element|text|id|inputText):\s*"((?:[^"\\]|\\.)*)"\s*$/);
    if (!m) continue;
    const value = unescape(m[2]);
    if (m[1] === 'id') ids.push(value);
    else if (m[1] === 'inputText') typed.push(value);
    else text.push(value);
  }
  return { text, ids, typed };
}

describe('E2E-GUARD: the Maestro flows match the app', () => {
  test('E2E-GUARD-001 every flow targets the app\'s Android package and every journey has a tag', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo.android.package;
    for (const f of flowFiles) {
      expect({ f, appId: read(f).match(/^appId:\s*(\S+)/m)?.[1] }).toEqual({ f, appId: pkg });
      if (!f.startsWith('subflows/')) expect({ f, tagged: /^tags:\s*\n\s+- (core|needs-backend)/m.test(read(f)) }).toEqual({ f, tagged: true });
    }
  });

  test('E2E-GUARD-002 every subflow a flow runs exists', () => {
    for (const f of flowFiles) {
      for (const [, ref] of read(f).matchAll(/runFlow:\s*(\S+\.yaml)/g)) {
        expect({ f, ref, exists: fs.existsSync(path.join(FLOWS, ref)) }).toEqual({ f, ref, exists: true });
      }
    }
  });

  test('E2E-GUARD-003 every text a flow taps or waits for is in the app (or is what the flow typed)', () => {
    const missing: string[] = [];
    for (const f of flowFiles) {
      const { text, typed } = selectors(read(f));
      for (const t of text) {
        if (typed.includes(t)) continue;
        // "write one journal line" is typed and also the placeholder's example.
        const evidence = DYNAMIC[t] ?? t.replace(/^\.\*/, '');
        if (!SOURCE.includes(evidence)) missing.push(`${f}: "${t}"`);
      }
    }
    expect(missing).toEqual([]);
  });

  test('E2E-GUARD-004 every id a flow taps is a testID in the app', () => {
    for (const f of flowFiles) {
      for (const id of selectors(read(f)).ids) expect({ f, id, found: SOURCE.includes(`testID="${id}"`) }).toEqual({ f, id, found: true });
    }
  });

  test('E2E-GUARD-005 the e2e build never points at a hosted Supabase project', () => {
    const eas = JSON.parse(fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8'));
    const e2e = eas.build['e2e-test'];
    expect(e2e).toBeDefined();
    // eas.json doesn't allow empty values: a port on the emulator itself
    // where nothing listens, and a key that is no key at all.
    expect(e2e.env.EXPO_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:9');
    expect(e2e.env.EXPO_PUBLIC_SUPABASE_ANON_KEY).toBe('e2e-no-server');
    expect(e2e.environment).toBeUndefined();
    const workflow = fs.readFileSync(path.join(ROOT, '.eas/workflows/e2e-test-android.yml'), 'utf8');
    expect(workflow).toMatch(/exclude_tags:\s*\[?'?needs-backend/);
    expect(workflow).toMatch(/EXPO_PUBLIC_SUPABASE_URL: http:\/\/127\.0\.0\.1:9\n/);
    expect(workflow).toMatch(/EXPO_PUBLIC_SUPABASE_ANON_KEY: e2e-no-server\n/);
    // The GitHub Actions run, likewise.
    const gh = fs.readFileSync(path.join(ROOT, '.github/workflows/e2e-android.yml'), 'utf8');
    expect(gh).toMatch(/EXPO_PUBLIC_SUPABASE_URL: http:\/\/127\.0\.0\.1:9\n/);
    expect(gh).toMatch(/EXPO_PUBLIC_SUPABASE_ANON_KEY: e2e-no-server\n/);
    expect(gh).toMatch(/--exclude-tags needs-backend/);
    expect(gh).not.toMatch(/secrets\./);
  });
});
