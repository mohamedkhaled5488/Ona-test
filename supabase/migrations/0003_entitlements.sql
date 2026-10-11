-- Ona — sync entitlement: the app-managed free trial and the subscription
-- state reported by RevenueCat. The server is the source of truth: the app
-- reads both through get_entitlement(), which also returns the server's own
-- clock so changing the phone's date can't extend a trial.
--
-- Only sync is ever gated on this. Local data is never touched.

-- One trial per account, ever. Created by start_trial() the first time the
-- user signs in; reinstalling the app or signing in on a new phone finds the
-- same row instead of starting a new trial.
create table public.account_trials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null
);

alter table public.account_trials enable row level security;
-- Users can read their own trial. Nobody can write it from the app: rows are
-- only created by start_trial() below.
create policy "account_trials: read own" on public.account_trials for select using (auth.uid() = user_id);

-- The subscription as last reported by the RevenueCat webhook (the Edge
-- Function writes with the service role; the app only reads).
create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  entitlement text not null default 'sync_access',
  product_id text,
  store text,
  status text not null check (status in ('active', 'canceled', 'grace', 'on_hold', 'paused', 'expired', 'refunded')),
  is_lifetime boolean not null default false,
  will_renew boolean not null default true,
  expires_at timestamptz,
  -- For idempotency and ordering of webhook events.
  last_event_id text,
  last_event_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;
create policy "subscriptions: read own" on public.subscriptions for select using (auth.uid() = user_id);

-- Everything the app needs to decide sync access, in one call.
create or replace function public.get_entitlement()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'server_time', now(),
    'trial_started_at', t.trial_started_at,
    'trial_ends_at', t.trial_ends_at,
    'subscription', case when s.user_id is null then null else json_build_object(
      'status', s.status,
      'expires_at', s.expires_at,
      'is_lifetime', s.is_lifetime,
      'will_renew', s.will_renew,
      'product_id', s.product_id,
      'store', s.store
    ) end
  )
  from (select auth.uid() as uid) me
  left join public.account_trials t on t.user_id = me.uid
  left join public.subscriptions s on s.user_id = me.uid;
$$;

-- Starts the 30-day trial if this account has never had one, then returns
-- the same shape as get_entitlement() plus whether a trial was just started.
-- Safe to call on every sign-in.
create or replace function public.start_trial()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inserted int;
  result json;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  insert into public.account_trials (user_id, trial_started_at, trial_ends_at)
  values (uid, now(), now() + interval '30 days')
  on conflict (user_id) do nothing;
  get diagnostics inserted = row_count;
  select (public.get_entitlement()::jsonb || jsonb_build_object('trial_newly_started', inserted > 0))::json into result;
  return result;
end;
$$;

revoke all on function public.get_entitlement() from public, anon;
revoke all on function public.start_trial() from public, anon;
grant execute on function public.get_entitlement() to authenticated;
grant execute on function public.start_trial() to authenticated;
