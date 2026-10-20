// "Store my feelings and habit data in my Ona account", kept with the account
// (supabase/migrations/0007_store_data_consent.sql) so it's answered once:
// every phone you sign in on then syncs and brings your data back by itself,
// and turning it off on one phone turns it off everywhere. If the account
// has never answered, Ona asks right after sign-in (SyncConsentPrompt).
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { isDemo, isSwitchingDataSpace } from '../utils/dataSpace';

export type AccountConsent = boolean | null; // null: never answered

export interface ConsentServer {
  load: (userId: string) => Promise<AccountConsent>;
  save: (userId: string, on: boolean) => Promise<void>;
}

// What to do when a session starts on this phone.
export function reconcileConsent(account: AccountConsent, local: boolean): { local: boolean; saveToAccount: boolean; ask: boolean } {
  if (account !== null) return { local: account, saveToAccount: false, ask: false };
  // Never answered for the account: a yes given on this phone (the sign-up
  // box, or an earlier version of Ona) becomes the account's answer.
  return local ? { local: true, saveToAccount: true, ask: false } : { local: false, saveToAccount: false, ask: true };
}

export const supabaseConsentServer: ConsentServer = {
  load: async (userId) => {
    const { data, error } = await supabase.from('profiles').select('store_data_consent').eq('id', userId).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as { store_data_consent: boolean | null } | null)?.store_data_consent ?? null;
  },
  save: async (userId, on) => {
    const { error } = await supabase
      .from('profiles')
      .update({ store_data_consent: on, store_data_consent_at: new Date().toISOString() } as never)
      .eq('id', userId);
    if (error) throw new Error(error.message);
  },
};

// The question after sign-in, when the account has never answered.
interface PromptState {
  askFor: string | null; // the signed-in user to ask
  ask: (userId: string) => void;
  dismiss: () => void;
}
export const useConsentPromptStore = create<PromptState>((set) => ({
  askFor: null,
  ask: (askFor) => set({ askFor }),
  dismiss: () => set({ askFor: null }),
}));

let applying = false; // the account's answer is being applied: don't send it back
let givenAtSignIn = false; // the box was ticked when creating the account

// Call just before signing in, when the person ticked "Store my feelings and
// habit data in my Ona account" on Create account: that answer wins over
// whatever the account said before, and is saved to it.
export function consentGivenAtSignIn(): void {
  givenAtSignIn = true;
}
let server: ConsentServer = supabaseConsentServer;

// The answer to the question after sign-in.
export async function answerConsentPrompt(on: boolean): Promise<void> {
  const userId = useConsentPromptStore.getState().askFor;
  useConsentPromptStore.getState().dismiss();
  if (!userId) return;
  if (on) useSettingsStore.getState().setConsent({ storeData: true }); // saved to the account below
  else await server.save(userId, false).catch(() => {});
}

async function onSignedIn(userId: string): Promise<void> {
  if (isDemo()) return;
  if (givenAtSignIn) {
    givenAtSignIn = false;
    useConsentPromptStore.getState().dismiss();
    if (useSettingsStore.getState().consent.storeData) await server.save(userId, true).catch(() => {});
    else useSettingsStore.getState().setConsent({ storeData: true }); // saved to the account by the subscription
    return;
  }
  let account: AccountConsent;
  try {
    account = await server.load(userId);
  } catch {
    return; // offline: this phone's answer stands until the next start
  }
  if (useAuthStore.getState().session?.user.id !== userId) return; // signed out meanwhile
  const local = useSettingsStore.getState().consent.storeData;
  const plan = reconcileConsent(account, local);
  if (plan.local !== local) {
    applying = true;
    try {
      useSettingsStore.getState().setConsent({ storeData: plan.local });
    } finally {
      applying = false;
    }
  }
  if (plan.saveToAccount) await server.save(userId, true).catch(() => {});
  if (plan.ask && !useSettingsStore.getState().consent.storeData) useConsentPromptStore.getState().ask(userId);
}

// Call once at startup (with sync). Returns a stop function.
export function startAccountConsent(consentServer: ConsentServer = supabaseConsentServer): () => void {
  server = consentServer;
  const signedInAs = useAuthStore.getState().session?.user.id;
  if (signedInAs) void onSignedIn(signedInAs);
  const unsubAuth = useAuthStore.subscribe((s, p) => {
    const id = s.session?.user.id;
    if (id && id !== p.session?.user.id) void onSignedIn(id);
    if (!id) useConsentPromptStore.getState().dismiss();
  });
  // A change made on this phone (sign-up or sign-in box, Settings, the
  // question above) is saved to the account. Never while the demo or a
  // switch between spaces loads its own settings.
  const unsubSettings = useSettingsStore.subscribe((s, p) => {
    if (s.consent.storeData === p.consent.storeData || applying || isDemo() || isSwitchingDataSpace()) return;
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;
    if (s.consent.storeData) useConsentPromptStore.getState().dismiss();
    void server.save(userId, s.consent.storeData).catch(() => {});
  });
  return () => {
    unsubAuth();
    unsubSettings();
  };
}
