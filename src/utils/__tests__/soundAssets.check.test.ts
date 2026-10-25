// The sleep-sound acceptance checks (scripts/check-sound-assets.js) catch
// what they're for, and the generated sounds (scripts/generate-sleep-sounds.js)
// pass them. IDs: docs/test-cases/integration.md (AUDIO-ASSET-*)
const { check } = require('../../../scripts/check-sound-assets.js') as {
  check: (x: Float32Array, rate: number) => { problems: string[]; seconds: number; repeat: { r: number; lag: number } };
};
const { SOUNDS, SR } = require('../../../scripts/generate-sleep-sounds.js') as { SOUNDS: Record<string, () => Float32Array>; SR: number };

jest.setTimeout(120_000);
const made: Record<string, Float32Array> = {};
beforeAll(() => {
  for (const [name, make] of Object.entries(SOUNDS)) made[name] = make();
});

test('AUDIO-ASSET-001 every generated sound passes: 2-3 minutes, seamless, no clipping, the same loudness, no repetition within 60 s', () => {
  for (const [name, x] of Object.entries(made)) expect({ name, problems: check(x, SR).problems }).toEqual({ name, problems: [] });
  expect(Object.keys(made).sort()).toEqual(['brown-noise', 'fan', 'forest', 'ocean', 'pink-noise', 'rain', 'white-noise']);
});

test('AUDIO-ASSET-002 a short loop copied to fill 2 minutes is caught, at its own length', () => {
  const clip = made.rain.subarray(0, 15 * SR);
  const tiled = new Float32Array(clip.length * 8);
  for (let i = 0; i < 8; i++) tiled.set(clip, i * clip.length);
  const r = check(tiled, SR);
  expect(r.problems.join(' ')).toMatch(/repeats every 15\.0 s/);
});

test('AUDIO-ASSET-003 too short, a click at the loop point, and clipping are caught', () => {
  expect(check(made.rain.subarray(0, 30 * SR), SR).problems.join(' ')).toMatch(/only 30\.0 s/);
  const clicky = Float32Array.from(made['brown-noise']);
  clicky[clicky.length - 1] = clicky[0] + 0.3;
  expect(check(clicky, SR).problems.join(' ')).toMatch(/click at the loop point/);
  const clipped = Float32Array.from(made.fan);
  clipped[1000] = 1;
  expect(check(clipped, SR).problems.join(' ')).toMatch(/clips/);
});

test('AUDIO-ASSET-004 the generator is deterministic: the same files every time', () => {
  const again = SOUNDS.ocean();
  expect(again.length).toBe(made.ocean.length);
  expect(again.every((v, i) => v === made.ocean[i])).toBe(true);
});
