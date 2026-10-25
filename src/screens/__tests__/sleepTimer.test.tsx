// The Sleep timer stops the sound on time, wherever Ona is: the real Sleep
// screen, session (audio/sleepSession.ts) and engine, with only the native
// player faked. "Locked": time passes on the steady clock while every JS
// timer is held still, then a player sends its status report (as it does
// about once a second while playing, also locked). Before the fix the
// countdown lived in the screen and counted JS ticks: SLEEP-002/003/004
// failed (see the step-1 report). IDs: docs/test-cases/integration.md (SLEEP-*)
jest.mock('../../utils/notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));
jest.setTimeout(30_000);

import React from 'react';
import { AppState, Pressable, Text } from 'react-native';
import { act, screen } from '@testing-library/react-native';
import { createAudioPlayer } from 'expo-audio';
import { resetAll, useClock, restoreClock } from '../../test-utils';
import { renderScreen, renderWithApp } from '../../test-utils/render';
import { useSleepStore } from '../../store/useSleepStore';
import { useSettingsStore, DEFAULT_SETTINGS, migrateSettings } from '../../store/useSettingsStore';
import { __volumesForTests, isLayerActive, playLayer, stopAllLayers, stopLayer } from '../../utils/audioEngine';
import { __setSteadyClockForTests, extendSleepTimer, setSleepTimer, sleepTimeLeft, startSleepSession, startSleepSessionWatch, stopSleepSession } from '../../audio/sleepSession';
import { SleepScreen, SLEEP_TIMER_COPY } from '../SleepScreen';

type FakePlayer = { __emit: () => void; setActiveForLockScreen: jest.Mock; clearLockScreenControls: jest.Mock; volume: number };
const players = () => (createAudioPlayer as jest.Mock).mock.results.map((r) => r.value as FakePlayer);
let t = 0; // the steady clock, ms
const pass = (ms: number) => void (t += ms); // time passes; no JS timer runs
const report = () => act(async () => players().forEach((p) => p.__emit())); // a playing player's status report
const run = (ms: number) => act(async () => void jest.advanceTimersByTime(ms)); // Ona open: JS timers run
let appStateListener: ((s: string) => void) | null = null;
let stopWatch: () => void;

beforeEach(async () => {
  await resetAll();
  stopAllLayers('sleep');
  stopAllLayers('study');
  (createAudioPlayer as jest.Mock).mockClear();
  useClock('2026-10-25T23:00');
  t = 0;
  __setSteadyClockForTests(() => t);
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: string) => void) => {
    appStateListener = cb;
    return { remove: () => {} };
  }) as never);
  useSettingsStore.setState({ defaultSleepTimerMinutes: 1, sleepFadeSeconds: 10 });
  useSleepStore.setState({ mix: [{ soundId: 'rain', volume: 0.5 }], isPlaying: false, endsAt: null, fadeMs: 0 } as never);
  stopWatch = startSleepSessionWatch();
});
afterEach(() => {
  stopWatch();
  stopSleepSession();
  stopAllLayers('study');
  __setSteadyClockForTests(null);
  (AppState.addEventListener as jest.Mock).mockRestore?.();
  restoreClock();
});

async function playFromScreen() {
  const r = await renderScreen('sleep', SleepScreen);
  await r.user.press(screen.getByText('Play mix'));
  expect(isLayerActive('rain')).toBe(true);
  return r;
}

test('SLEEP-001 Ona open: "Stops in" counts down and the sound stops at the end', async () => {
  await playFromScreen();
  expect(screen.getByText(SLEEP_TIMER_COPY.stopsIn('1:00'))).toBeTruthy();
  pass(24_000);
  await run(1_000);
  expect(screen.getByText(SLEEP_TIMER_COPY.stopsIn('0:36'))).toBeTruthy();
  pass(36_000);
  await run(1_000);
  expect(isLayerActive('rain')).toBe(false);
  expect(useSleepStore.getState().isPlaying).toBe(false);
});

