-- Ona — sync. Every synced item (a task, a journal entry, a feeling check-in…)
-- is one row: its section/key ("collection"), its id, and its data as JSON.
-- One table for every section, so new fields and new sections never need a
-- schema change.
--
-- Rules, enforced here and not just in the app:
-- - Users only ever see and change their own rows (row-level security).
-- - Writing needs sync access: an active trial, an active (or grace, or
--   canceled-but-paid-up) subscription, or lifetime. Reading and deleting
--   your own rows never do, so nothing is ever held hostage.
-- - Last write wins per item, by the time the change was made on the device;
--   an older change arriving late never overwrites a newer one.

create table public.sync_records (
  user_id uuid not null references auth.users (id) on delete cascade,
  collection text not null, -- e.g. "dailyPlanning.tasks"
  record_id text not null,
  data jsonb, -- null once deleted
  deleted boolean not null default false,
  client_updated_at timestamptz not null, -- when the change was made on the device
  server_updated_at timestamptz not null default now(), -- set by the server; the pull cursor
  primary key (user_id, collection, record_id)
);
create index sync_records_pull_idx on public.sync_records (user_id, server_updated_at);

-- Same rule as the app's useEntitlement(): lifetime, an active subscription
-- (including grace or canceled-but-paid-up), or an active trial.
create or replace function public.has_sync_access(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.account_trials t where t.user_id = uid and t.trial_ends_at > now()
  ) or exists (
    select 1 from public.subscriptions s
    where s.user_id = uid
      and (
        (s.is_lifetime and s.status <> 'refunded')
        or s.status = 'grace'
        or (s.status in ('active', 'canceled') and (s.expires_at is null or s.expires_at > now()))
      )
  );
$$;
revoke all on function public.has_sync_access(uuid) from public, anon;
grant execute on function public.has_sync_access(uuid) to authenticated;

-- The server stamps every write, and keeps the newer of two changes.
create or replace function public.sync_records_before_write()
returns trigger
language plpgsql
as $$
begin
  -- A phone with its clock far ahead mustn't win every future conflict.
  new.client_updated_at := least(new.client_updated_at, clock_timestamp() + interval '5 minutes');
  if tg_op = 'UPDATE' and new.client_updated_at < old.client_updated_at then
    return old; -- an older change: keep what's there
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger sync_records_before_write
  before insert or update on public.sync_records
  for each row execute function public.sync_records_before_write();

alter table public.sync_records enable row level security;
create policy "sync_records: read own" on public.sync_records for select using (auth.uid() = user_id);
create policy "sync_records: insert own with access" on public.sync_records for insert
  with check (auth.uid() = user_id and public.has_sync_access(auth.uid()));
create policy "sync_records: update own with access" on public.sync_records for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.has_sync_access(auth.uid()));
create policy "sync_records: delete own" on public.sync_records for delete using (auth.uid() = user_id);

-- "Delete the copy in my account" (withdrawing the store-my-data consent)
-- also clears synced records.
create or replace function public.delete_my_server_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  delete from public.sync_records where user_id = uid;
  delete from public.daily_tasks where user_id = uid;
  delete from public.plans where user_id = uid;
  delete from public.plan_templates where user_id = uid;
  delete from public.day_templates where user_id = uid;
  delete from public.day_reflections where user_id = uid;
  delete from public.journal_entries where user_id = uid;
  delete from public.journal_settings where user_id = uid;
  delete from public.thoughts where user_id = uid;
  delete from public.study_sessions where user_id = uid;
  delete from public.planned_meals where user_id = uid;
  delete from public.favorite_meals where user_id = uid;
  delete from public.grocery_items where user_id = uid;
  delete from public.diet_settings where user_id = uid;
  delete from public.songs where user_id = uid;
  delete from public.game_results where user_id = uid;
  delete from public.feeling_checkins where user_id = uid;
  delete from public.feeling_bookmarks where user_id = uid;
  delete from public.feeling_guidance_votes where user_id = uid;
  delete from public.reading_list_entries where user_id = uid;
end;
$$;
