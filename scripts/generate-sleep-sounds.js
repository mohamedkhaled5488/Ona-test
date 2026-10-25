#!/usr/bin/env node
// Generates Ona's long sleep sounds, deterministically (seeded): the same
// files every time, from math, so there's nothing to license.
//   node scripts/generate-sleep-sounds.js [outDir]   (default: sound-samples/)
//
// Every sound is long enough not to be heard as a loop (2-3 minutes, with no
// repeating pattern inside: events are placed at random, slow changes run
// at periods that don't divide the length), and loops seamlessly: N + F
// samples are made and the extra F blended into the first F with an
// equal-power crossfade, so the last sample flows into the first. All are
// normalized to the same loudness, with headroom (the app sets the volume).
// 22.05 kHz, mono, 16-bit WAV (plays and loops gaplessly on Android and iOS).
const fs = require('fs');
const path = require('path');

const SR = 22050;
const TARGET_RMS = 0.1; // about -20 dBFS: the same loudness for every sound
const PEAK_LIMIT = 0.7; // about -3 dBFS: never clips

function rng(seed) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (rand) => Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());

function white(n, rand) {
  const o = new Float32Array(n);
  for (let i = 0; i < n; i++) o[i] = rand() * 2 - 1;
  return o;
}
// Paul Kellet's refined pink filter (public domain, musicdsp.org).
function pink(n, rand) {
  const o = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = rand() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    o[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return o;
}
function brown(n, rand) {
  const o = new Float32Array(n);
  let last = 0;
  for (let i = 0; i < n; i++) {
    last = (last + 0.02 * (rand() * 2 - 1)) / 1.02;
    o[i] = last * 3.5;
  }
  return o;
}
// One-pole filters; fc can change per sample.
function lowpass(x, fc) {
  const o = new Float32Array(x.length);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    const f = typeof fc === 'function' ? fc(i) : fc;
    const a = 1 - Math.exp((-2 * Math.PI * f) / SR);
    y += a * (x[i] - y);
    o[i] = y;
  }
  return o;
}
function highpass(x, fc) {
  const lp = lowpass(x, fc);
  const o = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) o[i] = x[i] - lp[i];
  return o;
}
// A slow wobble that isn't periodic over the file: smoothed random walk.
function drift(n, rand, secondsPerStep, depth) {
  const o = new Float32Array(n);
  const step = Math.max(1, Math.round(secondsPerStep * SR));
  let a = gauss(rand), b = gauss(rand);
  for (let i = 0; i < n; i++) {
    if (i % step === 0) { a = b; b = gauss(rand); }
    const t = (i % step) / step;
    const s = (1 - Math.cos(Math.PI * t)) / 2;
    o[i] = 1 + depth * (a + (b - a) * s) * 0.5;
  }
  return o;
}

