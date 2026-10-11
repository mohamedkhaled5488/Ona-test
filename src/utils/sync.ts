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
  demo?: boolean; // Demo mode: sample data, never synced
}

export type SyncBlock = 'demo' | 'notConfigured' | 'signedOut' | 'otherAccount' | 'noConsent' | 'noEntitlement' | 'paused' | 'offline';

export type SyncGate = { allowed: true } | { allowed: false; reason: SyncBlock; message: string };

const MESSAGES: Record<SyncBlock, string> = {
  demo: 'Demo mode: sample data stays on this phone and is never synced.',
  notConfigured: "Sync isn't set up in this build.",
  signedOut: 'Using Ona on this device only.',
  otherAccount:
    "This phone's data belongs to a different Ona account, so it isn't synced here. To use this account, delete the data on this device first (Privacy, Security & Data).",
  noConsent: "Sync is off because you haven't allowed Ona to store your data in your account.",
  noEntitlement: 'Nothing was deleted. Sync is paused.',
  paused: 'Sync is paused.',
  offline: "You're offline. Ona will sync when you're back online.",
};

function firstBlock(input: SyncGateInput): SyncBlock | null {
  if (input.demo) return 'demo';
  if (!input.configured) return 'notConfigured';
  if (!input.signedIn) return 'signedOut';
  if (input.otherAccount) return 'otherAccount';
  if (!input.consentStoreData) return 'noConsent';
  if (!input.syncAccess) return 'noEntitlement';
  if (input.paused) return 'paused';
  if (input.offline) return 'offline';
  return null;
}

export function syncGate(input: SyncGateInput): SyncGate {
  const block = firstBlock(input);
  return block ? { allowed: false, reason: block, message: MESSAGES[block] } : { allowed: true };
}
