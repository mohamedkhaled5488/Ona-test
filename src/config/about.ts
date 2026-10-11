// Everything Settings → Help & Safety and About & Legal links to, in one place.
// URLs and the support address are null until they exist. The screens show
// "Coming before launch" instead of a dead link.

export const LEGAL = {
  privacyPolicyUrl: null as string | null,
  termsUrl: null as string | null,
  // The public web page for account-deletion requests (also linked from the
  // Play Store listing).
  accountDeletionUrl: null as string | null,
  supportEmail: null as string | null,
  helpCenterUrl: null as string | null,
  // Opens the Play Store listing for "Rate Ona". Needs the final package name.
  playStoreUrl: null as string | null,
};

export const WHATS_NEW: { version: string; items: string[] }[] = [
  {
    version: '1.0.0',
    items: [
      'Settings in one place, under the gear on Home',
      'Light and dark themes, accent colors and larger text',
      'Quiet hours and per-feature notification switches',
      'Export everything as a file, or delete it from this device',
    ],
  },
];

export const CREDITS: string[] = [
  'Fonts: Space Grotesk, Inter, Caveat and Patrick Hand (SIL Open Font License)',
  'Icons: Ionicons via @expo/vector-icons',
  'Ambient and alarm sounds: generated for Ona',
];

// Direct dependencies and their licenses (from each package's own package.json).
export const LICENSES: { name: string; license: string }[] = [
  { name: '@expo-google-fonts (Caveat, Inter, Patrick Hand, Space Grotesk)', license: 'MIT and OFL-1.1' },
  { name: '@expo/vector-icons', license: 'MIT' },
  { name: '@react-native-async-storage/async-storage', license: 'MIT' },
  { name: '@react-navigation (native, native-stack, bottom-tabs)', license: 'MIT' },
  { name: '@shopify/react-native-skia', license: 'MIT' },
  { name: '@supabase/supabase-js', license: 'MIT' },
  { name: 'Expo SDK (expo and expo-* modules)', license: 'MIT' },
  { name: 'immer', license: 'MIT' },
  { name: 'React, React DOM', license: 'MIT' },
  { name: 'React Native', license: 'MIT' },
  { name: 'react-native-gesture-handler', license: 'MIT' },
  { name: 'react-native-keyboard-controller', license: 'MIT' },
  { name: 'react-native-reanimated, react-native-worklets', license: 'MIT' },
  { name: 'react-native-safe-area-context', license: 'MIT' },
  { name: 'react-native-screens', license: 'MIT' },
  { name: 'react-native-svg', license: 'MIT' },
  { name: 'react-native-url-polyfill', license: 'MIT' },
  { name: 'react-native-view-shot', license: 'MIT' },
  { name: 'react-native-web', license: 'MIT' },
  { name: 'victory-native', license: 'MIT' },
  { name: 'zustand', license: 'MIT' },
];

// Plain-language summary matching what the app actually does. Keep in sync
// with the Google Play Data safety form.
export const DATA_SAFETY: { title: string; body: string }[] = [
  {
    title: 'On your device',
    body: 'Everything you add to Ona is kept on this phone. You can use every section without an account.',
  },
  {
    title: 'In your account (only if you sync)',
    body: 'If you create an account and allow it, your data is stored in your Ona account so it can sync. You can pause sync, withdraw that permission, or delete the copy in your account at any time.',
  },
  {
    title: 'Never shared or sold',
    body: "Ona doesn't sell your data or share it with advertisers. Your feelings, journal, habits and Quit tracking are never sent to analytics.",
  },
  {
    title: 'Usage data (optional)',
    body: 'Only if you turn it on: a few general events like an install or a sign-up, with nothing about what you write or track.',
  },
  {
    title: 'Demo mode',
    body: 'Demo mode shows sample content, made up and stored on this phone only, apart from your own data. Nothing in the demo is synced, uploaded, scheduled or sent to analytics.',
  },
  {
    title: 'Deleting',
    body: 'You can delete your account and everything stored in it from Settings, and choose whether this phone keeps its own copy.',
  },
];

// Safety and support resources by region. Each entry must be checked against
// the service's own site before launch; `verifiedOn` stays null until then,
// and debug builds flag unverified entries.
export interface SafetyResource {
  name: string;
  contact: string;
  detail: string;
  url?: string;
  verifiedOn: string | null;
}

export const SAFETY_RESOURCES: Record<string, SafetyResource[]> = {
  US: [{ name: '988 Suicide & Crisis Lifeline', contact: 'Call or text 988', detail: 'Free and confidential, 24/7.', url: 'https://988lifeline.org', verifiedOn: null }],
  GB: [{ name: 'Samaritans', contact: 'Call 116 123', detail: 'Free, 24/7, any time of day or night.', url: 'https://www.samaritans.org', verifiedOn: null }],
  IE: [{ name: 'Samaritans', contact: 'Call 116 123', detail: 'Free, 24/7, any time of day or night.', url: 'https://www.samaritans.org', verifiedOn: null }],
};

// Shown for every region, including ones with no entry above.
export const SAFETY_FALLBACK: SafetyResource[] = [
  { name: 'Emergency services', contact: 'Call your local emergency number', detail: "If you or someone else is in danger right now.", verifiedOn: null },
  { name: 'Find A Helpline', contact: 'findahelpline.com', detail: 'Free, confidential helplines in many countries.', url: 'https://findahelpline.com', verifiedOn: null },
];

export function deviceRegion(): string | undefined {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const region = new (Intl as any).Locale(locale).region as string | undefined;
    return region ?? locale.split('-')[1]?.toUpperCase();
  } catch {
    return undefined;
  }
}
