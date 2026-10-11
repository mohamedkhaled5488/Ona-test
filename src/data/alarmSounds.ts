import type { AlarmSoundId } from '../types/sections';

export interface AlarmSoundOption {
  id: AlarmSoundId;
  label: string;
  description: string;
  // undefined for 'default' — the system's own notification sound, no bundled
  // file needed. The rest are short tones synthesized locally (pure math, no
  // licensing concerns — same rationale as scripts/generate-noise-assets.js) and
  // registered as notification sounds via the expo-notifications plugin in
  // app.json. Referenced by base filename only, per Expo's local-notification
  // sound API.
  fileName?: string;
}

export const alarmSoundOptions: AlarmSoundOption[] = [
  { id: 'default', label: 'Default', description: "Your device's standard notification sound" },
  { id: 'chime', label: 'Chime', description: 'Two soft overlapping notes', fileName: 'chime.wav' },
  { id: 'ping', label: 'Ping', description: 'A short, bright double ping', fileName: 'ping.wav' },
  { id: 'ascend', label: 'Ascend', description: 'Three rising notes', fileName: 'ascend.wav' },
];

export function alarmSoundLabel(id: AlarmSoundId | undefined): string {
  return alarmSoundOptions.find((o) => o.id === (id ?? 'default'))?.label ?? 'Default';
}
