// Node built-ins, typed locally so the app's tsconfig doesn't need Node types.
declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');
import { SOUND_FILES } from '../../data/soundAssets';
import { sleepSounds } from '../../data/sleepSounds';
import { ambientSoundOptions } from '../../data/studyPresets';

// A fake expo-audio player so the engine's behaviour can be checked off-device.
const mockPlayers: any[] = [];
let mockFailNextLoad = false;
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  createAudioPlayer: jest.fn(() => {
    if (mockFailNextLoad) {
      mockFailNextLoad = false;
      throw new Error('decode failed');
    }
    const p = { loop: false, volume: 1, muted: true, play: jest.fn(), pause: jest.fn(), remove: jest.fn() };
    mockPlayers.push(p);
    return p;
  }),
}));

// eslint-disable-next-line import/first
import { playLayer, stopLayer, stopAllLayers, soundSources, configureAudio, SOUND_LOAD_ERROR } from '../audioEngine';
// eslint-disable-next-line import/first
import { setAudioModeAsync } from 'expo-audio';

const SOUNDS_DIR = path.join(__dirname, '..', '..', '..', 'assets', 'sounds');

describe('every sound id maps to a real, bundled asset', () => {
  const usedIds = [...sleepSounds.map((s) => s.id), ...ambientSoundOptions.filter((o) => o.id !== 'none').map((o) => o.id)];

  it.each(Array.from(new Set(usedIds)))('"%s" has a file that exists on disk', (id) => {
    const file = SOUND_FILES[id as keyof typeof SOUND_FILES];
    expect(file).toBeDefined();
    expect(fs.existsSync(path.join(SOUNDS_DIR, file))).toBe(true);
  });

  it('uses only formats that play on both iOS and Android (no ogg)', () => {
    Object.values(SOUND_FILES).forEach((file) => expect(file).toMatch(/\.(mp3|m4a|wav)$/));
  });

  it('the engine has a bundled source for exactly the same ids', () => {
    expect(Object.keys(soundSources).sort()).toEqual(Object.keys(SOUND_FILES).sort());
    Object.values(soundSources).forEach((src) => expect(src).toBeDefined());
  });

  it('the generated noise loops are real WAV files of about 30 seconds', () => {
    ['white-noise.wav', 'pink-noise.wav', 'brown-noise.wav'].forEach((name) => {
      const buf = fs.readFileSync(path.join(SOUNDS_DIR, name));
      expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
      expect(buf.toString('ascii', 8, 12)).toBe('WAVE');
      const sampleRate = buf.readUInt32LE(24);
      const seconds = buf.readUInt32LE(40) / 2 / sampleRate;
      expect(seconds).toBeCloseTo(30, 0);
    });
  });
});

describe('audio engine', () => {
  afterEach(() => {
    stopAllLayers();
    mockPlayers.length = 0;
  });

  it('plays looping, unmuted, at a non-zero volume', async () => {
    const result = await playLayer('rain', 0.6);
    expect(result).toEqual({ ok: true });
    const p = mockPlayers[0];
    expect(p.loop).toBe(true);
    expect(p.muted).toBe(false);
    expect(p.volume).toBeGreaterThan(0);
    expect(p.play).toHaveBeenCalled();
  });

  it('never "plays" at zero volume', async () => {
    await playLayer('white-noise', 0);
    expect(mockPlayers[0].volume).toBeGreaterThan(0);
  });

  it('a second play of the same sound updates volume instead of stacking another player', async () => {
    await playLayer('rain', 0.4);
    await playLayer('rain', 0.9);
    expect(mockPlayers).toHaveLength(1);
    expect(mockPlayers[0].volume).toBe(0.9);
  });

  it('a failed load comes back as a visible error, not silence', async () => {
    mockFailNextLoad = true;
    expect(await playLayer('forest', 0.5)).toEqual({ ok: false, error: SOUND_LOAD_ERROR });
  });

  it('stopping releases the native player', async () => {
    await playLayer('rain', 0.5);
    stopLayer('rain');
    expect(mockPlayers[0].pause).toHaveBeenCalled();
    expect(mockPlayers[0].remove).toHaveBeenCalled();
  });

  it('audio mode: plays with the silent switch on, background follows the setting', async () => {
    await configureAudio({ backgroundAudio: true });
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({ playsInSilentMode: true, shouldPlayInBackground: true }));
    await configureAudio({ backgroundAudio: false });
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({ shouldPlayInBackground: false }));
  });
});
