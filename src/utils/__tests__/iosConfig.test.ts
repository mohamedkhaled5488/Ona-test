// The iPhone build's configuration (app.json / app.config.js / eas.json)
// stays what App Review expects: iPhone only, honest permission strings for
// what Ona really uses and none for what it doesn't, the encryption answer,
// and a privacy manifest that covers every required-reason API the installed
// packages declare. Adding a package that uses a new one fails this test.
// IDs: docs/ios-release-checklist.md (IOS-CFG-*)
const fs = require('fs') as { readFileSync: (p: string, e: string) => string; readdirSync: (p: string, o: { withFileTypes: true }) => { name: string; isDirectory: () => boolean }[]; existsSync: (p: string) => boolean };
const path = require('path') as { join: (...p: string[]) => string; relative: (a: string, b: string) => string };

const ROOT = process.cwd();
const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo;
const resolved = require(path.join(ROOT, 'app.config.js'))({ config: app }) as { plugins: (string | [string, Record<string, unknown>])[] };
const pluginOptions = (name: string) => {
  const p = resolved.plugins.find((x) => (typeof x === 'string' ? x : x[0]) === name);
  return p === undefined ? undefined : typeof p === 'string' ? {} : p[1];
};
const srcText = (() => {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== '__tests__') walk(p);
      } else if (/\.(ts|tsx)$/.test(e.name)) out.push(fs.readFileSync(p, 'utf8'));
    }
  };
  walk(path.join(ROOT, 'src'));
  return out.join('\n');
})();

test('IOS-CFG-001 iPhone only, with the agreed bundle identifier', () => {
  expect(app.ios.bundleIdentifier).toBe('app.ona');
  expect(app.ios.supportsTablet).toBe(false);
});

test('IOS-CFG-002 no microphone permission: Ona never records audio', () => {
  expect(srcText).not.toMatch(/useAudioRecorder|RecordingPresets|requestRecordingPermissionsAsync/);
  expect(pluginOptions('expo-audio')).toMatchObject({ microphonePermission: false });
  expect(pluginOptions('expo-image-picker')).toMatchObject({ microphonePermission: false });
});

test('IOS-CFG-003 every permission Ona asks for has its own plain explanation', () => {
  const picker = pluginOptions('expo-image-picker') as { cameraPermission?: string; photosPermission?: string };
  if (/launchCameraAsync|requestCameraPermissionsAsync/.test(srcText)) expect(picker.cameraPermission).toMatch(/^Ona uses your camera (to|when) .{10,}/);
  if (/launchImageLibraryAsync|requestMediaLibraryPermissionsAsync/.test(srcText)) expect(picker.photosPermission).toMatch(/^Ona uses your photo library (to|when) .{10,}/);
  if (/authenticateAsync/.test(srcText)) expect((pluginOptions('expo-local-authentication') as { faceIDPermission?: string }).faceIDPermission).toMatch(/^Ona uses Face ID to .{10,}/);
});

test('IOS-CFG-004 background audio only because Sleep sounds really play with the phone locked', () => {
  expect(pluginOptions('expo-audio')).toMatchObject({ enableBackgroundPlayback: true });
  expect(srcText).toMatch(/shouldPlayInBackground: (audioOptions|options)\.backgroundAudio/);
});

test('IOS-CFG-005 encryption: only what iOS provides (HTTPS, Keychain) and hashing, so exempt', () => {
  expect(app.ios.config.usesNonExemptEncryption).toBe(false);
  // No encryption library of our own; a new one would change the answer.
  expect(srcText).not.toMatch(/from '(crypto-js|tweetnacl|libsodium[^']*|react-native-quick-crypto|@noble\/ciphers[^']*)'/);
});