function SleepThenElsewhere() {
  const [here, setHere] = React.useState(true);
  return here ? (
    <>
      <SleepScreen {...({} as React.ComponentProps<typeof SleepScreen>)} />
      <Pressable onPress={() => setHere(false)} accessibilityRole="button">
        <Text>Leave Sleep</Text>
      </Pressable>
    </>
  ) : (
    <Text>Somewhere else in Ona</Text>
  );
}

test('SLEEP-002 leaving the Sleep screen: the timer keeps running and the sound stops on time (failed before: never stopped)', async () => {
  const r = await renderWithApp(<SleepThenElsewhere />);
  await r.user.press(screen.getByText('Play mix'));
  await r.user.press(screen.getByText('Leave Sleep'));
  pass(61_000);
  await run(1_000);
  expect(isLayerActive('rain')).toBe(false);
});

test('SLEEP-003 phone locked, JS timers held still: the next status report stops it on time (failed before: kept playing)', async () => {
  await playFromScreen();
  pass(5 * 60_000); // locked for 5 minutes: no JS timer runs
  expect(isLayerActive('rain')).toBe(true); // nothing has checked yet
  await report();
  expect(isLayerActive('rain')).toBe(false);
});

test('SLEEP-003b coming back to Ona (AppState) also stops a timer that ran out', async () => {
  await startSleepSession();
  pass(2 * 60_000);
  await act(async () => appStateListener?.('active'));
  expect(isLayerActive('rain')).toBe(false);
});

test('SLEEP-004 the fade follows the time left, so a missed check can\'t leave it halfway (failed before: stuck at part volume)', async () => {
  useSettingsStore.setState({ sleepFadeSeconds: 30 });
  await startSleepSession();
  pass(45_000); // 15 s left of a 30 s fade
  await report();
  expect(__volumesForTests()['sleep:rain']).toBeCloseTo(0.5 * 0.5);
  pass(9_000); // checks missed while locked: 6 s left
  await report();
  expect(__volumesForTests()['sleep:rain']).toBeCloseTo(0.5 * (6 / 30));
  pass(7_000);
  await report();
  expect(isLayerActive('rain')).toBe(false);
});

test('SLEEP-005 +15 min from the current end, and the fade comes back up', async () => {
  useSettingsStore.setState({ sleepFadeSeconds: 30 });
  await startSleepSession();
  pass(50_000);
  await report();
  expect(__volumesForTests()['sleep:rain']).toBeLessThan(0.5);
  extendSleepTimer();
  expect(sleepTimeLeft()).toBe(10_000 + 15 * 60_000);
  expect(__volumesForTests()['sleep:rain']).toBeCloseTo(0.5);
});

test('SLEEP-006 "No timer" while playing: it plays until stopped; All night is remembered', async () => {
  await startSleepSession();
  setSleepTimer(null);
  pass(8 * 60 * 60_000);
  await report();
  expect(isLayerActive('rain')).toBe(true);
  expect(useSettingsStore.getState().defaultSleepTimerMinutes).toBeNull();
});

test('SLEEP-007 the last choice is remembered: first use is 30 min, then whatever was chosen (including custom)', async () => {
  expect(DEFAULT_SETTINGS.defaultSleepTimerMinutes).toBe(30);
  expect(DEFAULT_SETTINGS.sleepFadeSeconds).toBe(30);
  setSleepTimer(45);
  await startSleepSession();
  expect(sleepTimeLeft()).toBe(45 * 60_000);
  stopSleepSession();
  const r = await renderScreen('sleep', SleepScreen);
  await r.user.press(screen.getByText(SLEEP_TIMER_COPY.custom));
  await r.user.type(screen.getByLabelText('Timer length in minutes'), '20');
  await r.user.press(screen.getByText('Set'));
  expect(useSettingsStore.getState().defaultSleepTimerMinutes).toBe(20);
  expect(screen.getByText('20m')).toBeTruthy();
});

test('SLEEP-008 the fade is never longer than the timer; longer fade choices are disabled', async () => {
  useSettingsStore.setState({ defaultSleepTimerMinutes: 1, sleepFadeSeconds: 300 });
  await startSleepSession();
  expect(useSleepStore.getState().fadeMs).toBe(60_000);
  stopSleepSession();
  await renderScreen('sleep', SleepScreen);
  expect(screen.getByText('5 min')).toBeTruthy();
  expect(screen.getByRole('button', { name: '5 min' }).props.accessibilityState).toMatchObject({ disabled: true });
});

