// The lock in front of Journaling (or the whole app): PIN pad, optional
// fingerprint/face, and "Forgot PIN?" which asks for the phone's own unlock
// and then sets a new PIN. Nothing is ever deleted.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { Caption } from './Typography';
import { PinPad } from './PinPad';
import { OnaMark } from './OnaMark';
import { colors, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';
import { useSettingsStore } from '../store/useSettingsStore';
import { useLockStore } from '../store/useLockStore';
import {
  authenticateWithDevice,
  deviceAuthInfo,
  forgotPin,
  hasPin,
  resetFailures,
  setPin,
  verifyPin,
  type LockScope,
} from '../utils/pinLock';
import { errorFeedback, successFeedback } from '../utils/haptics';

function formatWait(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return s < 60 ? `${s} seconds` : `${Math.ceil(s / 60)} minute${s > 60 ? 's' : ''}`;
}

const TITLES: Record<LockScope, string> = { app: 'Ona is locked', journal: 'Journaling is locked' };

export function LockScreen({ scope }: { scope: LockScope }) {
  const unlock = useLockStore((s) => s.unlock);
  const biometricsOn = useSettingsStore((s) => (scope === 'app' ? s.appLockBiometrics : s.journalLockBiometrics));
  const [error, setError] = useState<string | undefined>();
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [attempt, setAttempt] = useState(0);
  const [canBiometric, setCanBiometric] = useState(false);
  // After "Forgot PIN" succeeds: choose a new PIN (enter, then confirm).
  const [reset, setReset] = useState<null | { first?: string }>(null);
  const prompted = useRef(false);

  const tryBiometric = useCallback(async () => {
    if (await authenticateWithDevice(scope === 'app' ? 'Unlock Ona' : 'Unlock Journaling', false)) {
      await resetFailures(scope);
      successFeedback();
      unlock(scope);
    }
  }, [scope, unlock]);

  useEffect(() => {
    let alive = true;
    void deviceAuthInfo().then((info) => {
      if (!alive) return;
      const can = biometricsOn && info.biometrics;
      setCanBiometric(can);
      // Offer the fingerprint/face prompt straight away, once.
      if (can && !prompted.current && AppState.currentState === 'active') {
        prompted.current = true;
        void tryBiometric();
      }
    });
    return () => {
      alive = false;
    };
  }, [biometricsOn, tryBiometric]);

  // Count down a lockout.
  useEffect(() => {
    if (!lockedUntil) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= lockedUntil) {
        setLockedUntil(null);
        setError(undefined);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  // A missing PIN (cleared storage, a reinstall) can't be checked: open, and
  // Settings will show the lock as needing a new PIN.
  useEffect(() => {
    void hasPin(scope).then((has) => {
      if (!has) unlock(scope);
    });
  }, [scope, unlock]);

  const submit = async (pin: string) => {
    const result = await verifyPin(scope, pin);
    setAttempt((a) => a + 1);
    if (result.ok) {
      successFeedback();
      unlock(scope);
      return;
    }
    errorFeedback();
    if (result.reason === 'locked') {
      setLockedUntil(Date.now() + result.retryInMs);
      setNow(Date.now());
      setError(undefined);
    } else if (result.reason === 'wrong') {
      setError(result.attemptsBeforeLockout > 0 ? `That's not the PIN. ${result.attemptsBeforeLockout} more ${result.attemptsBeforeLockout === 1 ? 'try' : 'tries'} before a short wait.` : "That's not the PIN.");
    } else unlock(scope);
  };

  const forgot = async () => {
    const info = await deviceAuthInfo();
    if (!info.available) {
      setError("This phone has no screen lock, so Ona can't confirm it's you. Set one up in your phone's settings first.");
      return;
    }
    if (await forgotPin(scope)) {
      setError(undefined);
      setReset({});
    }
  };

  const submitNew = async (pin: string) => {
    if (!reset?.first) {
      setReset({ first: pin });
      setAttempt((a) => a + 1);
      return;
    }
    if (pin !== reset.first) {
      errorFeedback();
      setError("The PINs didn't match. Start again.");
      setReset({});
      setAttempt((a) => a + 1);
      return;
    }
    await setPin(scope, pin);
    successFeedback();
    unlock(scope);
  };

  const waiting = lockedUntil !== null && now < lockedUntil;

  return (
    <View style={styles.root} accessibilityViewIsModal>
      <OnaMark size={36} />
      {reset ? (
        <PinPad
          title={reset.first ? 'Enter it again' : 'Choose a new PIN'}
          subtitle="4 to 6 digits. Everything you've written is still here."
          error={error}
          resetKey={attempt}
          onSubmit={(p) => void submitNew(p)}
        />
      ) : (
        <>
          <PinPad
            title={TITLES[scope]}
            subtitle={waiting ? undefined : 'Enter your PIN'}
            error={waiting ? `Too many tries. Try again in ${formatWait(lockedUntil! - now)}.` : error}
            disabled={waiting}
            resetKey={attempt}
            onSubmit={(p) => void submit(p)}
            extraKey={canBiometric ? { icon: 'finger-print', label: 'Unlock with fingerprint or face', onPress: () => void tryBiometric() } : undefined}
          />
          <Pressable onPress={() => void forgot()} hitSlop={10} accessibilityRole="button">
            <Caption style={styles.link}>Forgot PIN?</Caption>
          </Pressable>
        </>
      )}
    </View>
  );
}

// Renders the lock instead of `children` while this scope is locked.
export function LockGate({ scope, children }: { scope: LockScope; children: React.ReactNode }) {
  const enabled = useSettingsStore((s) => (scope === 'app' ? s.appLock : s.journalLock));
  const unlocked = useLockStore((s) => s.unlocked[scope]);
  if (!enabled || unlocked) return <>{children}</>;
  return <LockScreen scope={scope} />;
}

const styles = themedStyles(() => ({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.stone, padding: spacing.lg, gap: spacing.sm },
  link: { color: colors.teal, marginTop: spacing.md },
}));

// The whole-app lock sits over everything (instead of replacing it), so
// whatever screen you were on is still there once you unlock.
export function AppLockOverlay() {
  const enabled = useSettingsStore((s) => s.appLock);
  const unlocked = useLockStore((s) => s.unlocked.app);
  if (!enabled || unlocked) return null;
  return (
    <View style={overlay.fill}>
      <LockScreen scope="app" />
    </View>
  );
}

const overlay = themedStyles(() => ({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 },
}));
