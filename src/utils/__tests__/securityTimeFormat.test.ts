// PIN locks, relocking, the 12/24-hour setting and the budget warning level.
import {
  FREE_ATTEMPTS,
  clearPin,
  forgotPin,
  hasPin,
  isValidPin,
  lockoutMs,
  resetFailures,
  setPin,
  verifyPin,
  type PinDeps,
} from '../pinLock';
import { useLockStore, RELOCK_AFTER_MS } from '../../store/useLockStore';
import { formatClockTime, formatTimeOfDay } from '../date';
import { limitWarningLevel } from '../../store/useBudgetStore';
import type { Budget } from '../../types/sections';

// Node's own SHA-256 stands in for expo-crypto (no Node types in this project).
const { createHash } = require('crypto') as { createHash: (alg: string) => { update: (d: string) => { digest: (enc: 'hex') => string } } };

function fakeDeps() {
  const store = new Map<string, string>();
  let t = 1_000_000;
  const deps: PinDeps & { store: Map<string, string>; advance: (ms: number) => void } = {
    store,
    digest: async (d) => createHash('sha256').update(d).digest('hex'),
    randomSalt: () => Math.random().toString(16).slice(2),
    read: async (k) => store.get(k) ?? null,
    write: async (k, v) => void store.set(k, v),
    remove: async (k) => void store.delete(k),
    now: () => t,
    advance: (ms) => (t += ms),
  };
  return deps;
}

describe('PIN lock', () => {
  test('only 4 to 6 digits are accepted', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('123456')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('1234567')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
  });

  test('the PIN is stored hashed and salted, never as typed', async () => {
    const d = fakeDeps();
    await setPin('journal', '2580', d);
    const raw = d.store.get('ona.pin.journal')!;
    expect(raw).not.toContain('2580');
    const record = JSON.parse(raw);
    expect(record.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.salt.length).toBeGreaterThan(4);
    // Same PIN, new salt → a different hash.
    const d2 = fakeDeps();
    await setPin('journal', '2580', d2);
    expect(JSON.parse(d2.store.get('ona.pin.journal')!).hash).not.toBe(record.hash);
  });

  test('right PIN unlocks, wrong PIN counts down to a lockout', async () => {
    const d = fakeDeps();
    await setPin('app', '1357', d);
    expect(await verifyPin('app', '1357', d)).toEqual({ ok: true });
    for (let i = 1; i < FREE_ATTEMPTS; i++) {
      expect(await verifyPin('app', '0000', d)).toEqual({ ok: false, reason: 'wrong', attemptsBeforeLockout: FREE_ATTEMPTS - i });
    }
    const locked = await verifyPin('app', '0000', d);
    expect(locked).toMatchObject({ ok: false, reason: 'locked' });
    // Even the right PIN waits out the lockout.
    expect(await verifyPin('app', '1357', d)).toMatchObject({ ok: false, reason: 'locked' });
    d.advance(lockoutMs(FREE_ATTEMPTS) + 1);
    expect(await verifyPin('app', '1357', d)).toEqual({ ok: true });
    // A success clears the streak.
    expect(await verifyPin('app', '0000', d)).toMatchObject({ reason: 'wrong', attemptsBeforeLockout: FREE_ATTEMPTS - 1 });
  });

  test('lockouts grow and are capped', () => {
    expect(lockoutMs(FREE_ATTEMPTS - 1)).toBe(0);
    expect(lockoutMs(FREE_ATTEMPTS)).toBe(30_000);
    expect(lockoutMs(FREE_ATTEMPTS + 1)).toBe(60_000);
    expect(lockoutMs(FREE_ATTEMPTS + 20)).toBe(15 * 60_000);
  });

  test('locks are separate per scope', async () => {
    const d = fakeDeps();
    await setPin('journal', '1111', d);
    await setPin('app', '2222', d);
    expect((await verifyPin('journal', '2222', d)).ok).toBe(false);
    expect((await verifyPin('app', '2222', d)).ok).toBe(true);
  });

  test('forgot PIN needs the phone’s own unlock, then clears the PIN without touching anything else', async () => {
    const d = fakeDeps();
    d.store.set('some.other.key', 'journal entries live elsewhere');
    await setPin('journal', '4321', d);
    expect(await forgotPin('journal', d, async () => false)).toBe(false);
    expect(await hasPin('journal', d)).toBe(true);
    expect(await forgotPin('journal', d, async () => true)).toBe(true);
    expect(await hasPin('journal', d)).toBe(false);
    expect(d.store.get('some.other.key')).toBe('journal entries live elsewhere');
    await setPin('journal', '9999', d);
    expect((await verifyPin('journal', '9999', d)).ok).toBe(true);
  });

  test('biometric unlock resets a failure streak; clearing removes the PIN', async () => {
    const d = fakeDeps();
    await setPin('app', '1234', d);
    await verifyPin('app', '0000', d);
    await verifyPin('app', '0000', d);
    await resetFailures('app', d);
    expect(JSON.parse(d.store.get('ona.pin.app')!).failedAttempts).toBe(0);
    await clearPin('app', d);
    expect(await verifyPin('app', '1234', d)).toEqual({ ok: false, reason: 'noPin' });
  });
});

describe('relocking', () => {
  beforeEach(() => useLockStore.getState().lockAll());

  test('a short trip away keeps things unlocked, a longer one locks again', () => {
    const s = useLockStore.getState();
    s.unlock('journal');
    s.unlock('app');
    s.markBackgrounded(0);
    useLockStore.getState().markForegrounded(RELOCK_AFTER_MS - 1);
    expect(useLockStore.getState().unlocked).toEqual({ app: true, journal: true });
    useLockStore.getState().markBackgrounded(10_000);
    useLockStore.getState().markForegrounded(10_000 + RELOCK_AFTER_MS);
    expect(useLockStore.getState().unlocked).toEqual({ app: false, journal: false });
  });
});

describe('time format', () => {
  test('12-hour and 24-hour', () => {
    expect(formatClockTime('18:05', '24h')).toBe('18:05');
    expect(formatClockTime('18:05', '12h')).toBe('6:05 PM');
    expect(formatClockTime('00:30', '12h')).toBe('12:30 AM');
    expect(formatClockTime('12:00', '12h')).toBe('12:00 PM');
    expect(formatClockTime('07:00', '24h')).toBe('07:00');
    expect(formatTimeOfDay(new Date(2026, 9, 6, 9, 3), '12h')).toBe('9:03 AM');
  });
  test('the phone setting picks one of the two', () => {
    expect(['18:05', '6:05 PM']).toContain(formatClockTime('18:05', 'system'));
  });
});

describe('budget warning level', () => {
  const budget = { mode: 'limit', targetAmount: 100 } as Budget;
  test('follows "Warn me at"', () => {
    expect(limitWarningLevel(budget, 80)).toBe('approaching'); // default 80%
    expect(limitWarningLevel(budget, 85, 90)).toBe('none');
    expect(limitWarningLevel(budget, 90, 90)).toBe('approaching');
    expect(limitWarningLevel(budget, 99, 100)).toBe('none');
    expect(limitWarningLevel(budget, 101, 100)).toBe('over');
  });
});
