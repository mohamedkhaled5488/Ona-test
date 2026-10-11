// Settings → Privacy, Security & Data → Security, and the PIN page behind it
// (turning a lock on, changing its PIN, turning it off).
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Caption } from '../../components/Typography';
import { PinPad } from '../../components/PinPad';
import { useUi } from '../../components/UiProvider';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useLockStore } from '../../store/useLockStore';
import { clearPin, deviceAuthInfo, forgotPin, setPin, verifyPin, type DeviceAuthInfo, type LockScope } from '../../utils/pinLock';
import { errorFeedback, successFeedback } from '../../utils/haptics';
import { colors, spacing } from '../../theme';
import { themedStyles } from '../../theme/runtime';
import { Group, NavRow, Notice, ToggleRow } from './SettingsParts';
import type { SettingsParams } from './pages';

type OpenPin = (scope: LockScope, pinMode: NonNullable<SettingsParams['pinMode']>) => void;

const LOCK_KEY = { journal: 'journalLock', app: 'appLock' } as const;
const BIO_KEY = { journal: 'journalLockBiometrics', app: 'appLockBiometrics' } as const;

function useDeviceAuth(): DeviceAuthInfo | null {
  const [info, setInfo] = useState<DeviceAuthInfo | null>(null);
  useEffect(() => {
    void deviceAuthInfo().then(setInfo);
  }, []);
  return info;
}

function LockRows({ scope, openPin, label, explain }: { scope: LockScope; openPin: OpenPin; label: string; explain: string }) {
  const on = useSettingsStore((s) => s[LOCK_KEY[scope]]);
  const bio = useSettingsStore((s) => s[BIO_KEY[scope]]);
  const set = useSettingsStore((s) => s.set);
  const auth = useDeviceAuth();
  return (
    <>
      <ToggleRow label={label} explain={explain} value={on} onChange={(next) => openPin(scope, next ? 'turnOn' : 'turnOff')} />
      {on && (
        <>
          <ToggleRow
            label="Unlock with fingerprint or face"
            explain={auth?.biometrics ? 'Your PIN still works too' : "This phone doesn't have a fingerprint or face set up"}
            value={bio && !!auth?.biometrics}
            disabled={!auth?.biometrics}
            onChange={(v) => set(BIO_KEY[scope], v)}
          />
          <NavRow label="Change PIN" onPress={() => openPin(scope, 'change')} />
        </>
      )}
    </>
  );
}

export function SecurityGroup({ openPin }: { openPin: OpenPin }) {
  const hide = useSettingsStore((s) => s.hideInRecents);
  const block = useSettingsStore((s) => s.blockSensitiveScreenshots);
  const set = useSettingsStore((s) => s.set);
  return (
    <Group title="Security" footer={Platform.OS === 'web' ? "Locks and screen protection work on your phone. The web preview can't block screenshots." : undefined}>
      <LockRows scope="journal" openPin={openPin} label="Journaling PIN lock" explain="Ask for a PIN before showing your journal" />
      <LockRows scope="app" openPin={openPin} label="App lock" explain="Ask for a PIN (or fingerprint/face) when you open Ona" />
      <ToggleRow
        label="Hide content in recent apps"
        explain={
          Platform.OS === 'android'
            ? "Ona's preview is hidden in the app switcher. On Android this also blocks screenshots everywhere in Ona."
            : "Ona's preview is blurred in the app switcher"
        }
        value={hide}
        onChange={(v) => set('hideInRecents', v)}
      />
      <ToggleRow
        label="Block screenshots in sensitive sections"
        explain="Journaling, Identify the Feeling and Quit a Habit"
        value={block}
        onChange={(v) => set('blockSensitiveScreenshots', v)}
      />
    </Group>
  );
}

export function JournalLockGroup({ openPin }: { openPin: OpenPin }) {
  return (
    <Group title="Privacy">
      <LockRows scope="journal" openPin={openPin} label="Lock Journaling with a PIN" explain="Ask for a PIN before showing your journal" />
    </Group>
  );
}

