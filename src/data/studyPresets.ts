export interface StudyPreset {
  id: string;
  name: string;
  focusMinutes: number;
  breakMinutes: number;
}

export const studyPresets: StudyPreset[] = [
  { id: 'classic', name: 'Classic', focusMinutes: 25, breakMinutes: 5 },
  { id: 'deep-work', name: 'Deep Work', focusMinutes: 50, breakMinutes: 10 },
];

export const ambientSoundOptions: { id: 'none' | 'white-noise' | 'rain'; label: string; icon: string }[] = [
  { id: 'none', label: 'None', icon: 'volume-mute-outline' },
  { id: 'white-noise', label: 'White noise', icon: 'radio-outline' },
  { id: 'rain', label: 'Rain', icon: 'rainy-outline' },
];
