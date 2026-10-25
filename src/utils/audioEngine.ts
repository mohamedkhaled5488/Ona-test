// The one sound engine for the whole app: Study (one sound at a time) and
// Sleep (a mix of layers with a timer and fade-out) both play through here.
// Audio players are ephemeral runtime resources, so they live at module
// level, never in a Zustand store.
//
// expo-audio (the SDK 57 replacement for the deprecated expo-av). Every sound
// — including white/pink/brown noise — is a bundled asset (see
// scripts/generate-noise-assets.js and data/soundAssets.ts), so nothing has
// to be synthesized or written to disk at play time.
//
// Rules (owner's decisions, 2026-10-25):
// - One sound session at a time: starting a sound in Sleep or Study replaces
//   the other section's sounds (the caller shows a short notice). Ending a
//   session stops only what that section started (FIX-09).
// - Every player reports its status about once a second while it plays, also
//   with the screen locked when JS timers are paused; the Sleep timer checks
//   the time on each report (onAudioTick), so it stops on time.
// - Volumes are a base (what the person chose) times a scale (the fade), so a
//   fade is computed from the time left and can't get stuck halfway.
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

// The person's choices (Settings → Sound), kept so a Sleep session can ask for
// exclusive audio while it plays and give the setting back afterwards.
let audioOptions: { backgroundAudio: boolean; interruption?: 'pause' | 'lower' } = { backgroundAudio: true };
let exclusive = false;

async function applyAudioMode(): Promise<void> {
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: audioOptions.backgroundAudio,
      // Lock-screen controls (needed on Android to keep playing past ~3 min
      // in the background) require exclusive audio, and a call or another
      // app's sound then pauses Ona.
      interruptionMode: exclusive || audioOptions.interruption === 'pause' ? 'doNotMix' : 'duckOthers',
    });
  } catch (e) {
    if (__DEV__) console.warn('[audio] setAudioModeAsync failed', e);
  }
}

// Called once at startup, and again whenever the background setting changes.
// playsInSilentMode: plays with the iOS silent switch on. shouldPlayInBackground:
// keeps going when the app is backgrounded (the build-time capability comes
// from the expo-audio config plugin in app.json).
// interruption (Settings → Sound): 'pause' lets another app or a call take
// over and pause Ona; 'lower' keeps both going with the other one ducked.
export async function configureAudio(options: { backgroundAudio: boolean; interruption?: 'pause' | 'lower' }): Promise<void> {
  audioOptions = options;
  await applyAudioMode();
}

// Keyed by section and sound ("sleep:rain"), so each section has its own players.
const active = new Map<string, AudioPlayer>();
const baseVolume = new Map<string, number>();
const scale: Record<AudioOwner, number> = { sleep: 1, study: 1 };
let lockScreenKey: string | null = null;

export type PlayResult = { ok: true; replaced?: AudioOwner } | { ok: false; error: string };

// Which section a sound belongs to.
export type AudioOwner = 'sleep' | 'study';
const keyOf = (owner: AudioOwner, soundId: SoundId) => `${owner}:${soundId}`;
const ownerOf = (key: string) => key.split(':')[0] as AudioOwner;
const otherOwner = (owner: AudioOwner): AudioOwner => (owner === 'sleep' ? 'study' : 'sleep');
const clampVolume = (v: number) => Math.max(0.05, Math.min(1, v)); // never silently "playing" at zero

// --- Listeners: a heartbeat while anything plays, and replacements ----------
const tickListeners = new Set<() => void>();
const replacedListeners = new Set<(owner: AudioOwner) => void>();
export function onAudioTick(fn: () => void): () => void {
  tickListeners.add(fn);
  return () => tickListeners.delete(fn);
}
// A section's sounds were stopped because the other section started one.
export function onSoundsReplaced(fn: (owner: AudioOwner) => void): () => void {
  replacedListeners.add(fn);
  return () => replacedListeners.delete(fn);
}
const tick = () => tickListeners.forEach((fn) => fn());

export function hasActiveSounds(owner: AudioOwner): boolean {
  return [...active.keys()].some((k) => ownerOf(k) === owner);
}

