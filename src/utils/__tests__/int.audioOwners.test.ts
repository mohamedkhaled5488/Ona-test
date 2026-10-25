// Integration 7: Sleep and Study share one sound engine, one sound session at
// a time (owner's decision 2026-10-25): starting a sound in one replaces the
// other's, and says so; ending a session stops only what it started (FIX-09).
// IDs: docs/test-cases/integration.md
import { createAudioPlayer } from 'expo-audio';
import { isLayerActive, playLayer, stopAllLayers, stopLayer } from '../audioEngine';

afterEach(() => {
  stopAllLayers('sleep');
  stopAllLayers('study');
  (createAudioPlayer as jest.Mock).mockClear();
});

describe('INT-AUDIO: one sound session at a time', () => {
  test("INT-AUDIO-001 starting Study's sound replaces Sleep's, and says so", async () => {
    await playLayer('rain', 0.5, 'sleep');
    const r = await playLayer('rain', 0.6, 'study');
    expect(r).toEqual({ ok: true, replaced: 'sleep' });
    expect(isLayerActive('rain', 'sleep')).toBe(false);
    expect(isLayerActive('rain', 'study')).toBe(true);
  });

  test('INT-AUDIO-002 ending a study session stops only its own sound (FIX-09): Sleep started after it keeps playing', async () => {
    await playLayer('fan-hum', 0.6, 'study');
    await playLayer('rain', 0.5, 'sleep'); // replaces Study's
    stopLayer('fan-hum', 'study'); // the study session ends later
    expect(isLayerActive('rain', 'sleep')).toBe(true);
  });

  test('INT-AUDIO-003 Sleep stopping everything leaves nothing of Study to stop, and Study stopping leaves Sleep alone', async () => {
    await playLayer('rain', 0.5, 'sleep');
    await playLayer('white-noise', 0.5, 'sleep');
    stopAllLayers('study');
    expect(isLayerActive('rain', 'sleep')).toBe(true);
    stopAllLayers('sleep');
    expect(isLayerActive('white-noise', 'sleep')).toBe(false);
  });

  test('INT-AUDIO-004 playing the same sound twice in one section updates it, never stacks a second player', async () => {
    await playLayer('rain', 0.3, 'sleep');
    await playLayer('rain', 0.9, 'sleep');
    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
  });
});
