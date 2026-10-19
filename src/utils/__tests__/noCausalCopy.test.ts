// No text anywhere in Ona claims a cause or a diagnosis: insights say what
// showed up together, with the counts, never "X causes Y", "makes you",
// "because of", or clinical labels. A sentence may still say what something
// is NOT ("never a diagnosis", "not causes"). Scans every string and JSX
// text in the app, not just the insight builders (those have their own
// tests too). IDs: docs/audit-report.md (AUD-SCAN-01)
const fs = require('fs') as { readFileSync: (p: string, e: string) => string; readdirSync: (p: string, o: { withFileTypes: true }) => { name: string; isDirectory: () => boolean }[] };
const path = require('path') as { join: (...p: string[]) => string; relative: (a: string, b: string) => string };

function files(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!['__tests__', 'test-utils'].includes(e.name)) files(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const withoutComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .map((l) => l.replace(/\s\/\/\s.*$/, ''))
    .join('\n');

// What a person can read: string literals and JSX text with at least two
// words (single words are ids such as 'relapse').
function texts(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`|>([^<>{}]+)</g)) {
    const t = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? '').trim();
    if (/\s/.test(t) && /[a-z]/i.test(t)) out.push(t);
  }
  return out;
}

const CLAIM = /\b(causes?|caused|causing|makes you|made you|because of|leads? to|results? in|due to|diagnos(?:is|es|e|ed|ing)\b|disorder|addict\w*)\b/i;
// Saying what it is NOT is the honest kind of sentence.
const NEGATED = /\b(not|never|no|isn't|aren't|doesn't|don't|without)\b[^.]*$/i;

// Reviewed one by one, with the reason each is allowed.
const ALLOWED: Record<string, string> = {
  'caused by,': 'MoodCheckScreen: the JSX around it reads `not "caused by," just logged together`',
  'Note what caused it, so you can intentionally seek it out again': "feelings wheel guidance: asks the person to reflect for themselves; Ona claims nothing",
  'Check the basics: sleep, food, movement (the PLEASE skill, DBT) — tiredness often has a simple physical cause.': 'general wellbeing tip, not about their data; left for the owner to decide (AUD-07)',
};

test('AUD-SCAN-01 no text in the app claims a cause or makes a diagnosis', () => {
  const found: string[] = [];
  for (const file of files(path.join(process.cwd(), 'src'))) {
    for (const t of texts(withoutComments(fs.readFileSync(file, 'utf8')))) {
      const m = t.match(CLAIM);
      if (!m) continue;
      const before = t.slice(0, m.index);
      if (NEGATED.test(before) || t in ALLOWED) continue;
      found.push(`${path.relative(process.cwd(), file)}: "${t.slice(0, 120)}"`);
    }
  }
  expect(found).toEqual([]);
});

test('AUD-SCAN-02 the scan catches a causal sentence and lets a negation through', () => {
  const flagged = (t: string) => {
    const m = t.match(CLAIM);
    return !!m && !NEGATED.test(t.slice(0, m.index));
  };
  expect(flagged('Coffee makes you calmer')).toBe(true);
  expect(flagged('Your low days are because of sleep')).toBe(true);
  expect(flagged('Things that showed up together. Never a diagnosis.')).toBe(false);
  expect(flagged('counts from your own logs: not a ranking, and not causes.')).toBe(false);
});
