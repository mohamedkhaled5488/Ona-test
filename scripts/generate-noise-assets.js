// Generates the white / pink / brown noise loops as committed WAV assets.
// Run once (`node scripts/generate-noise-assets.js`) and commit the output —
// they're generated, not recorded, so there are no licensing concerns.
//
// 30 s, mono, 16-bit, 22.05 kHz (plenty for noise; keeps each file ~1.3 MB).
// The loop point uses an equal-power crossfade: N + F samples are generated
// and the extra F at the end are blended into the first F, so the last
// sample flows straight into the first with no click — including for brown
// noise, whose samples are correlated.
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 22050;
const SECONDS = 30;
const FADE_SECONDS = 0.5;
const TARGET_PEAK = 0.5; // leave headroom; the app sets the actual volume

// Deterministic PRNG so re-running produces byte-identical files.
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function white(n, rand) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rand() * 2 - 1;
  return out;
}

// Paul Kellet's refined pink filter (public domain, musicdsp.org).
function pink(n, rand) {
  const out = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = rand() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
  }
  return out;
}

// Leaky-integrator random walk (brown / red noise).
function brown(n, rand) {
  const out = new Float32Array(n);
  let last = 0;
  for (let i = 0; i < n; i++) {
    last = (last + 0.02 * (rand() * 2 - 1)) / 1.02;
    out[i] = last;
  }
  return out;
}

function loopable(x, n, f) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = x[i];
  for (let i = 0; i < f; i++) {
    const t = i / f;
    // Equal-power: the tail (continuing past the end) fades out while the
    // head fades in, so out[0] === x[n] — the natural successor of out[n-1].
    out[i] = x[i] * Math.sin((t * Math.PI) / 2) + x[n + i] * Math.cos((t * Math.PI) / 2);
  }
  return out;
}

function normalize(x) {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  const k = peak > 0 ? TARGET_PEAK / peak : 1;
  for (let i = 0; i < x.length; i++) x[i] *= k;
  return x;
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const n = SAMPLE_RATE * SECONDS;
const f = Math.round(SAMPLE_RATE * FADE_SECONDS);
const outDir = path.join(__dirname, '..', 'assets', 'sounds');
const kinds = { 'white-noise': [white, 1], 'pink-noise': [pink, 2], 'brown-noise': [brown, 3] };

for (const [name, [gen, seed]] of Object.entries(kinds)) {
  const samples = normalize(loopable(gen(n + f, mulberry32(seed)), n, f));
  const file = path.join(outDir, `${name}.wav`);
  fs.writeFileSync(file, wav(samples));
  console.log(`${name}.wav  ${(fs.statSync(file).size / 1e6).toFixed(2)} MB`);
}
