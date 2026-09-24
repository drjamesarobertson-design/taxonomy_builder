-- One-time setup: per-account cloud storage for the Library sidebar (library.ts), replacing the
-- previous browser-local IndexedDB storage. Each row is one Library entry (a saved taxonomy
-- under a category); Row Level Security restricts every read and write to the row's own owner,
-- so each subscriber's Library is genuinely private to their account, never visible to another
-- signed-in user (including James himself, for anyone else's rows).
--
-- Unlike profiles.sql, this table IS meant to be read and written directly by the app's own
-- Supabase client, as the signed-in user — that's what the policies below grant, scoped tightly
-- to auth.uid() = user_id on every operation.
--
-- Run this once, in Supabase's SQL Editor (Table Editor -> SQL Editor -> paste -> Run). Safe to
-- re-run (every statement is idempotent).

create table if not exists public.library_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null,
  entry_order integer not null default 0,
  project jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists library_entries_user_id_idx on public.library_entries (user_id);

alter table public.library_entries enable row level security;

drop policy if exists "Users can view their own library entries" on public.library_entries;
create policy "Users can view their own library entries"
  on public.library_entries for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own library entries" on public.library_entries;
create policy "Users can insert their own library entries"
  on public.library_entries for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own library entries" on public.library_entries;
create policy "Users can update their own library entries"
  on public.library_entries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own library entries" on public.library_entries;
create policy "Users can delete their own library entries"
  on public.library_entries for delete
  using (auth.uid() = user_id);
