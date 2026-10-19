// Integration 7: Sleep and Study share one sound engine. Each keeps its own
// sounds: ending a study session never stops Sleep's rain, and Sleep's timer
// fading out never silences a study session. IDs: docs/test-cases/integration.md
import { createAudioPlayer } from 'expo-audio';
import { isLayerActive, playLayer, stopAllLayers, stopLayer, fadeOutAllLayers } from '../audioEngine';

afterEach(() => {
  stopAllLayers('sleep');
  stopAllLayers('study');
  (createAudioPlayer as jest.Mock).mockClear();
});

describe('INT-AUDIO: Sleep and Study sounds don\'t step on each other', () => {
  test('INT-AUDIO-001 the same sound in both is two separate players', async () => {
    await playLayer('rain', 0.5, 'sleep');
    await playLayer('rain', 0.6, 'study');
    expect(createAudioPlayer).toHaveBeenCalledTimes(2);
    expect(isLayerActive('rain', 'sleep')).toBe(true);
    expect(isLayerActive('rain', 'study')).toBe(true);
  });

  test('INT-AUDIO-002 ending a study session leaves Sleep\'s rain playing', async () => {
    await playLayer('rain', 0.5, 'sleep');
    await playLayer('rain', 0.6, 'study');
    stopLayer('rain', 'study');
    expect(isLayerActive('rain', 'sleep')).toBe(true);
    expect(isLayerActive('rain', 'study')).toBe(false);
  });

  test('INT-AUDIO-003 Sleep stopping everything (or its timer fading out) leaves a study session\'s sound alone', async () => {
    await playLayer('rain', 0.5, 'sleep');
    await playLayer('white-noise', 0.5, 'sleep');
    await playLayer('rain', 0.6, 'study');
    stopAllLayers('sleep');
    expect(isLayerActive('rain', 'sleep')).toBe(false);
    expect(isLayerActive('rain', 'study')).toBe(true);
    await playLayer('brown-noise', 0.5, 'sleep');
    await fadeOutAllLayers(0, 'sleep');
    expect(isLayerActive('brown-noise', 'sleep')).toBe(false);
    expect(isLayerActive('rain', 'study')).toBe(true);
  });

  test('INT-AUDIO-004 playing the same sound twice in one section updates it, never stacks a second player', async () => {
    await playLayer('rain', 0.3, 'sleep');
    await playLayer('rain', 0.9, 'sleep');
    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
  });
});