function applyVolume(key: string): void {
  const player = active.get(key);
  if (!player) return;
  try {
    player.volume = Math.max(0, (baseVolume.get(key) ?? 1) * scale[ownerOf(key)]);
  } catch {
    // Removed meanwhile; nothing to do.
  }
}

// Starts a sound (looping) if it isn't already playing, or just updates its
// volume if it is. If the other section is playing, its sounds stop first
// (one sound session at a time) and `replaced` says so. Never throws.
export async function playLayer(soundId: SoundId, volume: number, owner: AudioOwner = 'sleep'): Promise<PlayResult> {
  const key = keyOf(owner, soundId);
  baseVolume.set(key, clampVolume(volume));
  const existing = active.get(key);
  if (existing) {
    applyVolume(key);
    return { ok: true };
  }
  let replaced: AudioOwner | undefined;
  if (hasActiveSounds(otherOwner(owner))) {
    replaced = otherOwner(owner);
    stopAllLayers(replaced);
    replacedListeners.forEach((fn) => fn(replaced!));
  }
  try {
    const source = soundSources[soundId];
    if (source === undefined) throw new Error(`No asset for sound "${soundId}"`);
    const player = createAudioPlayer(source, { updateInterval: 1000 });
    // Another call may have started the same layer while this one was being created.
    if (active.has(key)) {
      player.remove();
      return { ok: true, ...(replaced ? { replaced } : {}) };
    }
    player.loop = true;
    player.muted = false;
    active.set(key, player);
    applyVolume(key);
    player.addListener?.('playbackStatusUpdate', tick);
    player.play();
    if (owner === 'sleep' && audioOptions.backgroundAudio && !lockScreenKey) {
      // Keeps Sleep playing with the phone locked (Android stops background
      // audio after ~3 min without it), with a plain media notification.
      exclusive = true;
      void applyAudioMode();
      try {
        player.setActiveForLockScreen?.(true, { title: 'Sleep sounds', artist: 'Ona' }, { isLiveStream: true, showSeekForward: false, showSeekBackward: false });
        lockScreenKey = key;
      } catch (e) {
        if (__DEV__) console.warn('[audio] lock screen controls', e);
      }
    }
    return { ok: true, ...(replaced ? { replaced } : {}) };
  } catch (e) {
    if (__DEV__) console.warn(`[audio] failed to play "${soundId}"`, e);
    return { ok: false, error: SOUND_LOAD_ERROR };
  }
}

export function setLayerVolume(soundId: SoundId, volume: number, owner: AudioOwner = 'sleep'): void {
  const key = keyOf(owner, soundId);
  if (!active.has(key)) return;
  baseVolume.set(key, clampVolume(volume));
  applyVolume(key);
}

// The fade: every layer of a section at `s` (0..1) of its chosen volume.
export function setSectionVolumeScale(owner: AudioOwner, s: number): void {
  scale[owner] = Math.max(0, Math.min(1, s));
  for (const key of active.keys()) if (ownerOf(key) === owner) applyVolume(key);
}

export function isLayerActive(soundId: SoundId, owner: AudioOwner = 'sleep'): boolean {
  return active.has(keyOf(owner, soundId));
}

function stopKey(key: string): void {
  const player = active.get(key);
  if (!player) return;
  active.delete(key);
  baseVolume.delete(key);
  try {
    if (lockScreenKey === key) {
      player.clearLockScreenControls?.(); // the media notification goes too
      lockScreenKey = null;
    }
    player.pause();
    player.remove(); // release the native player
  } catch (e) {
    if (__DEV__) console.warn(`[audio] failed to stop "${key}"`, e);
  }
  if (!hasActiveSounds('sleep') && exclusive) {
    exclusive = false;
    void applyAudioMode();
  }
}

export function stopLayer(soundId: SoundId, owner: AudioOwner = 'sleep'): void {
  stopKey(keyOf(owner, soundId));
}

// Stops every sound of one section (Sleep's mix, by default), and resets its
// fade so the next session starts at full chosen volume.
export function stopAllLayers(owner: AudioOwner = 'sleep'): void {
  for (const key of [...active.keys()]) if (ownerOf(key) === owner) stopKey(key);
  scale[owner] = 1;
}

// For tests: what each player is set to.
export function __volumesForTests(): Record<string, number> {
  return Object.fromEntries([...active.entries()].map(([k, p]) => [k, p.volume]));
}