test('IOS-CFG-006 the privacy manifest declares every required-reason API the installed packages use, and no tracking', () => {
  const manifests: string[] = [];
  const find = (d: string, depth: number) => {
    if (depth > 6 || !fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!['example', 'examples', 'test', '__tests__', 'fixtures', 'android', '.bin'].includes(e.name)) find(path.join(d, e.name), depth + 1);
      } else if (e.name === 'PrivacyInfo.xcprivacy') manifests.push(path.join(d, e.name));
    }
  };
  find(path.join(ROOT, 'node_modules'), 0);
  expect(manifests.length).toBeGreaterThan(0);
  const declared = new Map<string, Set<string>>(
    app.ios.privacyManifests.NSPrivacyAccessedAPITypes.map((t: { NSPrivacyAccessedAPIType: string; NSPrivacyAccessedAPITypeReasons: string[] }) => [t.NSPrivacyAccessedAPIType, new Set(t.NSPrivacyAccessedAPITypeReasons)]),
  );
  const missing: string[] = [];
  for (const file of manifests) {
    const xml = fs.readFileSync(file, 'utf8');
    for (const block of xml.match(/<dict>[\s\S]*?<\/dict>/g) ?? []) {
      const category = block.match(/NSPrivacyAccessedAPIType<\/key>\s*<string>([^<]+)/)?.[1];
      if (!category) continue;
      for (const [, reason] of block.matchAll(/<string>([0-9A-F]{4}\.\d)<\/string>/g)) {
        if (!declared.get(category)?.has(reason)) missing.push(`${category} ${reason} (${path.relative(ROOT, file)})`);
      }
    }
  }
  expect(missing).toEqual([]);
  expect(app.ios.privacyManifests.NSPrivacyTracking).toBe(false);
  expect(app.ios.privacyManifests.NSPrivacyTrackingDomains).toEqual([]);
});

test('IOS-CFG-007 no Google sign-in on iPhone (email and Sign in with Apple instead)', () => {
  expect(pluginOptions('@react-native-google-signin/google-signin')).toBeUndefined();
});

test('IOS-CFG-008 TestFlight / App Store builds come from a store profile with automatic build numbers', () => {
  const eas = JSON.parse(fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8'));
  expect(eas.cli.appVersionSource).toBe('remote');
  expect(eas.build.production.autoIncrement).toBe(true);
  expect(eas.build.production.distribution ?? 'store').toBe('store');
  expect(eas.build.production.environment).toBe('production');
  expect(eas.build['development-simulator'].ios.simulator).toBe(true);
  expect(app.ios.buildNumber).toBeUndefined(); // EAS keeps the build number
});

test('IOS-CFG-012 the photo and camera strings name every place Ona asks for a photo', () => {
  const picker = pluginOptions('expo-image-picker') as { cameraPermission: string; photosPermission: string };
  const uses: [string, RegExp, ('camera' | 'photos')[]][] = [
    ['BudgetScreen', /receipt/, ['camera', 'photos']],
    ['BookScreen', /book (cover|page)/, ['camera', 'photos']],
    ['HabitBuilderScreen', /habit/, ['camera', 'photos']],
    ['SkillsScreen', /skill/, ['camera', 'photos']],
    ['SkillParts', /skill/, ['photos']],
    ['TaskEditorScreen', /task/, ['photos']],
  ];
  for (const [screen, words, kinds] of uses) {
    const src = fs.readFileSync(path.join(ROOT, 'src/screens', `${screen}.tsx`), 'utf8');
    for (const kind of kinds) {
      const call = kind === 'camera' ? /launchCameraAsync/ : /launchImageLibraryAsync/;
      expect({ screen, kind, uses: call.test(src) }).toEqual({ screen, kind, uses: true });
      expect({ screen, kind, named: words.test(kind === 'camera' ? picker.cameraPermission : picker.photosPermission) }).toEqual({ screen, kind, named: true });
    }
  }
  // A new screen asking for a photo has to be added above (and to the strings).
  const askers = fs.readdirSync(path.join(ROOT, 'src/screens'), { withFileTypes: true }).filter((e) => /\.tsx$/.test(e.name) && /launch(Camera|ImageLibrary)Async/.test(fs.readFileSync(path.join(ROOT, 'src/screens', e.name), 'utf8'))).map((e) => e.name.replace('.tsx', ''));
  expect(askers.sort()).toEqual(uses.map((u) => u[0]).sort());
});
