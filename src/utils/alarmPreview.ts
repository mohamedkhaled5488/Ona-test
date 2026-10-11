// Plays a one-shot preview of an alarm sound option, so the user can hear
// what they're picking before saving it as a task's reminder sound. Separate
// from utils/audioEngine.ts (Sleep's looping ambient mixer) since this is a
// single non-looping playback with no independent volume control.
import { createAudioPlayer } from 'expo-audio';
import type { AlarmSoundId } from '../types/sections';

const sources: Partial<Record<AlarmSoundId, ReturnType<typeof require>>> = {
  chime: require('../../assets/sounds/alarms/chime.wav'),
  ping: require('../../assets/sounds/alarms/ping.wav'),
  ascend: require('../../assets/sounds/alarms/ascend.wav'),
};

export function playAlarmPreview(soundId: AlarmSoundId): void {
  const source = sources[soundId];
  if (!source) return; // 'default' has no bundled file to preview
  try {
    const player = createAudioPlayer(source);
    player.play();
    // A short-lived preview player; release it once it's done playing.
    setTimeout(() => {
      try {
        player.remove();
      } catch {
        // Already gone is fine.
      }
    }, 3000);
  } catch {
    // Preview is a convenience; never let it throw into the UI.
  }
}
