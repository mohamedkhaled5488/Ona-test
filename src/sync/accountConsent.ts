// "Your data is kept in your account", kept with the account
// (supabase/migrations/0007 and 0008). Signing in or creating an account
// with the sentence shown (src/config/consentWording.ts) turns it on and
// records when, which wording and on which screen. An account that said
// "off" stays off on every phone, also after a reinstall. Accounts that
// signed in before the sentence existed see it once (ConsentNotice).
import { AppState } from 'react-native';
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { isDemo, isSwitchingDataSpace } from '../utils/dataSpace';
import { CONSENT_WORDING_VERSION, type ConsentSource } from '../config/consentWording';

export interface AccountConsentRecord {
  on: boolean | null; // null: never answered
  version: string | null; // the wording they saw
  source: string | null; // where they saw it
}

export interface ConsentServer {
  load: (userId: string) => Promise<AccountConsentRecord>;
  save: (userId: string, on: boolean, source: ConsentSource) => Promise<void>;
}

// The server's profiles table doesn't have the consent columns yet: the
// 0007/0008 migrations weren't applied.
export class ServerNeedsUpdateError extends Error {}
export const SERVER_NEEDS_UPDATE =
  "Sync can't be set up: Ona's server is missing an update (consent columns, migrations 0007 and 0008). Nothing was sent or changed.";

const looksLikeMissingColumn = (message: string) => /column .* does not exist|could not find the .* column|42703|PGRST204/i.test(message);

export const supabaseConsentServer: ConsentServer = {
  load: async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('store_data_consent, store_data_consent_version, store_data_consent_source')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw looksLikeMissingColumn(`${error.message} ${(error as { code?: string }).code ?? ''}`) ? new ServerNeedsUpdateError(error.message) : new Error(error.message);
    const row = data as { store_data_consent: boolean | null; store_data_consent_version: string | null; store_data_consent_source: string | null } | null;
    return { on: row?.store_data_consent ?? null, version: row?.store_data_consent_version ?? null, source: row?.store_data_consent_source ?? null };
  },
  save: async (userId, on, source) => {
    const { error } = await supabase
      .from('profiles')
      .update({ store_data_consent: on, store_data_consent_at: new Date().toISOString(), store_data_consent_version: CONSENT_WORDING_VERSION, store_data_consent_source: source } as never)
      .eq('id', userId);
    if (error) throw looksLikeMissingColumn(`${error.message} ${(error as { code?: string }).code ?? ''}`) ? new ServerNeedsUpdateError(error.message) : new Error(error.message);
  },
};

export type ConsentPlan =
  | { kind: 'on'; record?: ConsentSource } // sync on; record the answer with this source
  | { kind: 'off' }
  | { kind: 'notice' }; // show the sentence once, then record

// What to do when a session starts on this phone. `source`: the sign-in or
// sign-up screen the person just used (null when Ona starts already signed in).
export function reconcileConsent(account: AccountConsentRecord, source: ConsentSource | null): ConsentPlan {
  if (account.on === false) return { kind: 'off' };
  const sawCurrentWording = account.on === true && account.version !== null;
  if (source) return sawCurrentWording ? { kind: 'on' } : { kind: 'on', record: source };
  // Already signed in when this version arrived: if they never saw the
  // sentence, show it once.
  return sawCurrentWording ? { kind: 'on' } : { kind: 'notice' };
}

interface ConsentStatus {
  problem: string | null; // shown in Settings → Account → Sync
  notice: string | null; // the user to show the one-time notice to
  setProblem: (problem: string | null) => void;
  showNotice: (userId: string | null) => void;
}
export const useConsentStatusStore = create<ConsentStatus>((set) => ({
  problem: null,
  notice: null,
  setProblem: (problem) => set({ problem }),
  showNotice: (notice) => set({ notice }),
}));

