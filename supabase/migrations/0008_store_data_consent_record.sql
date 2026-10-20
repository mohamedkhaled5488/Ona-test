-- Ona — the record of "your data is kept in your account": which wording the
-- person saw (a version) and where they saw it (sign-in, sign-up, Google,
-- a one-time notice, Settings). With store_data_consent and
-- store_data_consent_at from 0007. Safe to run more than once.
alter table public.profiles
  add column if not exists store_data_consent_version text,
  add column if not exists store_data_consent_source text;
