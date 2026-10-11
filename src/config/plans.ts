// The free/paid line in one file. Settings → Plan & usage reads it, and
// anything that ever enforces a cap must read it from here too.
//
// The numbers are placeholders until pricing is final — change them here and
// nowhere else. Archived items never count against a cap.

export const TRIAL_DAYS = 30;

export type CapId = 'activePlans' | 'buildHabits' | 'quitTracks' | 'skills';

export const FREE_CAPS: Record<CapId, number> = {
  activePlans: 3,
  buildHabits: 2,
  quitTracks: 1,
  skills: 2,
};

export const CAP_LABELS: Record<CapId, string> = {
  activePlans: 'Active plans',
  buildHabits: 'Active habits',
  quitTracks: 'Active Quit tracks',
  skills: 'Tracked skills',
};

// A short, honest comparison. Settings are never paywalled.
export const PLAN_COMPARISON: { feature: string; free: string; paid: string }[] = [
  { feature: 'Every section, on this device', free: 'Yes', paid: 'Yes' },
  { feature: 'Active plans', free: `Up to ${FREE_CAPS.activePlans}`, paid: 'Unlimited' },
  { feature: 'Build habits and Quit tracks', free: `${FREE_CAPS.buildHabits} and ${FREE_CAPS.quitTracks}`, paid: 'Unlimited' },
  { feature: 'Tracked skills', free: `Up to ${FREE_CAPS.skills}`, paid: 'Unlimited' },
  { feature: 'Sync across devices', free: 'No', paid: 'Yes' },
  { feature: 'Recap area pages and story', free: 'No', paid: 'Yes' },
];

// Google Play's own subscriptions page. Adding `?sku=…&package=…` deep-links
// to Ona's subscription once the app has a package name and product id.
export const PLAY_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions';
