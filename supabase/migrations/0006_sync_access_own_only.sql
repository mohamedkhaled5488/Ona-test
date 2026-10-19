-- Ona — has_sync_access() answers only about the caller. It's callable by
-- any signed-in user (row-level security on sync_records calls it), and it
-- used to answer for any account id, so one user could learn whether another
-- account pays. The policies only ever ask about auth.uid(), so they behave
-- exactly as before.
create or replace function public.has_sync_access(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid = auth.uid() and (
    exists (
      select 1 from public.account_trials t where t.user_id = uid and t.trial_ends_at > now()
    ) or exists (
      select 1 from public.subscriptions s
      where s.user_id = uid
        and (
          (s.is_lifetime and s.status <> 'refunded')
          or s.status = 'grace'
          or (s.status in ('active', 'canceled') and (s.expires_at is null or s.expires_at > now()))
        )
    )
  );
$$;
