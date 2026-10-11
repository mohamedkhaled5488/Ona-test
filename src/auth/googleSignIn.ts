// "Continue with Google": Google's own sign-in sheet on the phone, then the
// ID token is exchanged for an Ona (Supabase) session with signInWithIdToken.
// The outcome is always one of a few calm, defined results — never a raw error.
//
// Uses @react-native-google-signin/google-signin (the free "original" API),
// which needs a development build: in Expo Go and the web preview the native
// module isn't there, and the button explains that instead of failing.
import { Platform } from 'react-native';

// The parts of GoogleSignin we use (lets tests pass a fake).
export interface GoogleModule {
  configure: (options: { webClientId: string; scopes: string[]; offlineAccess: boolean }) => void;
  hasPlayServices: (options: { showPlayServicesUpdateDialog: boolean }) => Promise<boolean>;
  signIn: () => Promise<{ type: 'success'; data: { idToken: string | null; user: { email: string } } } | { type: 'cancelled'; data: null }>;
  getTokens: () => Promise<{ idToken: string; accessToken: string }>;
  signOut: () => Promise<unknown>;
  revokeAccess: () => Promise<unknown>;
  hasPreviousSignIn?: () => boolean;
}

export interface GoogleDeps {
  google: GoogleModule | null; // null: not available in this build (Expo Go, web)
  webClientId: string | undefined;
  isOnline: () => Promise<boolean>;
  // Exchanges a Google ID token for an Ona session.
  exchange: (idToken: string) => Promise<{ error: { message: string; status?: number } | null; isNewUser?: boolean }>;
}

export type GoogleFailure = 'cancelled' | 'inProgress' | 'offline' | 'noPlayServices' | 'expired' | 'unavailable' | 'notConfigured' | 'failed';

// `code`: Google's or Supabase's own short code, shown small under the message
// so a failure can be diagnosed (e.g. 10 = app fingerprint not recognised).
export type GoogleResult = { ok: true; isNewUser: boolean } | { ok: false; kind: GoogleFailure; message: string | null; code?: string };

// Only the basic profile and email, nothing else.
export const GOOGLE_SCOPES = ['profile', 'email'];

export const GOOGLE_MESSAGES: Record<GoogleFailure, string | null> = {
  cancelled: null, // the user closed Google's sheet: nothing to say
  inProgress: null, // already open; the open sheet is the answer
  offline: "You're offline. Connect to the internet and try again.",
  noPlayServices: "Google sign-in needs Google Play services, which aren't available on this phone. You can use email and password instead.",
  expired: 'Your Google sign-in took too long and expired. Please try again.',
  unavailable: 'Google sign-in works in the installed Ona app, not in this preview. You can use email and password here.',
  notConfigured: "Google sign-in isn't set up in this version yet. You can use email and password.",
  failed: "Google sign-in didn't work this time. Please try again, or use email and password.",
};

const fail = (kind: GoogleFailure, code?: string): GoogleResult => ({ ok: false, kind, message: GOOGLE_MESSAGES[kind], ...(code ? { code } : {}) });

function codeOf(e: unknown): string | undefined {
  return e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : undefined;
}

// Google Play services' own network error is status code 7.
function isNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  return codeOf(e) === '7' || /network|offline|internet|failed to fetch|timed? ?out/i.test(msg);
}

function isExpiredTokenError(message: string): boolean {
  return /expired|exp claim|token is too old|issued in the future|stale/i.test(message);
}

let configuredFor: string | null = null;

export async function signInWithGoogle(deps: GoogleDeps): Promise<GoogleResult> {
  const { google, webClientId } = deps;
  if (!webClientId) return fail('notConfigured');
  if (!google) return fail('unavailable');
  if (!(await deps.isOnline())) return fail('offline');

  if (configuredFor !== webClientId) {
    google.configure({ webClientId, scopes: GOOGLE_SCOPES, offlineAccess: false });
    configuredFor = webClientId;
  }

  try {
    if (Platform.OS === 'android' && !(await google.hasPlayServices({ showPlayServicesUpdateDialog: true }))) return fail('noPlayServices');
  } catch (e) {
    return codeOf(e) === 'PLAY_SERVICES_NOT_AVAILABLE' ? fail('noPlayServices') : isNetworkError(e) ? fail('offline') : fail('failed');
  }

  let idToken: string | null;
  try {
    const response = await google.signIn();
    if (response.type === 'cancelled') return fail('cancelled');
    idToken = response.data.idToken;
  } catch (e) {
    const code = codeOf(e);
    if (code === 'SIGN_IN_CANCELLED' || code === '12501') return fail('cancelled');
    if (code === 'IN_PROGRESS') return fail('inProgress');
    if (code === 'PLAY_SERVICES_NOT_AVAILABLE') return fail('noPlayServices');
    if (isNetworkError(e)) return fail('offline');
    return fail('failed', code ? `Google ${code}` : undefined);
  }
  // No token means the Web client ID doesn't match the Google Cloud project.
  if (!idToken) {
    await google.signOut().catch(() => {});
    return fail('failed', 'no token');
  }

  try {
    let result = await deps.exchange(idToken);
    // A token that expired before it reached the server: get a fresh one once.
    if (result.error && isExpiredTokenError(result.error.message)) {
      const fresh = await google.getTokens().catch(() => null);
      if (fresh?.idToken) result = await deps.exchange(fresh.idToken);
      if (result.error && isExpiredTokenError(result.error.message)) {
        await google.signOut().catch(() => {});
        return fail('expired');
      }
    }
    if (result.error) {
      await google.signOut().catch(() => {});
      return isNetworkError(new Error(result.error.message)) ? fail('offline') : fail('failed', `Ona ${result.error.status ?? ''} ${result.error.message}`.trim().slice(0, 80));
    }
    return { ok: true, isNewUser: !!result.isNewUser };
  } catch (e) {
    await google.signOut().catch(() => {});
    return isNetworkError(e) ? fail('offline') : fail('failed');
  }
}

// Signing out of Ona also signs out of Google on this phone, so the next
// "Continue with Google" asks which account to use.
export async function signOutOfGoogle(google: GoogleModule | null, revoke = false): Promise<void> {
  if (!google) return;
  try {
    if (revoke) await google.revokeAccess();
  } catch {
    // Not signed in with Google, or already revoked: nothing to undo.
  }
  try {
    await google.signOut();
  } catch {
    // Same: nothing to undo.
  }
}

// The real module, loaded only when needed. Expo Go and the web preview don't
// include it, so this returns null there instead of crashing at import.
let loaded: GoogleModule | null | undefined;
export function googleModule(): GoogleModule | null {
  if (loaded !== undefined) return loaded;
  if (Platform.OS === 'web') return (loaded = null);
  try {
    const lib = require('@react-native-google-signin/google-signin') as { GoogleSignin: GoogleModule };
    loaded = lib.GoogleSignin ?? null;
  } catch {
    loaded = null;
  }
  return loaded;
}

export const googleWebClientId = (): string | undefined => process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined;
