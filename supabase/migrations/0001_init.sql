-- Ona — initial schema. One table per section's data (Plan Builder's nested
-- step tree lives in a JSONB column, per the original design decision — it
-- doesn't fit a rigid relational shape). Every table is scoped to the
-- authenticated user via row-level security; there is no cross-user sharing
-- anywhere in this app.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helper: every table gets the same "owns their own rows" policy set.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (one row per auth user; created on sign-up by a trigger)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "profiles: read own" on public.profiles for select using (auth.uid() = id);
create policy "profiles: update own" on public.profiles for update using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Plan Builder
-- ---------------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '', -- what the plan is; asked for before motive
  motive text not null default '',
  status text not null default 'active' check (status in ('active', 'archived')),
  color text not null default '#4F9B82',
  tags text[] not null default '{}',
  review_interval_days int,
  reflection jsonb,
  steps jsonb not null default '[]', -- PlanStep[] tree: id, title, notes, color, done, priority, dueDate, resources, risks, timeEstimate, attachments[], alternatives[], subSteps[]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index plans_user_id_idx on public.plans (user_id);
create trigger plans_set_updated_at before update on public.plans for each row execute function public.set_updated_at();

create table public.plan_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text not null default '',
  motive text not null default '',
  steps jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index plan_templates_user_id_idx on public.plan_templates (user_id);

-- ---------------------------------------------------------------------------
-- Daily Planning
-- ---------------------------------------------------------------------------
create table public.daily_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  title text not null default '',
  done boolean not null default false,
  scheduled_time text,
  reminder_minutes_before int,
  alarm_sound text, -- null = 'default'; see src/data/alarmSounds.ts
  notification_ids text[] not null default '{}',
  completion_notes jsonb not null default '{}', -- Record<date, {comment?, evaluation?}>
  linked_plan_id uuid references public.plans (id) on delete set null,
  linked_plan_path text[],
  subtasks jsonb not null default '[]', -- {id, title, done}[]
  repeat text not null default 'none' check (repeat in ('none', 'daily', 'weekly')),
  completed_dates date[] not null default '{}',
  skipped_dates date[] not null default '{}',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index daily_tasks_user_date_idx on public.daily_tasks (user_id, date);
create trigger daily_tasks_set_updated_at before update on public.daily_tasks for each row execute function public.set_updated_at();

create table public.day_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  task_titles text[] not null default '{}'
);
create index day_templates_user_id_idx on public.day_templates (user_id);

create table public.day_reflections (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  text text not null default '',
  primary key (user_id, date)
);

-- ---------------------------------------------------------------------------
-- Journaling
-- ---------------------------------------------------------------------------
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  mood text not null,
  text text not null default '',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);
create index journal_entries_user_id_idx on public.journal_entries (user_id);
create trigger journal_entries_set_updated_at before update on public.journal_entries for each row execute function public.set_updated_at();

create table public.journal_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  lock_enabled boolean not null default false,
  background text not null default 'ink',
  font text not null default 'inter',
  size text not null default 'medium',
  template text not null default 'lined'
);

-- ---------------------------------------------------------------------------
-- Catch a Feeling or Idea
-- ---------------------------------------------------------------------------
create table public.thoughts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('idea', 'feeling', 'random')),
  text text not null,
  promoted_to text check (promoted_to in ('plan', 'journal')),
  created_at timestamptz not null default now()
);
create index thoughts_user_id_idx on public.thoughts (user_id);

-- ---------------------------------------------------------------------------
-- Study Session
-- ---------------------------------------------------------------------------
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  subject text,
  focus_minutes int not null default 0,
  break_minutes int not null default 0,
  app_blocking_enabled boolean not null default false,
  ambient_sound text not null default 'none',
  notes text,
  created_at timestamptz not null default now()
);
create index study_sessions_user_date_idx on public.study_sessions (user_id, date);

-- ---------------------------------------------------------------------------
-- Diet Planning
-- ---------------------------------------------------------------------------
create table public.planned_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  slot text not null check (slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  name text not null,
  cost numeric,
  source text check (source in ('home-cooked', 'restaurant', 'delivery', 'grocery')),
  notes text,
  tags text[] not null default '{}'
);
create index planned_meals_user_date_idx on public.planned_meals (user_id, date);

create table public.favorite_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  cost numeric,
  source text,
  notes text,
  tags text[] not null default '{}'
);
create index favorite_meals_user_id_idx on public.favorite_meals (user_id);

create table public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  checked boolean not null default false
);
create index grocery_items_user_id_idx on public.grocery_items (user_id);

create table public.diet_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  currency text not null default 'USD'
);

-- ---------------------------------------------------------------------------
-- Songwriting
-- ---------------------------------------------------------------------------
create table public.songs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Untitled song',
  song_type_id text not null,
  status text not null default 'in-progress' check (status in ('in-progress', 'finished')),
  sections jsonb not null default '[]', -- {id, label, text}[]
  versions jsonb not null default '[]', -- {id, savedAt, label?, sections}[]
  inspiration text[] not null default '{}',
  collaborator text,
  has_voice_memo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index songs_user_id_idx on public.songs (user_id);
create trigger songs_set_updated_at before update on public.songs for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Mind Games
-- ---------------------------------------------------------------------------
create table public.game_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id text not null check (game_id in ('memory', 'reaction', 'math', 'word')),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  score numeric not null,
  played_at timestamptz not null default now()
);
create index game_results_user_id_idx on public.game_results (user_id);

-- ---------------------------------------------------------------------------
-- Identify the Feeling
-- ---------------------------------------------------------------------------
create table public.feeling_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  feeling_id text not null,
  family text not null,
  note text,
  date date not null,
  created_at timestamptz not null default now()
);
create index feeling_checkins_user_id_idx on public.feeling_checkins (user_id);

create table public.feeling_bookmarks (
  user_id uuid not null references auth.users (id) on delete cascade,
  feeling_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, feeling_id)
);

create table public.feeling_guidance_votes (
  user_id uuid not null references auth.users (id) on delete cascade,
  vote_key text not null, -- "{feelingId}::{bulletText}"
  score int not null default 0,
  primary key (user_id, vote_key)
);

-- ---------------------------------------------------------------------------
-- Book Recommendations (reading list only — search results are never stored)
-- ---------------------------------------------------------------------------
create table public.reading_list_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id text not null, -- Google Books volume id
  status text not null check (status in ('want', 'reading', 'finished')),
  progress_percent int,
  rating int check (rating between 1 and 5),
  notes text,
  book jsonb not null, -- snapshot of the Book at the time it was added
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, book_id)
);
create index reading_list_entries_user_id_idx on public.reading_list_entries (user_id);
create trigger reading_list_set_updated_at before update on public.reading_list_entries for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security: every table follows the same "own rows only" rule.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'plans', 'plan_templates', 'daily_tasks', 'day_templates', 'day_reflections',
      'journal_entries', 'journal_settings', 'thoughts', 'study_sessions',
      'planned_meals', 'favorite_meals', 'grocery_items', 'diet_settings',
      'songs', 'game_results', 'feeling_checkins', 'feeling_bookmarks',
      'feeling_guidance_votes', 'reading_list_entries'
    ])
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy "%s: select own" on public.%I for select using (auth.uid() = user_id);', t, t);
    execute format('create policy "%s: insert own" on public.%I for insert with check (auth.uid() = user_id);', t, t);
    execute format('create policy "%s: update own" on public.%I for update using (auth.uid() = user_id);', t, t);
    execute format('create policy "%s: delete own" on public.%I for delete using (auth.uid() = user_id);', t, t);
  end loop;
end $$;