function loopify(x, fadeSeconds) {
  const F = Math.round(fadeSeconds * SR);
  const N = x.length - F;
  const o = new Float32Array(N);
  o.set(x.subarray(0, N));
  for (let i = 0; i < F; i++) {
    const t = i / F;
    o[i] = x[i] * Math.sin((t * Math.PI) / 2) + x[N + i] * Math.cos((t * Math.PI) / 2);
  }
  return o;
}
function normalize(x) {
  let sum = 0;
  for (const v of x) sum += v * v;
  const rms = Math.sqrt(sum / x.length);
  let g = TARGET_RMS / rms;
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v * g));
  if (peak > PEAK_LIMIT) g *= PEAK_LIMIT / peak;
  const o = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) o[i] = x[i] * g;
  return o;
}
function writeWav(file, x) {
  const data = Buffer.alloc(x.length * 2);
  for (let i = 0; i < x.length; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}
const mul = (a, b) => a.map((v, i) => v * b[i]);
const add = (...xs) => xs[0].map((_, i) => xs.reduce((s, x) => s + x[i], 0));
const scaleBy = (x, g) => x.map((v) => v * g);

// --- The sounds ---------------------------------------------------------------

// Noise, with slow, subtle changes in level and brightness so it doesn't feel static.
function noise(kind, seconds, seed) {
  const rand = rng(seed);
  const n = Math.round((seconds + 2) * SR);
  const base = kind === 'white' ? white(n, rand) : kind === 'pink' ? pink(n, rand) : brown(n, rand);
  const level = drift(n, rand, 11.3, 0.12); // about ±0.5 dB
  const tone = drift(n, rand, 17.9, 1);
  const soft = lowpass(base, kind === 'brown' ? 900 : 4500);
  const mix = base.map((v, i) => {
    const k = Math.min(1, Math.max(0, 0.25 + 0.15 * (tone[i] - 1)));
    return (v * (1 - k) + soft[i] * k) * level[i];
  });
  return normalize(loopify(mix, 2));
}

// A soft bed of rain plus thousands of single drops, each placed and shaped at random.
function rain(seconds, seed) {
  const rand = rng(seed);
  const n = Math.round((seconds + 3) * SR);
  const intensity = drift(n, rand, 9.7, 0.5); // the rain coming and going a little
  const bed = mul(lowpass(highpass(pink(n, rand), 350), 6500), intensity);
  const drops = new Float32Array(n);
  let t = 0;
  while (t < n) {
    const rate = 140 * intensity[Math.min(n - 1, Math.floor(t))]; // drops per second
    t += (-Math.log(rand() || 1e-9) / rate) * SR;
    const start = Math.floor(t);
    if (start >= n) break;
    const amp = Math.exp(-3.2 * rand()) * 0.9;
    const f = 1800 + rand() * 5200;
    const r = Math.exp(-1 / (SR * (0.0012 + rand() * 0.003))); // decay
    const w = (2 * Math.PI * f) / SR;
    const c = 2 * r * Math.cos(w);
    let y1 = 0, y2 = 0;
    const len = Math.min(n - start, Math.round(SR * 0.025));
    for (let k = 0; k < len; k++) {
      const x = k < 24 ? (rand() * 2 - 1) * (1 - k / 24) : 0;
      const y = c * y1 - r * r * y2 + x;
      y2 = y1; y1 = y;
      drops[start + k] += y * amp * 0.08;
    }
  }
  return normalize(loopify(add(scaleBy(bed, 0.8), drops), 3));
}

// Waves of random length and spacing breaking on a shore, over a distant surf.
function ocean(seconds, seed) {
  const rand = rng(seed);
  const n = Math.round((seconds + 4) * SR);
  const env = new Float32Array(n);
  const foam = new Float32Array(n);
  let t = rand() * 3;
  while (t * SR < n) {
    const dur = 6 + rand() * 6;
    const peak = 0.55 + rand() * 0.45;
    const rise = dur * (0.3 + rand() * 0.15);
    const s0 = Math.floor(t * SR);
    const len = Math.min(n - s0, Math.floor(dur * SR));
    for (let k = 0; k < len; k++) {
      const u = k / SR;
      const e = u < rise ? Math.pow(Math.sin(((u / rise) * Math.PI) / 2), 2) : Math.exp(-(u - rise) / (dur * 0.28));
      env[s0 + k] += e * peak;
      if (u > rise * 0.85 && u < rise * 1.6) foam[s0 + k] += Math.exp(-(u - rise * 0.85) / 0.9) * peak;
    }
    t += 7 + rand() * 7; // the next wave, not on a beat
  }
  const body = pink(n, rand);
  const wave = mul(lowpass(body, (i) => 250 + 1300 * Math.min(1, env[i])), env);
  const spray = mul(lowpass(highpass(white(n, rand), 1500), 7000), foam);
  const surf = scaleBy(lowpass(brown(n, rand), 400), 0.35);
  return normalize(loopify(add(wave, scaleBy(spray, 0.25), surf), 4));
}

// An electric fan: airflow plus a motor hum that wobbles a little, as a real one does.
function fan(seconds, seed) {
  const rand = rng(seed);
  const n = Math.round((seconds + 2) * SR);
  const wob = drift(n, rand, 6.1, 0.006);
  const blade = 47 + rand() * 6; // blade-pass frequency, Hz
  const air = add(lowpass(pink(n, rand), 2200), scaleBy(lowpass(brown(n, rand), 700), 0.6));
  const hum = new Float32Array(n);
  const phases = [1, 2, 3, 4, 5, 6].map(() => rand() * 2 * Math.PI);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    ph += (2 * Math.PI * blade * wob[i]) / SR;
    let v = 0;
    for (let h = 1; h <= 6; h++) v += Math.sin(h * ph + phases[h - 1]) / (h * h * 0.8);
    hum[i] = v * 0.06;
  }
  const flutter = air.map((v, i) => v * (1 + 0.05 * Math.sin(ph * 0 + (2 * Math.PI * blade * i) / SR)));
  return normalize(loopify(add(flutter, hum), 1.5));
}

// Wind in the trees with leaves moving, and now and then a bird: short
// phrases of rising and falling chirps, at random times and pitches.
function forest(seconds, seed) {
  const rand = rng(seed);
  const n = Math.round((seconds + 3) * SR);
  const gust = drift(n, rand, 7.3, 0.9).map((v) => Math.max(0.15, v));
  const wind = mul(lowpass(highpass(pink(n, rand), 120), (i) => 500 + 700 * gust[i]), gust);
  const leaves = mul(lowpass(highpass(white(n, rand), 2500), 7000), gust.map((g) => Math.max(0, g - 0.6) * 0.8));
  const birds = new Float32Array(n);
  let t = 1 + rand() * 4;
  while (t * SR < n) {
    const base = 2200 + rand() * 2600; // this bird's pitch
    const notes = 2 + Math.floor(rand() * 5);
    const amp = 0.05 + rand() * 0.12;
    let nt = t;
    for (let k = 0; k < notes; k++) {
      const dur = 0.06 + rand() * 0.16;
      const sweep = (rand() - 0.4) * 0.6;
      const s0 = Math.floor(nt * SR);
      const len = Math.min(n - s0, Math.floor(dur * SR));
      let ph = 0;
      for (let i = 0; i < len; i++) {
        const u = i / len;
        const f = base * (1 + sweep * u) * (1 + 0.03 * Math.sin(2 * Math.PI * 28 * (i / SR)));
        ph += (2 * Math.PI * f) / SR;
        birds[s0 + i] += Math.sin(ph) * Math.sin(Math.PI * u) * amp;
      }
      nt += dur + 0.04 + rand() * 0.12;
    }
    t = nt + 2 + rand() * 9;
  }
  return normalize(loopify(add(wind, scaleBy(leaves, 0.6), birds), 3));
}

const SOUNDS = {
  'white-noise': () => noise('white', 120, 101),
  'pink-noise': () => noise('pink', 120, 202),
  'brown-noise': () => noise('brown', 120, 303),
  rain: () => rain(180, 404),
  ocean: () => ocean(180, 505),
  fan: () => fan(120, 606),
  forest: () => forest(180, 707),
};

if (require.main === module) {
  const out = process.argv[2] || path.join(__dirname, '..', 'sound-samples');
  fs.mkdirSync(out, { recursive: true });
  for (const [name, make] of Object.entries(SOUNDS)) {
    const x = make();
    const file = path.join(out, `${name}.wav`);
    writeWav(file, x);
    console.log(`${name}: ${(x.length / SR).toFixed(1)} s, ${(fs.statSync(file).size / 1e6).toFixed(2)} MB`);
  }
}
module.exports = { SOUNDS, SR };
