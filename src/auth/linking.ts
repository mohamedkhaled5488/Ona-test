// One person, one Ona account, however they sign in (design gap G15).
//
// - Same verified email: Supabase links the identities itself (its default),
//   so email, Google and Apple with one address are already one account.
// - A different address (an Apple "hide my email" relay, a Google account
//   with another address): Settings → Account → Sign-in methods links it to
//   the account you're signed in to ("Link Google"; Apple with iOS stage 2),
//   or adds a password so you can also sign in with email.
// - The last way to sign in can never be removed.
// - The trial is per account (server-side), so linking never starts a second.
//
// Needs "Enable Manual Linking" in the Supabase project's Auth settings
// (docs/google-signin-setup.md).
import { signInWithGoogle, type GoogleDeps, type GoogleResult } from './googleSignIn';

export type SignInProvider = 'email' | 'google' | 'apple';

export interface SignInMethod {
  provider: SignInProvider;
  identityId: string;
  email?: string;
  raw: unknown; // what unlinkIdentity needs back
}

export interface LinkingAuth {
  getUserIdentities: () => Promise<{ data: { identities: { identity_id: string; provider: string; identity_data?: Record<string, unknown> }[] } | null; error: { message: string; code?: string } | null }>;
  linkIdentity: (c: { provider: 'google'; token: string }) => Promise<{ error: { message: string; code?: string; status?: number } | null }>;
  unlinkIdentity: (identity: unknown) => Promise<{ error: { message: string; code?: string } | null }>;
  updateUser: (u: { password: string }) => Promise<{ error: { message: string; code?: string } | null }>;
}

export const LINKING_COPY = {
  title: 'Sign-in methods',
  footer: 'Ways you can sign in to this same account. Your data and your trial stay with the account, whichever you use.',
  email: 'Email and password',
  google: 'Google',
  apple: 'Apple',
  linked: 'Linked',
  linkGoogle: 'Link Google',
  setPassword: 'Set a password',
  unlink: 'Unlink',
  unlinkTitle: (name: string) => `Stop signing in with ${name}?`,
  unlinkMessage: 'Your account and your data stay. You just won\'t be able to sign in this way any more.',
  lastMethod: "That's the only way you can sign in, so it stays. Add another first.",
  alreadyUsed: (name: string) => `That ${name} account is already used by another Ona account. Sign in with it to use that account, or delete that account first.`,
  manualLinkingOff: "Linking isn't switched on for this server yet.",
  linkedNow: (name: string) => `${name} is linked. You can sign in with it now.`,
  passwordSet: 'Password set. You can sign in with your email and this password too.',
  passwordTooShort: 'At least 8 characters.',
};

const providerName: Record<SignInProvider, string> = { email: LINKING_COPY.email, google: LINKING_COPY.google, apple: LINKING_COPY.apple };

export async function listSignInMethods(auth: LinkingAuth): Promise<{ ok: true; methods: SignInMethod[] } | { ok: false; message: string }> {
  const { data, error } = await auth.getUserIdentities();
  if (error || !data) return { ok: false, message: error?.message ?? "Couldn't load your sign-in methods." };
  const methods = data.identities
    .filter((i) => ['email', 'google', 'apple'].includes(i.provider))
    .map((i) => ({ provider: i.provider as SignInProvider, identityId: i.identity_id, email: typeof i.identity_data?.email === 'string' ? (i.identity_data.email as string) : undefined, raw: i }));
  return { ok: true, methods };
}

// Errors from Supabase, in plain words.
function linkMessage(error: { message: string; code?: string }, name: string): string {
  const text = `${error.code ?? ''} ${error.message}`.toLowerCase();
  if (text.includes('identity_already_exists') || text.includes('already linked') || text.includes('already been linked')) return LINKING_COPY.alreadyUsed(name);
  if (text.includes('manual_linking_disabled') || text.includes('manual linking')) return LINKING_COPY.manualLinkingOff;
  return error.message;
}

// Google: the same native sign-in as "Continue with Google" (cancel,
// offline and an expired token handled there), but the token is linked to
// the account you're in instead of signing in with it.
export async function linkGoogle(auth: LinkingAuth, google: Omit<GoogleDeps, 'exchange'>): Promise<GoogleResult> {
  // The linking error in plain words (Google sign-in would otherwise show its
  // own generic message for any server error).
  let linkError: string | null = null;
  const result = await signInWithGoogle({
    ...google,
    exchange: async (idToken) => {
      const { error } = await auth.linkIdentity({ provider: 'google', token: idToken });
      if (error) {
        linkError = linkMessage(error, LINKING_COPY.google);
        return { error: { message: linkError, status: error.status } };
      }
      return { error: null, isNewUser: false };
    },
  });
  if (!result.ok && linkError) return { ok: false, kind: 'failed', message: linkError };
  return result;
}

export async function setPassword(auth: LinkingAuth, password: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (password.length < 8) return { ok: false, message: LINKING_COPY.passwordTooShort };
  const { error } = await auth.updateUser({ password });
  return error ? { ok: false, message: error.message } : { ok: true };
}

export async function unlinkMethod(auth: LinkingAuth, methods: SignInMethod[], method: SignInMethod): Promise<{ ok: true } | { ok: false; message: string }> {
  // Never the last way in (the server refuses it too).
  if (methods.length <= 1) return { ok: false, message: LINKING_COPY.lastMethod };
  const { error } = await auth.unlinkIdentity(method.raw);
  if (!error) return { ok: true };
  const text = `${error.code ?? ''} ${error.message}`.toLowerCase();
  return { ok: false, message: text.includes('single_identity_not_deletable') ? LINKING_COPY.lastMethod : linkMessage(error, providerName[method.provider]) };
}

export const methodName = (p: SignInProvider) => providerName[p];
