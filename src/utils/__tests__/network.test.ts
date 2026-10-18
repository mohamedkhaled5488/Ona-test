// The "are we online?" check before sign-in and other account actions. A
// server waking up after a quiet spell can take several seconds to answer:
// that must count as online, not "You're offline".
jest.mock('../../lib/supabase', () => ({ isSupabaseConfigured: true, supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'key', supabase: {} }));

import { isOnline, ONLINE_TIMEOUT_MS } from '../network';
import { useSettingsStore } from '../../store/useSettingsStore';

const answerAfter = (ms: number) => (_url: unknown, init?: { signal?: AbortSignal }) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve({ status: 200 }), ms);
    init?.signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new Error('aborted'));
    });
  });

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn();
  (globalThis as { fetch: unknown }).fetch = fetchMock;
  useSettingsStore.setState({ devSimulateOffline: false });
});

test('waits long enough for a server that is waking up (several seconds)', () => {
  expect(ONLINE_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
});

test('a slow answer still counts as online', async () => {
  fetchMock.mockImplementation(answerAfter(300));
  expect(await isOnline(1000)).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('an outright failure is tried once more before saying offline', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('Network request failed')).mockImplementation(answerAfter(10));
  expect(await isOnline(1000)).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('no answer at all within the time: offline, without waiting twice', async () => {
  fetchMock.mockImplementation(answerAfter(5000));
  expect(await isOnline(200)).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('two failures in a row: offline', async () => {
  fetchMock.mockRejectedValue(new TypeError('Network request failed'));
  expect(await isOnline(500)).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('the developer "simulate offline" switch still wins', async () => {
  useSettingsStore.setState({ devSimulateOffline: true });
  expect(await isOnline()).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});
