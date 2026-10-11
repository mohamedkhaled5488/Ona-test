import type { SleepSound } from '../types/sections';

// The ambient sound library — launch set of 7, all real playback:
// white/pink/brown are generated WAV loops (scripts/generate-noise-assets.js),
// the other four are licensed recordings — all bundled under assets/sounds
// (see assets/sounds/SOURCES.md for each file's source and license).
export const sleepSounds: SleepSound[] = [
  { id: 'white-noise', label: 'White noise', description: 'Even, full-spectrum hiss' },
  { id: 'brown-noise', label: 'Brown noise', description: 'Deeper, rumbling hiss' },
  { id: 'pink-noise', label: 'Pink noise', description: 'Softer, balanced hiss' },
  { id: 'rain', label: 'Rain', description: 'Steady rainfall' },
  { id: 'ocean-waves', label: 'Ocean waves', description: 'Rolling waves on a shore' },
  { id: 'forest', label: 'Forest', description: 'Birds and wind in the trees' },
  { id: 'fan-hum', label: 'Fan hum', description: 'A steady extractor-fan drone' },
];

export const defaultWindDownItems: { label: string }[] = [
  { label: 'Dim the lights' },
  { label: 'Put the phone away' },
  { label: 'Stretch or lie down' },
  { label: 'Set out tomorrow’s first task' },
];
