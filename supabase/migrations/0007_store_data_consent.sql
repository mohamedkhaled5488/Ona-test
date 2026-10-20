-- Ona — "Store my feelings and habit data in my Ona account", kept with the
-- account instead of on each phone. Answered once (yes or no), it applies
-- on every phone you sign in on, so a new phone or a reinstall syncs and
-- brings your data back by itself. Turning it off on one phone turns it off
-- everywhere.
--
--   null  = never answered (Ona asks right after sign-in)
--   true  = yes, keep a copy in my account
--   false = no / withdrawn
alter table public.profiles
  add column if not exists store_data_consent boolean,
  add column if not exists store_data_consent_at timestamptz;

-- Users may already update their own profile ("profiles: update own"); the
-- policy's USING clause also checks the new row, so nobody can change another
-- account's answer.