test('SLEEP-009 Ona killed while playing: on the next start nothing claims to be playing', async () => {
  stopWatch();
  stopAllLayers('sleep');
  useSleepStore.setState({ isPlaying: true, endsAt: Date.now() + 60_000 } as never);
  stopWatch = startSleepSessionWatch();
  expect(useSleepStore.getState()).toMatchObject({ isPlaying: false, endsAt: null });
});

test('SLEEP-010 a second sound added mid-timer: the timer stays and every layer stops at the end', async () => {
  await startSleepSession();
  pass(20_000);
  useSleepStore.getState().addSoundToMix('forest');
  await act(async () => {});
  expect(isLayerActive('forest')).toBe(true);
  expect(sleepTimeLeft()).toBe(40_000);
  pass(41_000);
  await report();
  expect(isLayerActive('rain')).toBe(false);
  expect(isLayerActive('forest')).toBe(false);
});

test('SLEEP-011 the phone\'s clock changed, or daylight saving: the end doesn\'t move', async () => {
  await startSleepSession();
  jest.setSystemTime(Date.now() - 60 * 60_000); // clock set back an hour
  pass(30_000);
  await report();
  expect(sleepTimeLeft()).toBe(30_000);
  jest.setSystemTime(Date.now() + 3 * 60 * 60_000); // forward three
  await report();
  expect(isLayerActive('rain')).toBe(true);
  pass(31_000);
  await report();
  expect(isLayerActive('rain')).toBe(false);
});

test('SLEEP-012 one sound session at a time: Study replaces Sleep (the session ends), Sleep replaces Study; ending a session stops only its own', async () => {
  await startSleepSession();
  const r = await playLayer('fan-hum', 0.6, 'study');
  expect(r).toMatchObject({ ok: true, replaced: 'sleep' });
  expect(isLayerActive('rain')).toBe(false);
  expect(useSleepStore.getState().isPlaying).toBe(false);
  expect(await startSleepSession()).toMatchObject({ ok: true, replacedStudy: true });
  expect(isLayerActive('fan-hum', 'study')).toBe(false);
  stopLayer('fan-hum', 'study'); // the study session ends: Sleep keeps playing
  expect(isLayerActive('rain')).toBe(true);
});

test('SLEEP-013 the lock-screen player is set while Sleep plays and cleared when it stops (the media notification goes)', async () => {
  await startSleepSession();
  const p = players()[0];
  expect(p.setActiveForLockScreen).toHaveBeenCalledWith(true, expect.objectContaining({ title: 'Sleep sounds' }), expect.objectContaining({ isLiveStream: true }));
  pass(61_000);
  await report();
  expect(p.clearLockScreenControls).toHaveBeenCalled();
});

test('SLEEP-014 after the timer ended, nothing starts again (a status report, coming back, a call ending)', async () => {
  await startSleepSession();
  pass(61_000);
  await report();
  const made = (createAudioPlayer as jest.Mock).mock.calls.length;
  await report();
  await act(async () => appStateListener?.('active'));
  await run(5_000);
  expect((createAudioPlayer as jest.Mock).mock.calls.length).toBe(made);
  expect(isLayerActive('rain')).toBe(false);
});

test('SLEEP-015 settings from before: no timer becomes the first-use 30 min; the fade becomes 30 s', () => {
  const s = migrateSettings({ defaultSleepTimerMinutes: null, defaultFadeOutMinutes: 5 }, 3);
  expect(s.defaultSleepTimerMinutes).toBe(30);
  expect(s.sleepFadeSeconds).toBe(30);
  expect((s as unknown as Record<string, unknown>).defaultFadeOutMinutes).toBeUndefined();
  expect(migrateSettings({ defaultSleepTimerMinutes: 45 }, 3).defaultSleepTimerMinutes).toBe(45);
});
