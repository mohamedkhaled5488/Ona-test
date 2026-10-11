import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAccountStore } from './useAccountStore';
import { useEntitlementStore } from './useEntitlementStore';
import { useSyncStore } from './useSyncStore';
import { useSettingsStore, type Consent } from './useSettingsStore';
import { track } from '../utils/analytics';
import { deleteAccount, withdrawStoreDataConsent, type ActionResult } from '../utils/accountActions';
import { isOnline } from '../utils/network';
import { wipeLocalData } from '../utils/localData';
import { googleModule, googleWebClientId, signInWithGoogle, signOutOfGoogle, type GoogleResult } from '../auth/googleSignIn';
import { DEMO_UNAVAILABLE, isDemo } from '../utils/dataSpace';

interface AuthState {
  session: Session | null;
  initializing: boolean;
  error: string | null;
  // Creating an account records the consents chosen on the sign-up form. The
  // free month starts on the server the first time the account signs in
  // (utils/entitlementSync.ts).
  signUp: (email: string, password: string, consent: Consent) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<boolean>;
  // "Continue with Google". `consent` is what was ticked on the screen (sign-up
  // asks for all three; sign-in only for storing data on this phone).
  signInWithGoogle: (consent: Partial<Consent>) => Promise<GoogleResult>;
  // Keeps everything on the device.
  signOut: () => Promise<void>;
  updateEmail: (email: string) => Promise<ActionResult>;
  updatePassword: (password: string) => Promise<ActionResult>;
  deleteAccount: (keepLocalCopy: boolean) => Promise<ActionResult>;
  withdrawStoreDataConsent: (deleteServerCopies: boolean) => Promise<ActionResult>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  initializing: isSupabaseConfigured,
  error: null,

  signUp: async (email, password, consent) => {
    if (isDemo()) {
      set({ error: DEMO_UNAVAILABLE });
      return false;
    }
    set({ error: null });
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      set({ error: error.message });
      return false;
    }
    // Supabase answers an already-registered (confirmed) email with a user
    // that has no identities, and sends no email. Say so, instead of "check
    // your inbox" for a message that will never come.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      set({ error: 'This email already has an Ona account. Sign in instead, or use Continue with Google if that is how you joined.' });
      return false;
    }
    useSettingsStore.getState().setConsent(consent);
    track('signup');
    return true;
  },

  signIn: async (email, password) => {
    if (isDemo()) {
      set({ error: DEMO_UNAVAILABLE });
      return false;
    }
    set({ error: null });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ error: error.message });
      return false;
    }
    return true;
  },

  signInWithGoogle: async (consent) => {
    if (isDemo()) {
      set({ error: DEMO_UNAVAILABLE });
      return { ok: false, kind: 'unavailable', message: DEMO_UNAVAILABLE };
    }
    set({ error: null });
    const result = await signInWithGoogle({
      google: googleModule(),
      webClientId: googleWebClientId(),
      isOnline: () => isOnline(),
      exchange: async (idToken) => {
        const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
        const created = data.user?.created_at ? Date.parse(data.user.created_at) : NaN;
        return { error: error ? { message: error.message, status: error.status } : null, isNewUser: Date.now() - created < 2 * 60_000 };
      },
    });
    if (result.ok) {
      // Only what was ticked; nothing is switched on by signing in with Google.
      const ticked = Object.fromEntries(Object.entries(consent).filter(([, v]) => v === true));
      if (Object.keys(ticked).length) useSettingsStore.getState().setConsent(ticked);
      if (result.isNewUser) track('signup');
    } else if (result.message) {
      set({ error: result.code ? `${result.message}
(${result.code})` : result.message });
    }
    return result;
  },

  signOut: async () => {
    // Refused quietly (with the message): the account isn't part of the demo.
    if (isDemo()) {
      set({ error: DEMO_UNAVAILABLE });
      return;
    }
    await supabase.auth.signOut();
    await signOutOfGoogle(googleModule());
  },

  updateEmail: async (email) => {
    if (isDemo()) return { ok: false, message: DEMO_UNAVAILABLE };
    const { error } = await supabase.auth.updateUser({ email });
    return error ? { ok: false, message: error.message } : { ok: true };
  },

  updatePassword: async (password) => {
    if (isDemo()) return { ok: false, message: DEMO_UNAVAILABLE };
    const { error } = await supabase.auth.updateUser({ password });
    return error ? { ok: false, message: error.message } : { ok: true };
  },

  deleteAccount: (keepLocalCopy) => {
    if (isDemo()) return Promise.resolve({ ok: false, message: DEMO_UNAVAILABLE });
    // Read before signing out clears the session.
    const userId = get().session?.user.id;
    return deleteAccount(keepLocalCopy, {
      isOnline: () => isOnline(),
      deleteOnServer: async () => {
        const { error } = await supabase.rpc('delete_my_account');
        return { error };
      },
      // The account no longer exists, so only the local session is cleared.
      signOutLocally: async () => {
        await supabase.auth.signOut({ scope: 'local' });
        // The account is gone: also remove Ona's access to the Google account.
        await signOutOfGoogle(googleModule(), true);
        set({ session: null });
      },
      wipeLocalData,
      forgetAccount: () => {
        if (userId) useEntitlementStore.getState().forget(userId);
        useSyncStore.getState().reset(); // the data no longer belongs to an account
        useAccountStore.setState({ lastSyncedAt: undefined });
      },
    });
  },

  withdrawStoreDataConsent: (deleteServerCopies) =>
    isDemo()
      ? Promise.resolve({ ok: false, message: DEMO_UNAVAILABLE })
      : withdrawStoreDataConsent(deleteServerCopies, {
      setConsent: (on) => useSettingsStore.getState().setConsent({ storeData: on }),
      isOnline: () => isOnline(),
      deleteServerData: async () => {
        const { error } = await supabase.rpc('delete_my_server_data');
        // The server copy is gone: if sync is switched back on, send everything again.
        if (!error) useSyncStore.getState().reset(true);
        return { error };
      },
    }),

  clearError: () => set({ error: null }),
}));

if (isSupabaseConfigured) {
  supabase.auth.getSession().then(({ data }) => {
    useAuthStore.setState({ session: data.session, initializing: false });
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    useAuthStore.setState({ session, initializing: false });
  });
}
