// The one sound engine for the whole app: Study (one sound at a time) and
// Sleep (a mix of layers with a timer and fade-out) both play through here.
// Audio players are ephemeral runtime resources, so they live at module
// level, never in a Zustand store.
//
// expo-audio (the SDK 57 replacement for the deprecated expo-av). Every sound
// — including white/pink/brown noise — is a bundled asset (see
// scripts/generate-noise-assets.js and data/soundAssets.ts), so nothing has
// to be synthesized or written to disk at play time.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import type { SleepSoundId } from '../types/sections';

export type SoundId = SleepSoundId;

// Must cover exactly the ids in data/soundAssets.ts (enforced by a test).
export const soundSources: Record<SoundId, number> = {
  'white-noise': require('../../assets/sounds/white-noise.wav'),
  'pink-noise': require('../../assets/sounds/pink-noise.wav'),
  'brown-noise': require('../../assets/sounds/brown-noise.wav'),
  rain: require('../../assets/sounds/rain.mp3'),
  'ocean-waves': require('../../assets/sounds/ocean.mp3'),
  forest: require('../../assets/sounds/forest.mp3'),
  'fan-hum': require('../../assets/sounds/fan.mp3'),
};

export const SOUND_LOAD_ERROR = "Couldn't load this sound";

// Called once at startup, and again whenever the background setting changes.
// playsInSilentMode: plays with the iOS silent switch on. shouldPlayInBackground:
// keeps going when the app is backgrounded (the build-time capability comes
// from the expo-audio config plugin in app.json).
// interruption (Settings → Sound): 'pause' lets another app or a call take
// over and pause Ona; 'lower' keeps both going with the other one ducked.
export async function configureAudio(options: { backgroundAudio: boolean; interruption?: 'pause' | 'lower' }): Promise<void> {
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: options.backgroundAudio,
      interruptionMode: options.interruption === 'pause' ? 'doNotMix' : 'duckOthers',
    });
  } catch (e) {
    if (__DEV__) console.warn('[audio] setAudioModeAsync failed', e);
  }
}

const active = new Map<SoundId, AudioPlayer>();

export type PlayResult = { ok: true } | { ok: false; error: string };

// Starts a sound (looping) if it isn't already playing, or just updates its
// volume if it is. Never throws — a failure comes back as a result the
// caller shows to the user, instead of silently doing nothing.
export async function playLayer(soundId: SoundId, volume: number): Promise<PlayResult> {
  const vol = Math.max(0.05, Math.min(1, volume)); // never silently "playing" at zero
  const existing = active.get(soundId);
  if (existing) {
    existing.volume = vol;
    return { ok: true };
  }
  try {
    const source = soundSources[soundId];
    if (source === undefined) throw new Error(`No asset for sound "${soundId}"`);
    const player = createAudioPlayer(source);
    // Another call may have started the same layer while this one was being created.
    if (active.has(soundId)) {
      player.remove();
      return { ok: true };
    }
    player.loop = true;
    player.muted = false;
    player.volume = vol;
    active.set(soundId, player);
    player.play();
    return { ok: true };
  } catch (e) {
    if (__DEV__) console.warn(`[audio] failed to play "${soundId}"`, e);
    return { ok: false, error: SOUND_LOAD_ERROR };
  }
}

export function setLayerVolume(soundId: SoundId, volume: number): void {
  const player = active.get(soundId);
  if (player) player.volume = Math.max(0.05, Math.min(1, volume));
}

export function isLayerActive(soundId: SoundId): boolean {
  return active.has(soundId);
}

export function stopLayer(soundId: SoundId): void {
  const player = active.get(soundId);
  if (!player) return;
  active.delete(soundId);
  try {
    player.pause();
    player.remove(); // release the native player
  } catch (e) {
    if (__DEV__) console.warn(`[audio] failed to stop "${soundId}"`, e);
  }
}

export function stopAllLayers(): void {
  for (const id of [...active.keys()]) stopLayer(id);
}

// Ramps every active layer down to silence over `durationMs`, relative to its
// own current volume, then stops them all — the Sleep timer's fade-out.
export async function fadeOutAllLayers(durationMs: number): Promise<void> {
  if (durationMs <= 0 || active.size === 0) {
    stopAllLayers();
    return;
  }
  const startVolumes = new Map<SoundId, number>();
  for (const [id, player] of active) startVolumes.set(id, player.volume ?? 1);
  const steps = 24;
  const stepMs = durationMs / steps;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    for (const [id, player] of active) {
      try {
        player.volume = Math.max(0, (startVolumes.get(id) ?? 1) * (1 - t));
      } catch {
        // Removed mid-fade; nothing to do.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  stopAllLayers();
}
