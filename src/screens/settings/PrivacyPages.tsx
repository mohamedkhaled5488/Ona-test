import React, { useState } from 'react';
import { Linking, View } from 'react-native';
import { Body, Caption, SectionHeading } from '../../components/Typography';
import { useUi } from '../../components/UiProvider';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useAuthStore } from '../../store/useAuthStore';
import { isSupabaseConfigured } from '../../lib/supabase';
import { LEGAL } from '../../config/about';
import { exportAllData } from '../../utils/exportFile';
import { useEntitlement } from '../../hooks/useEntitlement';
import { useTurnOffSync } from '../../hooks/useTurnOffSync';
import { deleteAccountSubscriptionWarning } from '../../billing/planState';
import { PLAY_SUBSCRIPTIONS_URL } from '../../config/plans';
import { wipeLocalData } from '../../utils/localData';
import { useSyncStore } from '../../store/useSyncStore';
import { spacing } from '../../theme';
import { themedStyles } from '../../theme/runtime';
import { Group, NavRow, ToggleRow } from './SettingsParts';
import type { SettingsPage, SettingsParams } from './pages';
import { SecurityGroup } from './SecurityPages';
import { ParkedCopiesGroup } from './ParkedCopiesGroup';
import type { LockScope } from '../../utils/pinLock';

