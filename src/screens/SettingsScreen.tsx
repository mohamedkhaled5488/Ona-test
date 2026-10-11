// Settings — opened from the gear on Home, or from a section's own "Section
// settings" link (which lands on that section's page here). Each page is its
// own stack route, so back always returns exactly one step. Changes apply
// immediately; there's no Save button.
import React, { useLayoutEffect } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { useAuthStore } from '../store/useAuthStore';
import { useEntitlement } from '../hooks/useEntitlement';
import type { RootStackParamList } from '../navigation/types';
import { Group, NavRow } from './settings/SettingsParts';
import { AccountPage, ChangeCredentialPage, planLabel } from './settings/AccountPages';
import { PlanPage } from './settings/PlanPage';
import { NotificationsPage } from './settings/NotificationsPage';
import { PrivacyPage, StoredWherePage } from './settings/PrivacyPages';
import { AppearancePage, SectionSettingsPage, SectionsPage, SoundPage, sectionSettingsTitle } from './settings/PreferencePages';
import { ArchivePage, TagsPage, TemplatesPage } from './settings/DailyPlanningPages';
import { AboutPage, DataSafetyPage, DeveloperPage, HelpPage, LicensesPage, LogsPage, SafetyPage, WhatsNewPage } from './settings/HelpAboutPages';
import { appVersion } from '../utils/diagnostics';
import { PAGE_TITLES, type SettingsPage, type SettingsParams } from './settings/pages';
import { PinPage } from './settings/SecurityPages';
import type { LockScope } from '../utils/pinLock';

type Props = NativeStackScreenProps<RootStackParamList, 'settings'>;

function RootPage({ go }: { go: (page: SettingsPage) => void }) {
  const session = useAuthStore((s) => s.session);
  const entitlement = useEntitlement();
  return (
    <>
      <Group>
        <NavRow
          icon="person-circle-outline"
          label="Account & Subscription"
          explain={session ? session.user.email ?? 'Signed in' : 'Using Ona on this device only'}
          value={planLabel(entitlement)}
          onPress={() => go('account')}
        />
        <NavRow icon="notifications-outline" label="Notifications & Reminders" explain="What can notify you, quiet hours, alarm sound" onPress={() => go('notifications')} />
        <NavRow icon="shield-checkmark-outline" label="Privacy, Security & Data" explain="Consent, export, delete" onPress={() => go('privacy')} />
        <NavRow icon="color-palette-outline" label="Appearance & Language" explain="Theme, text size, week start" onPress={() => go('appearance')} />
        <NavRow icon="musical-notes-outline" label="Sound" explain="Background playback, study and sleep defaults" onPress={() => go('sound')} />
        <NavRow icon="apps-outline" label="Sections" explain="Settings for each section" onPress={() => go('sections')} />
        <NavRow icon="help-buoy-outline" label="Help & Safety" explain="FAQ, support, safety resources" onPress={() => go('help')} />
        <NavRow icon="information-circle-outline" label="About & Legal" explain={`Version ${appVersion().version}`} onPress={() => go('about')} />
        {__DEV__ && <NavRow icon="construct-outline" label="Developer" explain="Debug builds only" onPress={() => go('developer')} />}
      </Group>
    </>
  );
}

export function SettingsScreen({ navigation, route }: Props) {
  const page: SettingsPage = route.params?.page ?? 'root';
  const section = route.params?.section;

  useLayoutEffect(() => {
    const pinTitle = route.params?.pinMode === 'turnOff' ? 'Turn off lock' : route.params?.pinMode === 'change' ? 'Change PIN' : 'Set a PIN';
    navigation.setOptions({ title: page === 'section' && section ? sectionSettingsTitle(section) : page === 'pin' ? pinTitle : PAGE_TITLES[page] });
  }, [navigation, page, section, route.params?.pinMode]);

  const go = (next: SettingsPage) => navigation.push('settings', { page: next });
  const openPin = (scope: LockScope, pinMode: NonNullable<SettingsParams['pinMode']>) => navigation.push('settings', { page: 'pin', scope, pinMode });

  const content = (() => {
    switch (page) {
      case 'root':
        return <RootPage go={go} />;
      case 'account':
        return <AccountPage go={go} openSignIn={() => navigation.navigate('signIn')} />;
      case 'plan':
        return <PlanPage />;
      case 'changeEmail':
        return <ChangeCredentialPage kind="email" onDone={() => navigation.goBack()} />;
      case 'changePassword':
        return <ChangeCredentialPage kind="password" onDone={() => navigation.goBack()} />;
      case 'notifications':
        return <NotificationsPage />;
      case 'privacy':
        return <PrivacyPage go={go} openPin={openPin} />;
      case 'storedWhere':
        return <StoredWherePage />;
      case 'appearance':
        return <AppearancePage />;
      case 'sound':
        return <SoundPage />;
      case 'sections':
        return <SectionsPage openSection={(id) => navigation.push('settings', { page: 'section', section: id })} />;
      case 'section':
        return section ? <SectionSettingsPage section={section} go={go} openPin={openPin} /> : null;
      case 'help':
        return <HelpPage go={go} openSleepHelp={() => navigation.navigate('sleep')} />;
      case 'safety':
        return <SafetyPage />;
      case 'about':
        return <AboutPage go={go} />;
      case 'whatsNew':
        return <WhatsNewPage />;
      case 'licenses':
        return <LicensesPage />;
      case 'dataSafety':
        return <DataSafetyPage />;
      case 'developer':
        return __DEV__ ? <DeveloperPage go={go} /> : null;
      case 'logs':
        return __DEV__ ? <LogsPage /> : null;
      case 'dpTags':
        return <TagsPage />;
      case 'dpTemplates':
        return <TemplatesPage />;
      case 'dpArchive':
        return <ArchivePage />;
      case 'pin':
        return route.params?.scope && route.params.pinMode ? (
          <PinPage scope={route.params.scope} mode={route.params.pinMode} onDone={() => navigation.goBack()} />
        ) : null;
    }
  })();

  return <Screen>{content}</Screen>;
}
