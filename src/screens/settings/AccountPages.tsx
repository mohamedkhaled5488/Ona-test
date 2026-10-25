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
import { syncNow, unsentChanges } from '../../sync/syncController';
import { SIGN_OUT_COPY, signOutAndChoose, signOutCopy, signOutFacts, useAccountChoiceStore } from '../../sync/signInFlow';
import { canUpload } from '../../utils/sync';
import { useBackupStatus } from '../../sync/backupStatus';
import { useConsentStatusStore } from '../../sync/accountConsent';
import { useSyncStore } from '../../store/useSyncStore';
import { useBackHandler } from '../../hooks/useBackHandler';
import { isSupabaseConfigured } from '../../lib/supabase';
import { ESSENTIALS_NAME, PLAY_SUBSCRIPTIONS_URL, PLUS_NAME, TRIAL_DAYS, TRIAL_NAME } from '../../config/plans';
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
    case 'trial':
      return `${TRIAL_NAME}, ${e.trialDaysLeft} ${e.trialDaysLeft === 1 ? 'day' : 'days'} left`;
    case 'subscribed':
    case 'canceledActive':
    case 'grace':
    case 'lifetime':
      return PLUS_NAME;
    case 'free':
    case 'trialEnded':
    case 'onHold':
    case 'expired':
      return ESSENTIALS_NAME;
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
  const entitlement = useEntitlement();
  const gate = useSyncGate();
  const lastSyncedAt = useAccountStore((s) => s.lastSyncedAt);
  const syncPaused = useAccountStore((s) => s.syncPaused);
  const setSyncPaused = useAccountStore((s) => s.setSyncPaused);
  const { showDialog, showToast } = useUi();
  const choicePending = useAccountChoiceStore((s) => !!s.pending);
  const backup = useBackupStatus();

  // Design 3.4: unsent changes first, then keep or remove this phone's copy.
  const confirmSignOut = () => {
    const unsent = unsentChanges();
    const chooseKeepOrRemove = async () => {
      const left = unsentChanges();
      const facts = await signOutFacts(left, gate.allowed && useSyncStore.getState().owner === session?.user.id);
      const copy = signOutCopy(facts);
      showDialog({
        title: copy.title,
        message: copy.message,
        actions: [
          { label: 'Cancel', style: 'cancel' },
          ...(facts.canRemove ? [{ label: copy.remove, style: 'destructive' as const, onPress: () => void signOutAndChoose(false).then(() => showToast({ message: copy.removedToast })) }] : []),
          { label: copy.keep, style: 'default', onPress: () => void signOutAndChoose(true) },
        ],
      });
    };
    if (unsent > 0 && canUpload(gate)) {
      showDialog({
        title: SIGN_OUT_COPY.unsentTitle(unsent),
        message: SIGN_OUT_COPY.unsentMessage,
        actions: [
          { label: 'Cancel', style: 'cancel' },
          { label: SIGN_OUT_COPY.signOutAnyway, style: 'default', onPress: () => void chooseKeepOrRemove() },
          { label: SIGN_OUT_COPY.syncFirst, style: 'default', onPress: () => void syncNow().then((r) => (r.ok ? chooseKeepOrRemove() : showToast({ message: r.message }))) },
        ],
      });
      return;
    }
    void chooseKeepOrRemove();
  };

  // There is no sync engine in this build yet, so "Sync now" says so plainly
  // instead of pretending.
  const openPaywall = usePaywallStore((s) => s.open);
  const syncing = useSyncStore((s) => s.status === 'syncing');
  const syncError = useSyncStore((s) => s.lastError);
  // E.g. the server is missing the consent columns: said plainly, never silent.
  const consentProblem = useConsentStatusStore((s) => s.problem);
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
          <NavRow icon="ribbon-outline" label="Plan & usage" explain="What's included in each mode, and what you use" value={planLabel(entitlement)} onPress={() => go('plan')} />
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
        <NavRow icon="log-out-outline" label="Sign out" explain="You choose whether this phone keeps your data" onPress={confirmSignOut} />
      </Group>

      <Group title="Plan">
        <NavRow icon="ribbon-outline" label="Plan & usage" explain="What's included in each mode, and what you use" value={planLabel(entitlement)} onPress={() => go('plan')} />
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

      {choicePending && (
        <Group title="Data on this phone">
          <NavRow icon="git-merge-outline" label="Waiting for your choice" explain="Choose what to do with the data on this phone. Nothing syncs until you do." onPress={() => useAccountChoiceStore.setState({ hidden: false })} />
        </Group>
      )}

      <Group title="Sync" footer={consentProblem ?? gate.message}>
        <InfoRow label={backup.title} explain={backup.line} value={lastSyncedAt ? formatSyncedAt(lastSyncedAt) : undefined} />
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
    let result: { ok: boolean; message?: string };
    try {
      result = kind === 'email' ? await updateEmail(value.trim()) : await updatePassword(value);
    } catch (e) {
      result = { ok: false, message: e instanceof Error ? e.message : String(e) };
    } finally {
      setBusy(false); // never left disabled, whatever happened
    }
    if (!result.ok) {
      setError(result.message ?? "Couldn't save. Try again.");
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
