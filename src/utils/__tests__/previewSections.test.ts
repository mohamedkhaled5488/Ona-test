// The owner's own APK previews Reflection, Letters to Myself and Support
// before they're live (EAS profile "personal" only). Every other build keeps
// them held, and Songwriting and Mind Games can never be previewed.
// IDs: docs/test-cases/integration.md (PREVIEW-*)
const eas = require('../../../eas.json') as { build: Record<string, { env?: Record<string, string>; extends?: string }> };

const ORIGINAL = process.env.EXPO_PUBLIC_PREVIEW_SECTIONS;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.EXPO_PUBLIC_PREVIEW_SECTIONS;
  else process.env.EXPO_PUBLIC_PREVIEW_SECTIONS = ORIGINAL;
  jest.resetModules();
});
const load = () => require('../../data/sectionsMeta') as typeof import('../../data/sectionsMeta');

test('PREVIEW-001 no preview list: all three stay held', () => {
  delete process.env.EXPO_PUBLIC_PREVIEW_SECTIONS;
  const m = load();
  for (const id of ['reflection', 'letters', 'support'] as const) expect(m.isLive(id)).toBe(false);
});

test('PREVIEW-002 the personal build\'s list turns on exactly those three; Songwriting and Mind Games stay held whatever the list says', () => {
  process.env.EXPO_PUBLIC_PREVIEW_SECTIONS = 'reflection, letters,support,songwriting,mindGames';
  const m = load();
  expect(['reflection', 'letters', 'support'].every((id) => m.isLive(id as never))).toBe(true);
  expect(m.isLive('songwriting')).toBe(false);
  expect(m.isLive('mindGames')).toBe(false);
  expect(m.heldSectionIds().sort()).toEqual(['mindGames', 'songwriting']);
});

test('PREVIEW-003 only the personal profile sets it: testers, the store and the test builds never preview', () => {
  expect(eas.build.personal.env?.EXPO_PUBLIC_PREVIEW_SECTIONS).toBe('reflection,letters,support');
  for (const [name, profile] of Object.entries(eas.build)) {
    if (name === 'personal') continue;
    expect({ name, previews: !!profile.env?.EXPO_PUBLIC_PREVIEW_SECTIONS }).toEqual({ name, previews: false });
  }
  // The personal profile extends preview; preview itself must not set it.
  expect(eas.build.preview.env?.EXPO_PUBLIC_PREVIEW_SECTIONS).toBeUndefined();
});
