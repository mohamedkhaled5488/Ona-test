// Every "in progress" marker clears itself after a failure or a refusal
// (the RA-07 pattern: a sync refused once used to block every later sync).
// Each case fails or is refused twice in a row, then succeeds on the third
// try in the same session, as a person retrying would.
// IDs: docs/real-account-test-report.md (RA-07), docs/test-cases/integration.md (ATTEMPT-*)
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));
jest.setTimeout(30_000);

import React from 'react';
import { act, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer } from 'expo-audio';
import { resetAll, useClock, restoreClock } from '../../test-utils';
import { renderWithApp } from '../../test-utils/render';
import { refreshEntitlement } from '../entitlementSync';
import { useEntitlementStore } from '../../store/useEntitlementStore';
import { runPurchase, runRestore, type FlowDeps } from '../../billing/purchaseFlow';
import { setDataSpace, getDataSpace, isSwitchingDataSpace } from '../dataSpace';
import { __flushForTests, __resetForTests, clearActiveData, listParked, parkActiveData, restoreParked, startAppData, switchDataSpace } from '../dataSpaceController';
import { useJournalStore } from '../../store/useJournalStore';
import { useSleepStore } from '../../store/useSleepStore';
import { useAuthStore } from '../../store/useAuthStore';
import { startSleepSession, stopSleepSession } from '../../audio/sleepSession';
import { isLayerActive, stopAllLayers } from '../audioEngine';
import { ChangeCredentialPage } from '../../screens/settings/AccountPages';

type Store = { getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void>; removeItem: (k: string) => Promise<void> };
const real = AsyncStorage as unknown as Store & { clear: () => Promise<void> };
// Storage whose writes fail while `broken` is true (a full disk, say).
function flakyStorage() {
  const s = { broken: true };
  const fail = () => Promise.reject(new Error('No space left on device'));
  return Object.assign(s, {
    getItem: (k: string) => real.getItem(k),
    setItem: (k: string, v: string) => (s.broken ? fail() : real.setItem(k, v)),
    removeItem: (k: string) => (s.broken ? fail() : real.removeItem(k)),
  });
}
// Fails `times` times, then does `then`.
function failing<T>(times: number, then: () => T | Promise<T>, error = () => new Error('Network request failed')) {
  let n = 0;
  return jest.fn(async () => {
    if (n++ < times) throw error();
    return then();
  });
}
const entry = (id: string) => ({ id, date: '2026-10-25', zone: 'calm', text: id, tags: [], createdAt: '2026-10-25T08:00:00.000Z', updatedAt: '2026-10-25T08:00:00.000Z' });

beforeEach(async () => {
  await resetAll();
  useClock('2026-10-25T12:00');
});
afterEach(() => {
  stopAllLayers('sleep');
  restoreClock();
});

test('ATTEMPT-001 plan refresh: the server fails twice, the third ask saves the answer (nothing left "loading")', async () => {
  const raw = { server_time: new Date().toISOString(), trial_started_at: new Date().toISOString(), trial_ends_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), subscription: null, trial_newly_started: false };
  const startTrial = failing(2, () => raw);
  const server = { startTrial, getEntitlement: startTrial } as never;
  expect(await refreshEntitlement('u1', server)).toBe(false);
  expect(await refreshEntitlement('u1', server)).toBe(false);
  expect(useEntitlementStore.getState().loading).toBe(false);
  expect(await refreshEntitlement('u1', server)).toBe(true);
  expect(useEntitlementStore.getState().snapshots.u1).toBeDefined();
});

function deps(client: FlowDeps['client']): FlowDeps {
  return { client, track: jest.fn(), refreshEntitlement: jest.fn(async () => true), hasAccess: () => true, setPending: jest.fn(), country: 'DE', now: () => Date.now() };
}

test('ATTEMPT-002 subscribe: the store fails twice, the third purchase goes through', async () => {
  const purchase = failing(2, () => ({ kind: 'purchased' as const }));
  const d = deps({ purchase, restore: jest.fn() } as never);
  const pkg = { role: 'monthly', productId: 'plus_monthly' } as never;
  expect((await runPurchase(pkg, d)).outcome).toBe('failed');
  expect((await runPurchase(pkg, d)).outcome).toBe('failed');
  expect((await runPurchase(pkg, d)).outcome).toBe('purchased');
});

test('ATTEMPT-003 restore purchases: fails twice, the third restores', async () => {
  const restore = failing(2, () => ({ kind: 'restored' as const }));
  const d = deps({ purchase: jest.fn(), restore } as never);
  const msgs = [await runRestore(d), await runRestore(d), await runRestore(d)];
  expect(msgs[0]).toBe(msgs[1]);
  expect(msgs[2]).not.toBe(msgs[0]);
});

