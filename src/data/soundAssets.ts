import type { SleepSoundId } from '../types/sections';

// Every sound the app can play, by id → its file in assets/sounds. Plain data
// so a test can check each file actually exists (a missing file fails the
// test run instead of failing silently on a device). The audio engine's
// require() map must cover exactly these ids — see soundSources in
// utils/audioEngine.ts and its test.
export const SOUND_FILES: Record<SleepSoundId, string> = {
  'white-noise': 'white-noise.wav',
  'pink-noise': 'pink-noise.wav',
  'brown-noise': 'brown-noise.wav',
  rain: 'rain.mp3',
  'ocean-waves': 'ocean.mp3',
  forest: 'forest.mp3',
  'fan-hum': 'fan.mp3',
};
