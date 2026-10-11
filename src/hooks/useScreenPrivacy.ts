// Screen privacy from Settings → Privacy, Security & Data.
import React, { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useSettingsStore } from '../store/useSettingsStore';
import { useLockStore } from '../store/useLockStore';
import { LockGate } from '../components/LockScreen';

type ScreenCapture = typeof import('expo-screen-capture');
function screenCapture(): ScreenCapture | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('expo-screen-capture') as ScreenCapture;
  } catch {
    return null;
  }
}

// Blocks screenshots and screen recording while a sensitive screen is open,
// if the user turned that on.
export function useBlockScreenshots(key: string) {
  const on = useSettingsStore((s) => s.blockSensitiveScreenshots);
  useEffect(() => {
    const sc = on ? screenCapture() : null;
    if (!sc) return;
    sc.preventScreenCaptureAsync(key).catch(() => {});
    return () => {
      sc.allowScreenCaptureAsync(key).catch(() => {});
    };
  }, [on, key]);
}

// "Hide content in recent apps": iOS blurs the app-switcher snapshot; Android
// has no separate switch for that, so the same system flag that blocks
// screenshots is used for the whole app.
export function applyHideInRecents(on: boolean): void {
  const sc = screenCapture();
  if (!sc) return;
  if (Platform.OS === 'ios') {
    (on ? sc.enableAppSwitcherProtectionAsync(0.9) : sc.disableAppSwitcherProtectionAsync()).catch(() => {});
  } else {
    (on ? sc.preventScreenCaptureAsync('recents') : sc.allowScreenCaptureAsync('recents')).catch(() => {});
  }
}

// Locks again after Ona has been in the background for a while.
export function useRelockOnBackground() {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const { markBackgrounded, markForegrounded } = useLockStore.getState();
      if (state === 'background') markBackgrounded(Date.now());
      else if (state === 'active') markForegrounded(Date.now());
    });
    return () => sub.remove();
  }, []);
}

// Wraps a sensitive screen: screenshots blocked (when on), and optionally
// behind the Journaling lock.
export function sensitiveScreen<P extends object>(Component: React.ComponentType<P>, key: string, journalLock = false): React.ComponentType<P> {
  function Sensitive(props: P) {
    useBlockScreenshots(key);
    const content = React.createElement(Component, props);
    return journalLock ? React.createElement(LockGate, { scope: 'journal', children: content }) : content;
  }
  Sensitive.displayName = `Sensitive(${Component.displayName ?? Component.name ?? key})`;
  return Sensitive;
}
