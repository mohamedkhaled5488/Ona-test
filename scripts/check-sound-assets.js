#!/usr/bin/env node
// Acceptance checks for every sleep sound (16-bit mono or stereo WAV):
//   node scripts/check-sound-assets.js [dir]   (default: assets/sounds)
// Fails (exit 1) when a sound:
//   - is shorter than 60 s;
//   - would click at the loop point (the jump from the last sample to the
//     first is much bigger than the sound's own sample-to-sample changes);
//   - clips (a sample at full scale);
//   - is louder or quieter than the others (RMS outside -23..-17 dBFS);
//   - repeats a pattern within 60 s: the loudness envelope (20 ms frames,
//     slow drifts removed) correlates with itself above 0.8 at some shift
//     from 1 to 60 s, which is what a short loop copied inside a longer
//     file looks like;
//   - isn't a WAV (an MP3 can't be checked here, and loops with a gap).
const fs = require('fs');
const path = require('path');

const MIN_SECONDS = 60;
const RMS_DB = [-23, -17];
const REPEAT_LIMIT = 0.8;

function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file');
  let off = 12, fmt = null, data = null;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { channels: b.readUInt16LE(off + 10), rate: b.readUInt32LE(off + 12), bits: b.readUInt16LE(off + 22) };
    if (id === 'data') data = b.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size % 2);
  }
  if (!fmt || !data || fmt.bits !== 16) throw new Error('needs 16-bit PCM');
  const frames = data.length / 2 / fmt.channels;
  const x = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < fmt.channels; c++) s += data.readInt16LE((i * fmt.channels + c) * 2);
    x[i] = s / fmt.channels / 32768;
  }
  return { x, rate: fmt.rate };
}

function check(x, rate) {
  const problems = [];
  const seconds = x.length / rate;
  if (seconds < MIN_SECONDS) problems.push(`only ${seconds.toFixed(1)} s (needs ${MIN_SECONDS})`);
  // Clipping and loudness.
  let peak = 0, sum = 0;
  for (const v of x) {
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
  }
  if (peak >= 0.999) problems.push('clips (a sample at full scale)');
  const rmsDb = 20 * Math.log10(Math.sqrt(sum / x.length));
  if (rmsDb < RMS_DB[0] || rmsDb > RMS_DB[1]) problems.push(`loudness ${rmsDb.toFixed(1)} dBFS (needs ${RMS_DB[0]}..${RMS_DB[1]})`);
  // The seam: compared with the sound's own steps (99.9th percentile).
  const steps = new Float32Array(x.length - 1);
  for (let i = 0; i < steps.length; i++) steps[i] = Math.abs(x[i + 1] - x[i]);
  const sorted = Float32Array.from(steps).sort();
  const p999 = sorted[Math.floor(sorted.length * 0.999)];
  const seam = Math.abs(x[0] - x[x.length - 1]);
  if (seam > Math.max(p999 * 1.5, 0.002)) problems.push(`click at the loop point (jump ${seam.toFixed(4)}, the sound's own steps up to ${p999.toFixed(4)})`);
  // Repetition within 60 s: autocorrelation of the 20 ms loudness envelope.
  const hop = Math.round(rate * 0.02);
  const env = [];
  for (let i = 0; i + hop <= x.length; i += hop) {
    let s = 0;
    for (let k = i; k < i + hop; k++) s += x[k] * x[k];
    env.push(Math.sqrt(s / hop));
  }
  // Slow changes (a level drifting over seconds) aren't repetition: take
  // them out (minus a 3 s moving average), so what's compared is the
  // pattern of events. A copied loop still matches itself at its length.
  const W = Math.round(3 / 0.02);
  const pre = [0];
  for (const v of env) pre.push(pre[pre.length - 1] + v);
  const e = env.map((v, i) => {
    const a = Math.max(0, i - W), z = Math.min(env.length, i + W + 1);
    return v - (pre[z] - pre[a]) / (z - a);
  });
  const energy = e.reduce((a, v) => a + v * v, 0);
  let worst = { r: 0, lag: 0 };
  const maxLag = Math.min(Math.floor(MIN_SECONDS / 0.02), e.length - 1);
  for (let lag = Math.round(1 / 0.02); lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < e.length; i++) s += e[i] * e[i + lag];
    // Circular too: the file loops, so its end runs into its start.
    for (let i = e.length - lag; i < e.length; i++) s += e[i] * e[(i + lag) % e.length];
    const r = energy > 0 ? s / energy : 0;
    if (r > worst.r) worst = { r, lag };
    // The shortest repeating length is the loop you'd hear (its multiples
    // match too).
    if (r > REPEAT_LIMIT) {
      worst = { r, lag };
      break;
    }
  }
  if (worst.r > REPEAT_LIMIT) problems.push(`repeats every ${(worst.lag * 0.02).toFixed(1)} s (envelope correlation ${worst.r.toFixed(2)})`);
  return { seconds, rmsDb, peak, seam, repeat: worst, problems };
}

function checkDir(dir) {
  const results = [];
  for (const f of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, f);
    if (fs.statSync(file).isDirectory() || f.endsWith('.md')) continue;
    if (!f.endsWith('.wav')) {
      results.push({ file: f, problems: ['not a WAV (an MP3 loops with a gap and can\'t be checked here)'] });
      continue;
    }
    try {
      const { x, rate } = readWav(file);
      results.push({ file: f, ...check(x, rate) });
    } catch (e) {
      results.push({ file: f, problems: [e.message] });
    }
  }
  return results;
}

if (require.main === module) {
  const dir = process.argv[2] || path.join(__dirname, '..', 'assets', 'sounds');
  const results = checkDir(dir);
  for (const r of results) {
    const facts = r.seconds !== undefined ? `${r.seconds.toFixed(1)} s, ${r.rmsDb.toFixed(1)} dBFS, peak ${r.peak.toFixed(2)}, max self-similarity ${r.repeat.r.toFixed(2)}` : '';
    console.log(`${r.problems.length ? '✖' : '✔'} ${r.file}${facts ? ` (${facts})` : ''}${r.problems.length ? `\n    - ${r.problems.join('\n    - ')}` : ''}`);
  }
  const bad = results.filter((r) => r.problems.length).length;
  console.log(bad ? `${bad} sound(s) fail the checks` : 'All sounds pass');
  process.exit(bad ? 1 : 0);
}
module.exports = { check, checkDir, readWav };