export function PrivacyPage({
  go,
  openPin,
}: {
  go: (page: SettingsPage) => void;
  openPin: (scope: LockScope, mode: NonNullable<SettingsParams['pinMode']>) => void;
}) {
  const consent = useSettingsStore((s) => s.consent);
  const setConsent = useSettingsStore((s) => s.setConsent);
  const session = useAuthStore((s) => s.session);
  const withdraw = useAuthStore((s) => s.withdrawStoreDataConsent);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const entitlement = useEntitlement();
  const { showDialog, showToast } = useUi();
  const [busy, setBusy] = useState(false);

  const turnOffSync = useTurnOffSync();
  const changeStoreData = (on: boolean) => {
    if (on) setConsent({ storeData: true });
    else turnOffSync();
  };


  const exportData = () => {
    const run = async (includePhotos: boolean) => {
      setBusy(true);
      const result = await exportAllData(includePhotos);
      setBusy(false);
      showToast({ message: result.message });
    };
    showDialog({
      title: 'Export my data',
      message: 'Everything from every section, as one JSON file. Photos make the file bigger.',
      actions: [
        { label: 'Cancel', style: 'cancel' },
        { label: 'Without photos', style: 'default', onPress: () => void run(false) },
        { label: 'With photos', style: 'default', onPress: () => void run(true) },
      ],
    });
  };

  const deleteDeviceData = () =>
    showDialog({
      title: 'Delete all data on this device?',
      message: session
        ? "This clears every section on this phone. It can't be undone. Your account and anything already in it are not touched, and your settings stay."
        : "This clears every section on this phone. It can't be undone, and there's no copy in an account. Your settings stay.",
      actions: [
        { label: 'Cancel', style: 'cancel' },
        {
          label: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Forget what was synced, so the next sync downloads the account's
            // copy again instead of deleting it from the server.
            void wipeLocalData().then(() => {
              useSyncStore.getState().reset();
              showToast({ message: 'Data on this device was deleted.' });
            });
          },
        },
      ],
    });

  const confirmDeleteAccount = () => {
    const run = async (keepLocal: boolean) => {
      setBusy(true);
      const result = await deleteAccount(keepLocal);
      setBusy(false);
      showToast({ message: result.ok ? (keepLocal ? 'Your account was deleted. This device kept its copy.' : 'Your account and the data on this device were deleted.') : result.message });
    };
    const subscriptionWarning = deleteAccountSubscriptionWarning(entitlement);
    const ask = () =>
      showDialog({
      title: 'Delete your account?',
      message:
        "This permanently deletes your account and everything stored in it. It can't be undone. Do you want to keep a copy on this device?",
      actions: [
        { label: 'Cancel', style: 'cancel' },
        { label: 'Delete, keep this device copy', style: 'destructive', onPress: () => void run(true) },
        { label: 'Delete everything', style: 'destructive', onPress: () => void run(false) },
      ],
    });
    // A store subscription isn't canceled by deleting the account: say so first.
    if (!subscriptionWarning) return ask();
    showDialog({
      title: 'You still have a subscription',
      message: subscriptionWarning,
      actions: [
        { label: 'Cancel', style: 'cancel' },
        { label: 'Open Google Play', style: 'default', onPress: () => void Linking.openURL(PLAY_SUBSCRIPTIONS_URL) },
        { label: 'Continue', style: 'destructive', onPress: ask },
      ],
    });
  };

  return (
    <>
      <Group title="Your consent" footer="Three separate choices. Change any of them at any time.">
        <ToggleRow
          label="Store my feelings and habit data in my Ona account"
          explain="Needed for sync. Off means nothing about your feelings, journal, habits or Quit tracking is stored in your account."
          value={consent.storeData}
          onChange={changeStoreData}
        />
        <ToggleRow
          label="Share anonymous usage data to improve Ona"
          explain="Only general events like an install or sign-up. Never what you write or track."
          value={consent.analytics}
          onChange={(on) => setConsent({ analytics: on })}
        />
        <ToggleRow label="Send me tips and updates" explain="Occasional emails. Never notifications." value={consent.tips} onChange={(on) => setConsent({ tips: on })} />
      </Group>

      <SecurityGroup openPin={openPin} />

      <Group title="Your data">
        <NavRow icon="help-circle-outline" label="What's stored where" explain="On this device, or in your account" onPress={() => go('storedWhere')} />
        <NavRow
          icon="download-outline"
          label={busy ? 'Working...' : 'Export my data'}
          explain="Everything as a JSON file. Each section also has its own PDF or text export."
          onPress={exportData}
        />
        <NavRow icon="phone-portrait-outline" label="Delete data on this device" explain="Your account isn't affected" onPress={deleteDeviceData} danger />
      </Group>

      <ParkedCopiesGroup />

      <Group title="Account" footer={LEGAL.accountDeletionUrl ? undefined : 'A web page for deletion requests will be linked here before launch.'}>
        {session ? (
          <NavRow icon="trash-outline" label="Delete my account and server data" explain="Asks whether to keep this device's copy" onPress={confirmDeleteAccount} danger />
        ) : (
          <Caption style={styles.pad}>{isSupabaseConfigured ? "You're not signed in, so there's no account to delete." : "Accounts aren't set up in this build."}</Caption>
        )}
        {LEGAL.accountDeletionUrl && (
          <NavRow label="Request deletion on the web" external onPress={() => void Linking.openURL(LEGAL.accountDeletionUrl!)} />
        )}
      </Group>
    </>
  );
}

export function StoredWherePage() {
  const rows = [
    {
      title: 'On this device',
      body: 'Everything you add in every section: tasks, plans, journal entries, feelings, habits, Quit tracking, sleep, books, budgets and more. It stays here whether or not you have an account, and signing out never deletes it.',
    },
    {
      title: 'In your Ona account',
      body: 'Only if you create an account and allow "Store my feelings and habit data in my Ona account". Then a copy is kept in your account so it can sync between your devices. Turn that off and syncing stops. You can delete the copy at any time.',
    },
    {
      title: 'Settings',
      body: 'Your settings are kept on this device. They never need an account.',
    },
    {
      title: 'Never',
      body: 'Your feelings, tags, journal, habits and Quit tracking are never sent to analytics or any ad platform.',
    },
  ];
  return (
    <Group>
      <View style={styles.list}>
        {rows.map((r) => (
          <View key={r.title} style={styles.item}>
            <SectionHeading>{r.title}</SectionHeading>
            <Body>{r.body}</Body>
          </View>
        ))}
      </View>
    </Group>
  );
}

const styles = themedStyles(() => ({
  pad: { paddingVertical: spacing.sm },
  list: { gap: spacing.lg, paddingVertical: spacing.sm },
  item: { gap: spacing.xs },
}));
