// No test depends on the real date: a test file that asks for "now"
// (todayISO(), new Date(), Date.now()) must set the clock first with
// useClock() from src/test-utils/time.ts.
const fs = require('fs') as { readdirSync: (p: string) => string[]; readFileSync: (p: string, e: string) => string };
const path = require('path') as { join: (...p: string[]) => string };

const DIR = path.join(process.cwd(), 'src/utils/__tests__');
const NOW = /todayISO\(\)|new Date\(\)|Date\.now\(\)/;
// Files that only check the real time is *not* used (or restore it).
const ALLOWED = new Set(['noRealClock.test.ts', 'testUtils.test.ts']);

test('every test file that reads "now" sets the clock first', () => {
  const offenders = fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.test.ts') && !ALLOWED.has(f))
    .filter((f) => {
      const src = fs
        .readFileSync(path.join(DIR, f), 'utf8')
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n');
      return NOW.test(src) && !src.includes('useClock(');
    });
  expect(offenders).toEqual([]);
});
