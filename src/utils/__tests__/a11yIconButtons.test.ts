// Every button that shows only an icon has a name a screen reader can say
// ("Close", "Delete plan", "Previous month"). Without one, TalkBack users hear
// just "button". This scans every screen and component.
const fs = require('fs') as { readdirSync: (p: string, o: { withFileTypes: true }) => { name: string; isDirectory: () => boolean }[]; readFileSync: (p: string, e: string) => string };
const path = require('path') as { join: (...p: string[]) => string; relative: (a: string, b: string) => string };

const SRC = path.join(process.cwd(), 'src');
const files = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (e.name === '__tests__' ? [] : files(path.join(dir, e.name))) : e.name.endsWith('.tsx') ? [path.join(dir, e.name)] : []
  );

// A Pressable whose only child is an icon (attributes may contain "=>").
const ICON_ONLY = /<(Pressable|TouchableOpacity)\b((?:(?!<\/Pressable>|<Pressable|<\/TouchableOpacity>)[\s\S]){0,700}?)>\s*(<Ionicons\b(?:(?!\/>)[\s\S])*\/>)\s*<\/(Pressable|TouchableOpacity)>/g;

test('A11Y-001 every icon-only button has an accessibilityLabel', () => {
  const missing: string[] = [];
  for (const f of files(SRC)) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(ICON_ONLY)) {
      if (m[2].includes('<') || m[2].includes('accessibilityLabel')) continue;
      missing.push(`${path.relative(SRC, f)}:${src.slice(0, m.index).split('\n').length}`);
    }
  }
  expect(missing).toEqual([]);
});
