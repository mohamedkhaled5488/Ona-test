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

const yaml = require('js-yaml') as { loadAll: (s: string) => unknown[] };

// Each flow parsed as Maestro parses it: a config document, then commands.
const commandsOf = (f: string) => (yaml.loadAll(read(f))[1] ?? []) as unknown[];

// The regex escapes Maestro itself sees (\? and \.), for comparing with the source.
const unescape = (s: string) => s.replace(/\\([?.])/g, '$1');

// Positive selectors only: assertNotVisible / notVisible text is meant to be absent.
function selectors(f: string): { text: string[]; ids: string[]; typed: string[] } {
  const text: string[] = [];
  const ids: string[] = [];
  const typed: string[] = [];
  const selector = (sel: unknown) => {
    if (typeof sel === 'string') text.push(unescape(sel));
    else if (sel && typeof sel === 'object') {
      const o = sel as { text?: string; id?: string };
      if (o.text) text.push(unescape(o.text));
      if (o.id) ids.push(o.id);
    }
  };
  const walk = (cmds: unknown[]) => {
    for (const c of cmds) {
      if (!c || typeof c !== 'object') continue;
      for (const [name, arg] of Object.entries(c as Record<string, unknown>)) {
        const a = arg as Record<string, unknown>;
        if (name === 'tapOn' || name === 'assertVisible') selector(arg);
        else if (name === 'inputText' && typeof arg === 'string') typed.push(arg);
        else if (name === 'extendedWaitUntil' && a?.visible) selector(a.visible);
        else if (name === 'scrollUntilVisible') selector(a?.element);
        else if (name === 'runFlow' && typeof arg === 'object') {
          const flow = arg as { when?: { visible?: unknown }; commands?: unknown[] };
          if (flow.when?.visible) selector(flow.when.visible);
          if (flow.commands) walk(flow.commands);
        }
      }
    }
  };
  walk(commandsOf(f));
  return { text, ids, typed };
}

describe('E2E-GUARD: the Maestro flows match the app', () => {
  // A file Maestro can't parse stops every flow (the first CI run did exactly
  // this: "\." inside a double-quoted YAML string is not a valid escape).
  test('E2E-GUARD-000 every flow is valid YAML with a list of commands', () => {
    for (const f of flowFiles) {
      let commands: unknown;
      expect(() => (commands = commandsOf(f))).not.toThrow();
      expect({ f, isList: Array.isArray(commands) && (commands as unknown[]).length > 0 }).toEqual({ f, isList: true });
    }
  });

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
      const { text, typed } = selectors(f);
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
      for (const id of selectors(f).ids) expect({ f, id, found: SOURCE.includes(`testID="${id}"`) }).toEqual({ f, id, found: true });
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
    expect(gh).toMatch(/script: bash scripts\/e2e-run\.sh/);
    expect(fs.readFileSync(path.join(ROOT, 'scripts/e2e-run.sh'), 'utf8')).toMatch(/--exclude-tags needs-backend/);
    expect(gh).not.toMatch(/secrets\./);
  });
});
