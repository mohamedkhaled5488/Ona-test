-- Ona — in-app data and account deletion (Settings → Privacy, Security & Data).
--
-- Both functions act only on the calling user (auth.uid()); there are no
-- arguments, so one user can never delete another's data. They run as
-- security definer because a signed-in user can't delete their own row in
-- auth.users through the API.

-- Deletes every row the user owns, keeping the account itself. Used when the
-- user withdraws "Store my feelings and habit data in my Ona account" and
-- chooses to delete the server copies.
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
  -- daily_tasks references plans, so tasks go first.
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

-- Deletes the account. Every table references auth.users with
-- "on delete cascade", so all of the user's rows (and their profile) go with it.
create or replace function public.delete_my_account()
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
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_server_data() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_server_data() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