let applying = false; // the account's answer is being applied: don't send it back
let server: ConsentServer = supabaseConsentServer;
let pendingSource: ConsentSource | null = null;
let retryFor: string | null = null; // couldn't reach the server: try again on return

// The sign-in or sign-up screen calls this just before signing in, so the
// answer is recorded with the screen and wording the person saw.
export function noteConsentSource(source: ConsentSource): void {
  pendingSource = source;
}

function setLocal(on: boolean) {
  if (useSettingsStore.getState().consent.storeData === on) return;
  applying = true;
  try {
    useSettingsStore.getState().setConsent({ storeData: on });
  } finally {
    applying = false;
  }
}

async function save(userId: string, on: boolean, source: ConsentSource) {
  try {
    await server.save(userId, on, source);
  } catch (e) {
    if (e instanceof ServerNeedsUpdateError) useConsentStatusStore.getState().setProblem(SERVER_NEEDS_UPDATE);
  }
}

async function check(userId: string, source: ConsentSource | null): Promise<void> {
  if (isDemo()) return;
  let account: AccountConsentRecord;
  try {
    account = await server.load(userId);
  } catch (e) {
    // Unreadable: nothing changes (never "on" by default without an answer).
    if (e instanceof ServerNeedsUpdateError) useConsentStatusStore.getState().setProblem(SERVER_NEEDS_UPDATE);
    else {
      retryFor = userId;
      pendingSource = source; // kept for the retry
    }
    return;
  }
  retryFor = null;
  useConsentStatusStore.getState().setProblem(null);
  if (useAuthStore.getState().session?.user.id !== userId) return; // signed out meanwhile
  const plan = reconcileConsent(account, source);
  if (plan.kind === 'off') return setLocal(false);
  if (plan.kind === 'notice') return useConsentStatusStore.getState().showNotice(userId);
  setLocal(true);
  if (plan.record) await save(userId, true, plan.record);
}

// The one-time notice's answer ("OK" or, after the keep/delete question,
// "Turn off").
export async function acknowledgeConsentNotice(on: boolean): Promise<void> {
  const userId = useConsentStatusStore.getState().notice;
  useConsentStatusStore.getState().showNotice(null);
  if (!userId) return;
  setLocal(on);
  await save(userId, on, 'notice');
}

// Call once at startup (with sync). Returns a stop function.
export function startAccountConsent(consentServer: ConsentServer = supabaseConsentServer): () => void {
  server = consentServer;
  pendingSource = null;
  retryFor = null;
  const signedInAs = useAuthStore.getState().session?.user.id;
  if (signedInAs) void check(signedInAs, null);
  const unsubAuth = useAuthStore.subscribe((s, p) => {
    const id = s.session?.user.id;
    if (!id) {
      useConsentStatusStore.getState().showNotice(null);
      return;
    }
    if (id === p.session?.user.id) return;
    // While Ona starts, the saved session is restored (initializing): that's
    // not a sign-in, so there's no screen to record.
    const source = p.initializing ? null : pendingSource;
    pendingSource = null;
    void check(id, source);
  });
  // Turning it off or on in Settings → Privacy is saved to the account, so
  // every phone follows. Never while the demo or a switch between spaces
  // loads its own settings.
  const unsubSettings = useSettingsStore.subscribe((s, p) => {
    if (s.consent.storeData === p.consent.storeData || applying || isDemo() || isSwitchingDataSpace()) return;
    const userId = useAuthStore.getState().session?.user.id;
    if (userId) void save(userId, s.consent.storeData, 'settings');
  });
  // Couldn't reach the server: try again when Ona comes back.
  const app = AppState.addEventListener('change', (state) => {
    const id = useAuthStore.getState().session?.user.id;
    if (state === 'active' && retryFor && id === retryFor) {
      const source = pendingSource;
      pendingSource = null;
      void check(id, source);
    }
  });
  return () => {
    unsubAuth();
    unsubSettings();
    app.remove();
  };
}
