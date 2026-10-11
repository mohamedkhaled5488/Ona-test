// Light haptic feedback, only when Settings → Appearance → Haptics is on.
// Never throws, and does nothing where the phone can't vibrate.
import { Platform } from 'react-native';
import { useSettingsStore } from '../store/useSettingsStore';

type HapticsModule = typeof import('expo-haptics');
let mod: HapticsModule | null | undefined;
function haptics(): HapticsModule | null {
  if (mod !== undefined) return mod;
  if (Platform.OS === 'web') return (mod = null);
  try {
    mod = require('expo-haptics') as HapticsModule;
  } catch {
    mod = null;
  }
  return mod;
}

function enabled(): boolean {
  return useSettingsStore.getState().haptics;
}

// A key press or a small selection change.
export function tapFeedback(): void {
  const h = enabled() ? haptics() : null;
  h?.selectionAsync().catch(() => {});
}

// Completing something: ticking a task off, a habit check-in.
export function successFeedback(): void {
  const h = enabled() ? haptics() : null;
  h?.notificationAsync(h.NotificationFeedbackType.Success).catch(() => {});
}

// Something went wrong, like a wrong PIN.
export function errorFeedback(): void {
  const h = enabled() ? haptics() : null;
  h?.notificationAsync(h.NotificationFeedbackType.Error).catch(() => {});
}
