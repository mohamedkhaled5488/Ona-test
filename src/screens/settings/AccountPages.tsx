import React, { useState } from 'react';
import { Linking, View } from 'react-native';
import { Caption, SectionHeading } from '../../components/Typography';
import { PrimaryButton } from '../../components/PrimaryButton';
import { TextInput } from '../../components/TextInput';
import { useUi } from '../../components/UiProvider';
import { useAuthStore } from '../../store/useAuthStore';
import { useAccountStore } from '../../store/useAccountStore';
import { useEntitlement, useSyncGate } from '../../hooks/useEntitlement';
import { getBillingClient } from '../../billing/billingClient';
import { usePaywallStore } from '../../store/usePaywallStore';
import { syncNow } from '../../sync/syncController';
import { useSyncStore } from '../../store/useSyncStore';
import { useBackHandler } from '../../hooks/useBackHandler';
import { isSupabaseConfigured } from '../../lib/supabase';
import { PLAY_SUBSCRIPTIONS_URL, TRIAL_DAYS } from '../../config/plans';
import type { Entitlement } from '../../utils/entitlement';
import { formatDisplayDate, formatTimeOfDay } from '../../utils/date';
import { colors, fonts, radii, spacing } from '../../theme';
import { themedStyles } from '../../theme/runtime';
import { Group, InfoRow, NavRow, Notice, ToggleRow } from './SettingsParts';
import type { SettingsPage } from './pages';
import { useDataSpace } from '../../hooks/useDataSpace';
import { DemoNotice } from '../../demo/DemoNotice';

type Go = (page: SettingsPage) => void;

// Short plan name for rows and the state card.
export function planLabel(e: Entitlement): string {
  switch (e.state) {
    case 'free':
      return 'Free';
    case 'trial':
      return `Trial, ${e.trialDaysLeft} ${e.trialDaysLeft === 1 ? 'day' : 'days'} left`;
    case 'trialEnded':
      return 'Free (trial ended)';
    case 'subscribed':
      return 'Subscribed';
    case 'canceledActive':
      return 'Canceled, still active';
    case 'grace':
      return 'Payment problem';
    case 'onHold':
      return 'On hold';
    case 'expired':
      return 'Free (subscription ended)';
    case 'lifetime':
      return 'Lifetime';
  }
}


function formatSyncedAt(iso: string | undefined): string {
  if (!iso) return 'Not yet';
  const d = new Date(iso);
  return `${formatDisplayDate(iso.slice(0, 10))}, ${formatTimeOfDay(d)}`;
}

// In Demo mode the account page explains instead: nothing here can touch the
// real account from the demo.
export function AccountPage(props: { go: Go; openSignIn: () => void }) {
  const demo = useDataSpace() === 'demo';
  if (!demo) return <RealAccountPage {...props} />;
  return (
    <>
      <DemoNotice title="You're in Demo mode" text="Your account isn't part of the demo. Signing in, syncing, signing out and deleting your account all stay with your own Ona, untouched." />
      <Group title="Plans">
        <NavRow icon="pricetag-outline" label="Plan & usage" explain="See the plans. Buying is turned off in the demo." onPress={() => props.go('plan')} />
      </Group>
    </>
  );
}

