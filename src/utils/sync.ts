// When sync is allowed to run. Ona is offline-first: everything works on the
// device, and data only leaves it when every one of these is true.

export interface SyncGateInput {
  configured: boolean; // a Supabase project is set up for this build
  signedIn: boolean;
  syncAccess: boolean; // from useEntitlement(): lifetime, subscription (incl. grace) or trial
  consentStoreData: boolean; // "Store my feelings and habit data in my Ona account"
  paused: boolean; // Settings → Sync → Pause sync
  offline: boolean;
  // This phone's data was last synced with a different account.
  otherAccount?: boolean;
  // Signed in, and the person hasn't yet chosen what to do with the data
  // on this phone (sync/signInFlow.ts).
  choosing?: boolean;
  demo?: boolean; // Demo mode: sample data, never synced
}

export type SyncBlock = 'demo' | 'notConfigured' | 'signedOut' | 'choosing' | 'otherAccount' | 'noConsent' | 'noEntitlement' | 'paused' | 'offline';

// `uploads: false`: download only. Without a trial or subscription your own
// data still comes back to every phone you sign in on; only sending this
// phone's changes needs sync access (the server enforces the same rule).
export type SyncGate = { allowed: true; uploads?: false; message?: string } | { allowed: false; reason: SyncBlock; message: string };

export const DOWNLOAD_ONLY_MESSAGE = "Your data in your account still comes to this phone. Sending this phone's changes needs Ona Sync: see Plan & usage.";
export const canUpload = (gate: SyncGate): boolean => gate.allowed && gate.uploads !== false;

const MESSAGES: Record<SyncBlock, string> = {
  demo: 'Demo mode: sample data stays on this phone and is never synced.',
  notConfigured: "Sync isn't set up in this build.",
  signedOut: 'Using Ona on this device only.',
  choosing: 'Choose what to do with the data on this phone first.',
  otherAccount: "This phone's data belongs to a different Ona account, so it isn't synced here.",
  noConsent: "Sync is off because you haven't allowed Ona to store your data in your account.",
  noEntitlement: 'Nothing was deleted. Sync is paused.',
  paused: 'Sync is paused.',
  offline: "You're offline. Ona will sync when you're back online.",
};

function firstBlock(input: SyncGateInput): SyncBlock | null {
  if (input.demo) return 'demo';
  if (!input.configured) return 'notConfigured';
  if (!input.signedIn) return 'signedOut';
  if (input.choosing) return 'choosing';
  if (input.otherAccount) return 'otherAccount';
  if (!input.consentStoreData) return 'noConsent';
  if (input.paused) return 'paused';
  if (input.offline) return 'offline';
  return null;
}

export function syncGate(input: SyncGateInput): SyncGate {
  const block = firstBlock(input);
  if (block) return { allowed: false, reason: block, message: MESSAGES[block] };
  return input.syncAccess ? { allowed: true } : { allowed: true, uploads: false, message: DOWNLOAD_ONLY_MESSAGE };
}
