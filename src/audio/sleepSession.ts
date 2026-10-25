// The Sleep sound session: what plays, and when it stops. It lives here, not
// in the Sleep screen, so leaving the screen can't lose the timer.
//
// The timer is an absolute time (endsAt), never a countdown. It's checked:
// - about once a second by every playing sound's own status report
//   (audioEngine onAudioTick), which keeps arriving with the screen locked
//   and Ona in the background, when JS timers are paused;
// - whenever Ona comes back or goes to the background (AppState);
// - every second while Ona is open, for the "Stops in" line.
// Time is measured on the app's steady clock (performance.now), not the
// phone's wall clock, so changing the clock or the time zone, or a
// daylight-saving change, can't move the end. endsAt in the store is the
// wall-clock time, for showing only.
// At the end every layer stops. Over the fade before it, the volume follows the
// time left (so a missed check can't leave it halfway); with the phone locked
// the fade is only as smooth as those checks, which is why stopping on time,
// not the fade, is the promise.
import { AppState } from 'react-native';
import { useSleepStore } from '../store/useSleepStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { hasActiveSounds, onAudioTick, onSoundsReplaced, playLayer, setLayerVolume, setSectionVolumeScale, stopAllLayers, stopLayer, type SoundId } from '../utils/audioEngine';

export const TIMER_CHOICES: (number | null)[] = [15, 30, 45, 60, 90, null]; // null: all night
export const FADE_CHOICES = [10, 30, 60, 300]; // seconds
export const EXTEND_MINUTES = 15;
export const MAX_CUSTOM_MINUTES = 12 * 60;

// The fade can't be longer than the timer itself.
export const fadeFor = (fadeSeconds: number, timerMs: number | null) => (timerMs === null ? 0 : Math.min(fadeSeconds * 1000, timerMs));

// The steady clock (ms). Replaceable in tests, where JS timers can be held
// still while time passes, as on a locked phone.
let steady: () => number = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
export function __setSteadyClockForTests(fn: (() => number) | null): void {
  steady = fn ?? (() => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()));
}
let endSteady: number | null = null;

// Milliseconds left on the timer (null: no timer, or nothing playing).
export function sleepTimeLeft(): number | null {
  return useSleepStore.getState().isPlaying && endSteady !== null ? Math.max(0, endSteady - steady()) : null;
}

function setEnd(timerMs: number | null, fadeSeconds: number): void {
  endSteady = timerMs === null ? null : steady() + timerMs;
  useSleepStore.setState({ endsAt: timerMs === null ? null : Date.now() + timerMs, fadeMs: fadeFor(fadeSeconds, timerMs) });
}

export type StartResult = { ok: true; replacedStudy: boolean } | { ok: false; error: string };

// Plays the mix now, with the remembered timer (or `minutes`) from now.
export async function startSleepSession(minutes: number | null = useSettingsStore.getState().defaultSleepTimerMinutes): Promise<StartResult> {
  const { mix } = useSleepStore.getState();
  if (mix.length === 0) return { ok: false, error: 'Pick a sound first.' };
  useSleepStore.setState({ isPlaying: true });
  setEnd(minutes === null ? null : minutes * 60_000, useSettingsStore.getState().sleepFadeSeconds);
  setSectionVolumeScale('sleep', 1);
  let replacedStudy = false;
  let error: string | null = null;
  for (const layer of mix) {
    const r = await playLayer(layer.soundId, layer.volume, 'sleep');
    if (!r.ok) error = r.error;
    else if (r.replaced === 'study') replacedStudy = true;
  }
  // Nothing started (every layer failed): not left "playing" with nothing
  // to stop, so Play works again.
  if (error && !hasActiveSounds('sleep')) {
    stopSleepSession();
    return { ok: false, error };
  }
  checkSleepSession();
  return error ? { ok: false, error } : { ok: true, replacedStudy };
}

export function stopSleepSession(): void {
  endSteady = null;
  stopAllLayers('sleep');
  useSleepStore.setState({ isPlaying: false, endsAt: null, fadeMs: 0 });
}

// A different length while it plays (and remembered): from now. null = all night.
export function setSleepTimer(minutes: number | null): void {
  const s = useSettingsStore.getState();
  s.set('defaultSleepTimerMinutes', minutes);
  if (!useSleepStore.getState().isPlaying) return;
  setEnd(minutes === null ? null : minutes * 60_000, s.sleepFadeSeconds);
  setSectionVolumeScale('sleep', 1);
  checkSleepSession();
}

// "+15 min": more time from the current end (or from now, if it's fading).
export function extendSleepTimer(minutes = EXTEND_MINUTES): void {
  const left = sleepTimeLeft();
  if (left === null) return;
  setEnd(left + minutes * 60_000, useSettingsStore.getState().sleepFadeSeconds);
  setSectionVolumeScale('sleep', 1);
  checkSleepSession();
}

export function setSleepFade(seconds: number): void {
  useSettingsStore.getState().set('sleepFadeSeconds', seconds);
  const left = sleepTimeLeft();
  if (left !== null) useSleepStore.setState({ fadeMs: fadeFor(seconds, left) });
}

// The one check: stop at the end, follow the fade before it.
export function checkSleepSession(): void {
  const { isPlaying, fadeMs } = useSleepStore.getState();
  if (!isPlaying || endSteady === null) return;
  const left = endSteady - steady();
  if (left <= 0) return stopSleepSession();
  setSectionVolumeScale('sleep', fadeMs > 0 && left < fadeMs ? left / fadeMs : 1);
}

// Keeps the engine in step with the mix while it plays (a layer added,
// removed or turned up), from anywhere.
export function applySleepMix(): void {
  const { isPlaying, mix } = useSleepStore.getState();
  if (!isPlaying) return;
  if (mix.length === 0) return stopSleepSession();
  for (const layer of mix) void playLayer(layer.soundId, layer.volume, 'sleep').then(() => setLayerVolume(layer.soundId, layer.volume, 'sleep'));
  for (const id of Object.keys(SLEEP_SOUND_IDS) as SoundId[]) if (!mix.some((l) => l.soundId === id)) stopLayer(id, 'sleep');
}
const SLEEP_SOUND_IDS: Record<SoundId, true> = { 'white-noise': true, 'pink-noise': true, 'brown-noise': true, rain: true, 'ocean-waves': true, forest: true, 'fan-hum': true };

// Call once at app start. Returns a stop function.
export function startSleepSessionWatch(): () => void {
  const offTick = onAudioTick(() => checkSleepSession());
  const app = AppState.addEventListener('change', () => checkSleepSession());
  const every = setInterval(() => checkSleepSession(), 1000);
  // Study started a sound: this session is over (with a notice there).
  const offReplaced = onSoundsReplaced((owner) => {
    if (owner === 'sleep') {
      endSteady = null;
      useSleepStore.setState({ isPlaying: false, endsAt: null, fadeMs: 0 });
    }
  });
  const offMix = useSleepStore.subscribe((s, p) => {
    if (s.mix !== p.mix) applySleepMix();
  });
  // Ona was closed while a session was marked as playing: nothing plays now.
  if (useSleepStore.getState().isPlaying && !hasActiveSounds('sleep')) useSleepStore.setState({ isPlaying: false, endsAt: null, fadeMs: 0 });
  return () => {
    offTick();
    app.remove();
    clearInterval(every);
    offReplaced();
    offMix();
  };
}

// "Stops in 24:10" (or "Stops at 6:30" past an hour is left to the screen).
export function formatStopsIn(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
