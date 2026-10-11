import type { SectionId } from '../../types/sections';
import type { LockScope } from '../../utils/pinLock';

export type SettingsPage =
  | 'root'
  | 'account'
  | 'plan'
  | 'changeEmail'
  | 'changePassword'
  | 'notifications'
  | 'privacy'
  | 'storedWhere'
  | 'appearance'
  | 'sound'
  | 'sections'
  | 'section'
  | 'help'
  | 'safety'
  | 'about'
  | 'licenses'
  | 'whatsNew'
  | 'dataSafety'
  | 'developer'
  | 'logs'
  | 'pin'
  | 'dpTags'
  | 'dpTemplates'
  | 'dpArchive';

export interface SettingsParams {
  page?: SettingsPage;
  section?: SettingsSectionId;
  // page 'pin': which lock, and what to do with its PIN.
  scope?: LockScope;
  pinMode?: 'turnOn' | 'change' | 'turnOff';
}

// Sections that have their own settings page.
export type SettingsSectionId = Extract<SectionId, 'dailyPlanning' | 'journaling' | 'studySession' | 'sleep' | 'book' | 'moodCheck' | 'quitHabit' | 'budget' | 'recap'>;

export const SETTINGS_SECTIONS: SettingsSectionId[] = ['dailyPlanning', 'journaling', 'moodCheck', 'quitHabit', 'studySession', 'sleep', 'book', 'budget', 'recap'];

export const PAGE_TITLES: Record<SettingsPage, string> = {
  root: 'Settings',
  account: 'Account & Subscription',
  plan: 'Plan & usage',
  changeEmail: 'Change email',
  changePassword: 'Change password',
  notifications: 'Notifications & Reminders',
  privacy: 'Privacy, Security & Data',
  storedWhere: "What's stored where",
  appearance: 'Appearance & Language',
  sound: 'Sound',
  sections: 'Sections',
  section: 'Section settings',
  help: 'Help & Safety',
  safety: 'Safety & support',
  about: 'About & Legal',
  licenses: 'Open-source licenses',
  whatsNew: "What's new",
  dataSafety: 'Data safety',
  developer: 'Developer',
  logs: 'Logs',
  pin: 'PIN',
  dpTags: 'Tags',
  dpTemplates: 'Task templates',
  dpArchive: 'Let go',
};