// ---------------------------------------------------------------------------
// The PIN page
// ---------------------------------------------------------------------------
type Step = 'current' | 'new' | 'confirm';

export function PinPage({ scope, mode, onDone }: { scope: LockScope; mode: NonNullable<SettingsParams['pinMode']>; onDone: () => void }) {
  const set = useSettingsStore((s) => s.set);
  const unlock = useLockStore((s) => s.unlock);
  const { showToast } = useUi();
  const [step, setStep] = useState<Step>(mode === 'turnOn' ? 'new' : 'current');
  const [first, setFirst] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [resetKey, setResetKey] = useState(0);
  const what = scope === 'app' ? 'Ona' : 'Journaling';

  const fail = (message: string) => {
    errorFeedback();
    setError(message);
    setResetKey((k) => k + 1);
  };

  const finish = async (pin?: string) => {
    if (mode === 'turnOff') {
      await clearPin(scope);
      set(LOCK_KEY[scope], false);
      set(BIO_KEY[scope], false);
      showToast({ message: `${what} lock is off.` });
    } else {
      await setPin(scope, pin!);
      set(LOCK_KEY[scope], true);
      unlock(scope); // you just proved you know it
      showToast({ message: mode === 'change' ? 'PIN changed.' : `${what} lock is on.` });
    }
    successFeedback();
    onDone();
  };

  const submit = async (pin: string) => {
    if (step === 'current') {
      const result = await verifyPin(scope, pin);
      if (!result.ok) {
        if (result.reason === 'noPin') {
          // Nothing to check against (storage was cleared): carry on.
        } else if (result.reason === 'locked') return fail(`Too many tries. Try again in ${Math.ceil(result.retryInMs / 1000)} seconds.`);
        else return fail("That's not the PIN.");
      }
      if (mode === 'turnOff') return finish();
      setError(undefined);
      setStep('new');
      setResetKey((k) => k + 1);
      return;
    }
    if (step === 'new') {
      setFirst(pin);
      setError(undefined);
      setStep('confirm');
      setResetKey((k) => k + 1);
      return;
    }
    if (pin !== first) {
      setStep('new');
      return fail("The PINs didn't match. Choose a new PIN again.");
    }
    await finish(pin);
  };

  const forgot = async () => {
    const info = await deviceAuthInfo();
    if (!info.available) return fail("This phone has no screen lock, so Ona can't confirm it's you.");
    if (!(await forgotPin(scope))) return;
    if (mode === 'turnOff') {
      set(LOCK_KEY[scope], false);
      set(BIO_KEY[scope], false);
      showToast({ message: `${what} lock is off.` });
      onDone();
      return;
    }
    setError(undefined);
    setStep('new');
    setResetKey((k) => k + 1);
  };

  const titles: Record<Step, string> = {
    current: 'Enter your current PIN',
    new: mode === 'turnOn' ? `Choose a PIN for ${what}` : 'Choose a new PIN',
    confirm: 'Enter it again',
  };

  return (
    <View style={styles.page}>
      {mode === 'turnOn' && step === 'new' && (
        <Notice>
          <Caption>4 to 6 digits. If you forget it, your phone's own unlock lets you set a new one, and nothing is lost.</Caption>
        </Notice>
      )}
      <PinPad title={titles[step]} error={error} resetKey={`${step}-${resetKey}`} onSubmit={(p) => void submit(p)} />
      {step === 'current' && (
        <Pressable onPress={() => void forgot()} hitSlop={10} accessibilityRole="button" style={styles.forgot}>
          <Caption style={styles.link}>Forgot PIN?</Caption>
        </Pressable>
      )}
    </View>
  );
}

const styles = themedStyles(() => ({
  page: { gap: spacing.md },
  forgot: { alignSelf: 'center' },
  link: { color: colors.teal },
}));
