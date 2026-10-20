import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { TextInput } from '../components/TextInput';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Body, Caption, Eyebrow } from '../components/Typography';
import { OnaWordmark } from '../components/OnaWordmark';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, spacing, radii, fonts } from '../theme';
import { withAlpha } from '../utils/color';
import { useAuthStore } from '../store/useAuthStore';
import { CheckRow } from '../components/CheckRow';
import { GoogleButton } from '../components/GoogleButton';
import { TRIAL_DAYS } from '../config/plans';
import { themedStyles } from '../theme/runtime';
import { useDataSpace } from '../hooks/useDataSpace';
import { DemoNotice } from '../demo/DemoNotice';
import { noteConsentSource } from '../sync/accountConsent';
import { ACCOUNT_STORAGE_SENTENCE, SIGN_IN_LABEL, SIGN_UP_LABEL } from '../config/consentWording';

type Mode = 'signIn' | 'signUp';

// Opened from Settings → Account. Ona works fully without an account; one is
// only needed to sync, which starts the free trial.
export function AuthScreen(props: { navigation?: { goBack: () => void } }) {
  if (useDataSpace() === 'demo') {
    return (
      <Screen>
        <DemoNotice title="You're in Demo mode" text="Your account isn't part of the demo. Signing in, syncing, signing out and deleting your account all stay with your own Ona, untouched." />
      </Screen>
    );
  }
  return <RealAuthScreen {...props} />;
}

function RealAuthScreen({ navigation }: { navigation?: { goBack: () => void } }) {
  const [mode, setMode] = useState<Mode>('signUp');
  const [consentAnalytics, setConsentAnalytics] = useState(false);
  const [consentTips, setConsentTips] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const emailValid = /\S+@\S+\.\S+/.test(email.trim());
  const canSubmit = emailValid && password.length >= 6 && !submitting;

  const submit = async () => {
    clearError();
    setSubmitting(true);
    noteConsentSource(mode === 'signIn' ? 'sign-in' : 'sign-up');
    const ok =
      mode === 'signIn'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password, { storeData: false, analytics: consentAnalytics, tips: consentTips });
    setSubmitting(false);
    if (ok && mode === 'signUp') setCheckEmail(true);
    // Signing in: the account's own answer applies (asked once per account,
    // see src/sync/accountConsent.ts), so this phone syncs by itself.
    if (ok && mode === 'signIn') navigation?.goBack();
  };

  const [googleBusy, setGoogleBusy] = useState(false);
  const continueWithGoogle = async () => {
    clearError();
    setGoogleBusy(true);
    // Sync itself is decided by the account check (src/sync/accountConsent.ts).
    const consent = mode === 'signUp' ? { analytics: consentAnalytics, tips: consentTips } : {};
    noteConsentSource(mode === 'signIn' ? 'google-sign-in' : 'google-sign-up');
    const result = await signInWithGoogle(consent);
    setGoogleBusy(false);
    if (result.ok) navigation?.goBack();
    // Failures show their calm message in the error box (cancel shows nothing).
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Eyebrow>Welcome</Eyebrow>
        <OnaWordmark size={38} style={styles.title} />
        <Caption style={styles.subtitle}>
          An account keeps Ona in sync across your devices. Your first {TRIAL_DAYS} days are free, and no card is needed.
        </Caption>
      </View>

      <View style={styles.modeRow}>
        {(['signIn', 'signUp'] as Mode[]).map((m) => (
          <Pressable
            key={m}
            onPress={() => {
              setMode(m);
              clearError();
              setCheckEmail(false);
            }}
            style={[styles.modeTab, mode === m && styles.modeTabActive]}
          >
            <Body style={mode === m ? styles.modeTabTextActive : styles.modeTabText}>
              {m === 'signIn' ? 'Sign in' : 'Create account'}
            </Body>
          </Pressable>
        ))}
      </View>

      {checkEmail ? (
        <Card style={styles.card}>
          <Ionicons name="mail-outline" size={28} color={colors.teal} />
          <Body style={styles.checkEmailText}>
            Check {email.trim()} for a confirmation link, then come back and sign in.
          </Body>
          <PrimaryButton label="Back to sign in" variant="outline" onPress={() => { setMode('signIn'); setCheckEmail(false); }} />
        </Card>
      ) : (
        <Card style={styles.card}>
          <Eyebrow>Email</Eyebrow>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.inkSoft}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
          />

          <Eyebrow style={styles.fieldSpacing}>Password</Eyebrow>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={mode === 'signUp' ? 'At least 6 characters' : '••••••••'}
            placeholderTextColor={colors.inkSoft}
            style={styles.input}
            secureTextEntry
            textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
          />

          {mode === 'signUp' && (
            <View style={styles.consents}>
              <CheckRow
                label="Share anonymous usage data to improve Ona"
                detail="Only general events like installs and sign-ups. Never your feelings, habits or anything you write."
                checked={consentAnalytics}
                onChange={setConsentAnalytics}
              />
              <CheckRow label="Send me tips and updates" checked={consentTips} onChange={setConsentTips} />
            </View>
          )}

          {error && (
            <View style={styles.errorBox}>
              <Caption style={styles.errorText}>{error}</Caption>
            </View>
          )}

          <PrimaryButton
            label={submitting ? 'Please wait...' : mode === 'signIn' ? SIGN_IN_LABEL : SIGN_UP_LABEL}
            disabled={!canSubmit}
            style={styles.submitButton}
            onPress={submit}
          />
          <Caption style={styles.storageNote} testID="consent-sentence-email">{ACCOUNT_STORAGE_SENTENCE}</Caption>

          <View style={styles.orRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={styles.orLine} />
            <Caption>or</Caption>
            <View style={styles.orLine} />
          </View>
          {/* Uses the boxes ticked above: nothing is consented to just by choosing Google. */}
          <GoogleButton onPress={() => void continueWithGoogle()} busy={googleBusy} disabled={submitting} />
          {/* Google's button keeps its required wording; the consent sits right under it. */}
          <Caption style={styles.storageNote} testID="consent-sentence-google">{ACCOUNT_STORAGE_SENTENCE}</Caption>
        </Card>
      )}

      <Caption style={styles.footnote}>Your data stays private to your account. Nothing here is shared with other users.</Caption>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  header: {
    marginBottom: spacing.xl,
    gap: 6,
  },
  title: {
    marginTop: 2,
  },
  subtitle: {
    marginTop: spacing.xs,
  },
  modeRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 2,
    marginBottom: spacing.lg,
  },
  modeTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    alignItems: 'center',
  },
  modeTabActive: {
    backgroundColor: colors.teal,
  },
  modeTabText: {
    color: colors.inkSoft,
  },
  modeTabTextActive: {
    color: colors.white,
    fontFamily: fonts.bodyMedium,
  },
  card: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  input: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: spacing.sm,
  },
  fieldSpacing: {
    marginTop: spacing.sm,
  },
  errorBox: {
    backgroundColor: withAlpha('#B3413A', 0.12),
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  errorText: {
    color: '#D97A70',
  },
  storageNote: {
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  consents: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.sm,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.line,
  },
  submitButton: {
    marginTop: spacing.sm,
  },
  checkEmailText: {
    textAlign: 'center',
  },
  footnote: {
    textAlign: 'center',
  },
}));
