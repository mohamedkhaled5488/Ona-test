-- Ona — sync conflicts by server revision, not by the phone's clock (design
-- 3.5, gap G5). Every record has a revision (rev) the server counts up on
-- each accepted write. A phone sends the revision it last saw (base_rev):
--
-- - base_rev = the current rev: accepted, rev + 1.
-- - base_rev older (another phone wrote in between): not applied. The row
--   comes back unchanged, so the phone sees the server's version and
--   resolves it (keeps both for journal entries, thoughts, quotes and songs;
--   otherwise the change that reached the server last wins, and a delete
--   never wins over an edit it didn't see). Nothing is lost on either side.
-- - base_rev 0: a record the phone never saw on the server (new). If one
--   exists already (made on another phone with the same id), the same.
-- - base_rev null: an older app version. The old rule (the later change on
--   the device's clock) applies, as before.
--
-- base_rev is only ever read, never kept: the trigger clears it on every
-- write. Otherwise an older app (which doesn't send it) would inherit the
-- last stored value on its next write to that row and be refused.
--
-- Safe to run more than once.

alter table public.sync_records add column if not exists rev bigint not null default 1;
alter table public.sync_records add column if not exists base_rev bigint;

create or replace function public.sync_records_before_write()
returns trigger
language plpgsql
as $$
begin
  -- A phone with its clock far ahead mustn't win every future conflict.
  new.client_updated_at := least(new.client_updated_at, clock_timestamp() + interval '5 minutes');
  if tg_op = 'INSERT' then
    new.rev := 1;
    -- An upsert runs this insert step first, and its ON CONFLICT update
    -- then reads base_rev from the row as this step leaves it: so it's kept
    -- when the row exists (the update below needs it, then clears it), and
    -- cleared only for a row that's really new.
    if not exists (select 1 from public.sync_records r where r.user_id = new.user_id and r.collection = new.collection and r.record_id = new.record_id) then
      new.base_rev := null;
    end if;
  else
    if new.base_rev is not null and new.base_rev <> old.rev then
      return old; -- written over a version this phone never saw: the phone resolves
    end if;
    if new.base_rev is null and new.client_updated_at < old.client_updated_at then
      return old; -- an older app version's older change: keep what's there
    end if;
    new.rev := old.rev + 1;
    new.base_rev := null;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;
