-- Ona — RevenueCat webhook bookkeeping. Every processed event id is kept so a
-- redelivered event changes nothing (the webhook is idempotent). Written only
-- by the revenuecat-webhook Edge Function with the service role; there are no
-- policies, so the app can't read or write it.
create table public.revenuecat_events (
  id text primary key,
  type text not null,
  outcome text not null,
  received_at timestamptz not null default now()
);

alter table public.revenuecat_events enable row level security;