function RealAccountPage({ go, openSignIn }: { go: Go; openSignIn: () => void }) {
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const entitlement = useEntitlement();
  const gate = useSyncGate();
  const lastSyncedAt = useAccountStore((s) => s.lastSyncedAt);
  const syncPaused = useAccountStore((s) => s.syncPaused);
  const setSyncPaused = useAccountStore((s) => s.setSyncPaused);
  const { showDialog, showToast } = useUi();

  const confirmSignOut = () =>
    showDialog({
      title: 'Sign out?',
      message: 'Everything stays on this device. Sync stops until you sign in again.',
      actions: [
        { label: 'Cancel', style: 'cancel' },
        { label: 'Sign out', style: 'destructive', onPress: () => void signOut() },
      ],
    });

  // There is no sync engine in this build yet, so "Sync now" says so plainly
  // instead of pretending.
  const openPaywall = usePaywallStore((s) => s.open);
  const syncing = useSyncStore((s) => s.status === 'syncing');
  const syncError = useSyncStore((s) => s.lastError);
  const syncNowPressed = () => {
    if (!gate.allowed) {
      showToast({ message: gate.message });
      return;
    }
    void syncNow().then((r) => {
      if (!r.ok) return showToast({ message: r.message });
      // Without sync access your data still comes down; sending is the paid
      // part, so this is when the plans appear (unless closed in the last week).
      if (r.downloadOnly) {
        showToast({ message: r.pulled ? `${r.pulled} received from your account.` : 'This phone has everything from your account.' });
        openPaywall('paidAction');
        return;
      }
      showToast({ message: r.pulled + r.pushed === 0 ? 'Everything is up to date.' : `Synced. ${r.pushed} sent, ${r.pulled} received.` });
    });
  };

  if (!session) {
    return (
      <>
        <Group>
          <View style={styles.hero}>
            <SectionHeading>Using Ona on this device only</SectionHeading>
            <Caption>
              Everything works without an account. Create one to sync across devices. Your first {TRIAL_DAYS} days are free, and no card is
              needed.
            </Caption>
            {isSupabaseConfigured ? (
              <PrimaryButton label="Create account to sync" onPress={openSignIn} style={styles.heroButton} />
            ) : (
              <Notice>
                <Caption>Accounts aren't set up in this build yet.</Caption>
              </Notice>
            )}
          </View>
        </Group>
        <Group title="Plan">
          <NavRow icon="ribbon-outline" label="Plan & usage" explain="What's included, and how much of the free plan you use" value={planLabel(entitlement)} onPress={() => go('plan')} />
        </Group>
      </>
    );
  }

  return (
    <>
      <Group title="Account">
        <InfoRow label="Email" value={session.user.email ?? ''} />
        <NavRow icon="mail-outline" label="Change email" onPress={() => go('changeEmail')} />
        <NavRow icon="key-outline" label="Change password" onPress={() => go('changePassword')} />
        <NavRow icon="log-out-outline" label="Sign out" explain="Keeps everything on this device" onPress={confirmSignOut} />
      </Group>

      <Group title="Plan">
        <NavRow icon="ribbon-outline" label="Plan & usage" explain="What's included, and how much of the free plan you use" value={planLabel(entitlement)} onPress={() => go('plan')} />
        <NavRow icon="card-outline" label="Manage subscription" explain="Opens Google Play's subscriptions page" external onPress={() => void Linking.openURL(PLAY_SUBSCRIPTIONS_URL)} />
        <NavRow
          icon="refresh-outline"
          label="Restore purchases"
          explain="If you subscribed on another device"
          onPress={() =>
            void getBillingClient()
              .restore()
              .then((r) =>
                showToast({ message: r.kind === 'restored' ? 'Purchases restored.' : r.kind === 'nothingToRestore' ? 'No purchases to restore on this Google account.' : r.message })
              )
          }
        />
      </Group>

      <Group title="Sync" footer={gate.message}>
        <InfoRow label="Last synced" value={formatSyncedAt(lastSyncedAt)} />
        <NavRow icon="sync-outline" label={syncing ? 'Syncing…' : 'Sync now'} explain={syncError ?? undefined} onPress={syncNowPressed} />
        <ToggleRow label="Pause sync" explain="Keep using Ona normally. Nothing leaves this device while paused." value={syncPaused} onChange={setSyncPaused} />
      </Group>

      <Group title="Delete">
        <NavRow icon="trash-outline" label="Delete my account" explain="In Privacy, Security & Data" onPress={() => go('privacy')} danger />
      </Group>
    </>
  );
}

export function ChangeCredentialPage(props: { kind: 'email' | 'password'; onDone: () => void }) {
  if (useDataSpace() === 'demo') return <DemoNotice title="You're in Demo mode" text="Your account isn't part of the demo. Signing in, syncing, signing out and deleting your account all stay with your own Ona, untouched." />;
  return <RealChangeCredentialPage {...props} />;
}

function RealChangeCredentialPage({ kind, onDone }: { kind: 'email' | 'password'; onDone: () => void }) {
  const updateEmail = useAuthStore((s) => s.updateEmail);
  const updatePassword = useAuthStore((s) => s.updatePassword);
  const { showToast } = useUi();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = kind === 'email' ? /\S+@\S+\.\S+/.test(value.trim()) : value.length >= 6;

  const save = async () => {
    setBusy(true);
    const result = kind === 'email' ? await updateEmail(value.trim()) : await updatePassword(value);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    setValue('');
    showToast({ message: kind === 'email' ? 'Check both inboxes to confirm the change.' : 'Password changed.' });
    // After the cleared field has rendered, so leaving doesn't ask to save.
    setTimeout(onDone, 0);
    return true;
  };

  useBackHandler({ dirty: value.length > 0, onSave: () => void (valid ? save() : undefined) });

  return (
    <Group>
      <View style={styles.form}>
        <Caption>{kind === 'email' ? "We'll send a confirmation link to the new address." : 'At least 6 characters.'}</Caption>
        <TextInput
          value={value}
          onChangeText={(t) => {
            setValue(t);
            setError(null);
          }}
          placeholder={kind === 'email' ? 'new@example.com' : 'New password'}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={kind === 'email' ? 'email-address' : 'default'}
          secureTextEntry={kind === 'password'}
          textContentType={kind === 'email' ? 'emailAddress' : 'newPassword'}
          accessibilityLabel={kind === 'email' ? 'New email' : 'New password'}
        />
        {error ? <Caption style={styles.error}>{error}</Caption> : null}
        <PrimaryButton label={busy ? 'Saving...' : 'Save'} disabled={!valid || busy} onPress={() => void save()} />
      </View>
    </Group>
  );
}

const styles = themedStyles(() => ({
  hero: { gap: spacing.sm, paddingVertical: spacing.sm },
  heroButton: { marginTop: spacing.sm },
  usageRow: { paddingVertical: spacing.sm, gap: 6 },
  usageText: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  track: { height: 6, borderRadius: radii.full, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radii.full },
  compareHead: { flexDirection: 'row', paddingVertical: spacing.xs },
  compareRow: { flexDirection: 'row', paddingVertical: spacing.xs + 2, borderTopWidth: 1, borderTopColor: colors.line },
  compareFeature: { flex: 2 },
  compareCol: { flex: 1, textAlign: 'center' },
  ink: { color: colors.ink },
  form: { gap: spacing.md, paddingVertical: spacing.sm },
  input: { borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: spacing.sm, fontFamily: fonts.body },
  error: { color: '#D97A70' },
}));
