// PIN locks (Journaling, and the optional lock on the whole app).
//
// - The PIN itself is never stored: only a salted, iterated SHA-256 hash, kept
//   in the device's secure storage (Keychain / Keystore via expo-secure-store).
// - Repeated wrong PINs lock entry for a while, doubling each time.
// - "Forgot PIN" asks for the phone's own unlock (fingerprint, face or the
//   phone's passcode) and then lets the user set a new PIN. No data is touched.
import { Platform } from 'react-native';

export type LockScope = 'journal' | 'app';

export interface PinRecord {
  salt: string;
  hash: string;
  iterations: number;
  failedAttempts: number;
  lockedUntil?: number; // epoch ms
}

export const PIN_LENGTH = { min: 4, max: 6 };
export const FREE_ATTEMPTS = 5;
const BASE_LOCKOUT_MS = 30_000;
const MAX_LOCKOUT_MS = 15 * 60_000;
const ITERATIONS = 500;

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH.min},${PIN_LENGTH.max}}$`).test(pin);
}

// How long entry is locked after this many failed attempts in a row:
// nothing for the first few, then 30 s, 1 min, 2 min… up to 15 min.
export function lockoutMs(failedAttempts: number): number {
  if (failedAttempts < FREE_ATTEMPTS) return 0;
  return Math.min(MAX_LOCKOUT_MS, BASE_LOCKOUT_MS * 2 ** (failedAttempts - FREE_ATTEMPTS));
}

// ---------------------------------------------------------------------------
// Dependencies (real ones below; tests pass their own)
// ---------------------------------------------------------------------------
export interface PinDeps {
  digest: (data: string) => Promise<string>; // SHA-256, hex
  randomSalt: () => string;
  read: (key: string) => Promise<string | null>;
  write: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
  now: () => number;
}

const keyFor = (scope: LockScope) => `ona.pin.${scope}`;

export async function hashPin(pin: string, salt: string, iterations: number, digest: PinDeps['digest']): Promise<string> {
  let h = `${salt}:${pin}`;
  for (let i = 0; i < iterations; i++) h = await digest(`${salt}:${h}`);
  return h;
}

async function load(scope: LockScope, deps: PinDeps): Promise<PinRecord | null> {
  const raw = await deps.read(keyFor(scope));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PinRecord;
  } catch {
    return null;
  }
}

async function save(scope: LockScope, record: PinRecord, deps: PinDeps) {
  await deps.write(keyFor(scope), JSON.stringify(record));
}

export async function hasPin(scope: LockScope, deps: PinDeps = defaultDeps): Promise<boolean> {
  return (await load(scope, deps)) !== null;
}

export async function setPin(scope: LockScope, pin: string, deps: PinDeps = defaultDeps): Promise<void> {
  if (!isValidPin(pin)) throw new Error('PIN must be 4 to 6 digits');
  const salt = deps.randomSalt();
  await save(scope, { salt, hash: await hashPin(pin, salt, ITERATIONS, deps.digest), iterations: ITERATIONS, failedAttempts: 0 }, deps);
}

export async function clearPin(scope: LockScope, deps: PinDeps = defaultDeps): Promise<void> {
  await deps.remove(keyFor(scope));
}

export type VerifyResult = { ok: true } | { ok: false; reason: 'wrong'; attemptsBeforeLockout: number } | { ok: false; reason: 'locked'; retryInMs: number } | { ok: false; reason: 'noPin' };

export async function verifyPin(scope: LockScope, pin: string, deps: PinDeps = defaultDeps): Promise<VerifyResult> {
  const record = await load(scope, deps);
  if (!record) return { ok: false, reason: 'noPin' };
  const now = deps.now();
  if (record.lockedUntil && record.lockedUntil > now) return { ok: false, reason: 'locked', retryInMs: record.lockedUntil - now };

  if ((await hashPin(pin, record.salt, record.iterations, deps.digest)) === record.hash) {
    if (record.failedAttempts || record.lockedUntil) await save(scope, { ...record, failedAttempts: 0, lockedUntil: undefined }, deps);
    return { ok: true };
  }
  const failedAttempts = record.failedAttempts + 1;
  const wait = lockoutMs(failedAttempts);
  await save(scope, { ...record, failedAttempts, lockedUntil: wait ? now + wait : undefined }, deps);
  return wait ? { ok: false, reason: 'locked', retryInMs: wait } : { ok: false, reason: 'wrong', attemptsBeforeLockout: FREE_ATTEMPTS - failedAttempts };
}

// A successful biometric unlock also clears a failure streak.
export async function resetFailures(scope: LockScope, deps: PinDeps = defaultDeps): Promise<void> {
  const record = await load(scope, deps);
  if (record && (record.failedAttempts || record.lockedUntil)) await save(scope, { ...record, failedAttempts: 0, lockedUntil: undefined }, deps);
}

// ---------------------------------------------------------------------------
// Device authentication (biometrics, or the phone's own passcode)
// ---------------------------------------------------------------------------
export interface DeviceAuthInfo {
  available: boolean; // the phone can authenticate at all (biometric or passcode)
  biometrics: boolean; // a fingerprint or face is enrolled
}

export async function deviceAuthInfo(): Promise<DeviceAuthInfo> {
  if (Platform.OS === 'web') return { available: false, biometrics: false };
  try {
    const LA = await import('expo-local-authentication');
    const level = await LA.getEnrolledLevelAsync();
    const enrolled = await LA.isEnrolledAsync();
    return { available: level !== LA.SecurityLevel.NONE, biometrics: (await LA.hasHardwareAsync()) && enrolled };
  } catch {
    return { available: false, biometrics: false };
  }
}

// `allowPasscode`: false for "Unlock with fingerprint/face" (the PIN is the
// fallback), true for "Forgot PIN", where the phone's passcode proves it's the owner.
export async function authenticateWithDevice(promptMessage: string, allowPasscode: boolean): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const LA = await import('expo-local-authentication');
    const result = await LA.authenticateAsync({ promptMessage, disableDeviceFallback: !allowPasscode, cancelLabel: 'Cancel' });
    return result.success;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Real dependencies
// ---------------------------------------------------------------------------
const defaultDeps: PinDeps = {
  digest: async (data) => {
    const Crypto = await import('expo-crypto');
    return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, data);
  },
  randomSalt: () => {
    // Synchronous import is fine here: expo-crypto is already loaded by digest.
    const Crypto = require('expo-crypto') as typeof import('expo-crypto');
    return Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
  },
  // Secure storage on phones. The web preview has none, so it falls back to
  // local storage there — fine for previewing, never used on a device.
  read: async (key) => {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
    const SecureStore = await import('expo-secure-store');
    return SecureStore.getItemAsync(key);
  },
  write: async (key, value) => {
    if (Platform.OS === 'web') return void globalThis.localStorage?.setItem(key, value);
    const SecureStore = await import('expo-secure-store');
    await SecureStore.setItemAsync(key, value);
  },
  remove: async (key) => {
    if (Platform.OS === 'web') return void globalThis.localStorage?.removeItem(key);
    const SecureStore = await import('expo-secure-store');
    await SecureStore.deleteItemAsync(key);
  },
  now: () => Date.now(),
};

// "Forgot PIN": the phone's own unlock, then the old PIN is removed so a new
// one can be set. Returns false if the user couldn't (or chose not to) confirm.
export async function forgotPin(scope: LockScope, deps: PinDeps = defaultDeps, auth = authenticateWithDevice): Promise<boolean> {
  const ok = await auth('Confirm it’s you to reset your Ona PIN', true);
  if (!ok) return false;
  await clearPin(scope, deps);
  return true;
}
