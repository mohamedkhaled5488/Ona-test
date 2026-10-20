// The words a person sees before their data is kept in their account. Any
// change to the sentence gets a new version, which is recorded with the
// account (supabase/migrations/0008_store_data_consent_record.sql), so we
// always know which wording someone agreed to. Kept apart from the Terms.
export const CONSENT_WORDING_VERSION = '2026-10-21';

export const ACCOUNT_STORAGE_SENTENCE =
  'Your plans, tasks, journal, feelings, habits and Quit tracking are kept in your Ona account, so they sync between your phones and come back when you sign in again. Nothing is shared with anyone. Turn this off any time in Settings → Privacy, Security & Data.';

// Ona's own buttons carry the consent in their label. Google's and Apple's
// buttons keep their required wording; the sentence sits right under them.
export const SIGN_IN_LABEL = 'Sign in and sync my data';
export const SIGN_UP_LABEL = 'Create account and sync my data';

// Shown once to accounts that never saw the sentence (signed in before it
// existed).
export const EXISTING_ACCOUNT_NOTICE = {
  title: 'Your data is kept in your account',
  ok: 'OK',
  turnOff: 'Turn off',
};

// Where the person saw the sentence.
export type ConsentSource = 'sign-in' | 'sign-up' | 'google-sign-in' | 'google-sign-up' | 'notice' | 'settings';