describe('the space lock (demo switch, put aside, bring back, remove)', () => {
  beforeEach(async () => {
    await real.clear();
    __resetForTests();
    setDataSpace('real');
    await startAppData(real as never, false);
    useJournalStore.setState({ entries: [entry('j1'), entry('j2')] } as never);
    await __flushForTests();
  });

  test('ATTEMPT-010 switching to the demo: storage fails twice, the third switch works; never left mid-switch', async () => {
    const s = flakyStorage();
    await expect(switchDataSpace('demo', s as never)).rejects.toThrow();
    expect(isSwitchingDataSpace()).toBe(false);
    await expect(switchDataSpace('demo', s as never)).rejects.toThrow();
    expect(isSwitchingDataSpace()).toBe(false);
    s.broken = false;
    await switchDataSpace('demo', s as never);
    expect(getDataSpace()).toBe('demo');
    await switchDataSpace('real', s as never);
    expect(useJournalStore.getState().entries.map((e) => e.id)).toEqual(['j1', 'j2']);
  });

  test('ATTEMPT-011 putting data aside: fails twice (nothing lost, not left locked), the third works', async () => {
    const s = flakyStorage();
    await expect(parkActiveData({ origin: null, reason: 'keptSeparate' }, s as never)).rejects.toThrow();
    await expect(parkActiveData({ origin: null, reason: 'keptSeparate' }, s as never)).rejects.toThrow();
    expect(isSwitchingDataSpace()).toBe(false);
    expect(useJournalStore.getState().entries.map((e) => e.id)).toEqual(['j1', 'j2']);
    s.broken = false;
    const copy = await parkActiveData({ origin: null, reason: 'keptSeparate' }, s as never);
    expect(useJournalStore.getState().entries).toEqual([]);
    expect((await listParked(real as never)).map((c) => c.id)).toEqual([copy.id]);
  });

  test('ATTEMPT-012 bringing it back: fails twice, the third brings it all back', async () => {
    const copy = await parkActiveData({ origin: null, reason: 'keptSeparate' }, real as never);
    const s = flakyStorage();
    await expect(restoreParked(copy.id, s as never)).rejects.toThrow();
    await expect(restoreParked(copy.id, s as never)).rejects.toThrow();
    expect(isSwitchingDataSpace()).toBe(false);
    s.broken = false;
    await restoreParked(copy.id, s as never);
    expect(useJournalStore.getState().entries.map((e) => e.id).sort()).toEqual(['j1', 'j2']);
  });

  test('ATTEMPT-013 removing this phone\'s copy at sign-out: fails twice, the third removes it', async () => {
    const s = flakyStorage();
    await expect(clearActiveData(s as never)).rejects.toThrow();
    await expect(clearActiveData(s as never)).rejects.toThrow();
    expect(isSwitchingDataSpace()).toBe(false);
    s.broken = false;
    await clearActiveData(s as never);
    expect(useJournalStore.getState().entries).toEqual([]);
  });
});

test('ATTEMPT-020 the sleep timer: a sound fails to load twice (not left "playing" with nothing to stop), the third plays', async () => {
  const mock = createAudioPlayer as jest.Mock;
  const original = mock.getMockImplementation()!;
  let n = 0;
  mock.mockImplementation((...args: unknown[]) => {
    if (n++ < 2) throw new Error("Couldn't decode the file");
    return original(...args);
  });
  try {
    useSleepStore.setState({ mix: [{ soundId: 'white-noise', volume: 0.5 }] } as never);
    expect(await startSleepSession(1)).toMatchObject({ ok: false });
    expect(useSleepStore.getState().isPlaying).toBe(false);
    expect(await startSleepSession(1)).toMatchObject({ ok: false });
    expect(useSleepStore.getState().isPlaying).toBe(false);
    expect(await startSleepSession(1)).toMatchObject({ ok: true });
    expect(isLayerActive('white-noise')).toBe(true);
  } finally {
    mock.mockImplementation(original);
    stopSleepSession();
  }
});

test('ATTEMPT-030 changing the email: the request throws twice (Save never left disabled), the third saves', async () => {
  const updateEmail = failing(2, () => ({ ok: true }));
  useAuthStore.setState({ updateEmail } as never);
  const onDone = jest.fn();
  const r = await renderWithApp(<ChangeCredentialPage kind="email" onDone={onDone} />);
  await r.user.type(screen.getByLabelText('New email'), 'new@example.com');
  for (let i = 0; i < 2; i++) {
    await r.user.press(screen.getByText('Save'));
    expect(await screen.findByText('Network request failed')).toBeTruthy();
    expect(screen.getByText('Save')).toBeTruthy(); // not "Saving..." forever
  }
  await act(async () => {});
  await r.user.press(screen.getByText('Save'));
  expect(updateEmail).toHaveBeenCalledTimes(3);
  expect(onDone).toHaveBeenCalled();
});
