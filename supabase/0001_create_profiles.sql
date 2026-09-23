-- One-time setup: a "profiles" table under James's own control, populated automatically
-- whenever someone registers via Login.tsx's Create Account form — copying full_name,
-- company_name and mobile_number out of Supabase Auth's own user_metadata JSON (auth.ts's
-- signUp) into plain columns. This table is meant to be exported straight from Supabase's own
-- Table Editor (open "profiles" -> the export icon -> CSV), rather than through any page in
-- this app.
--
-- Row Level Security is enabled with NO policies at all, deliberately: this makes the table
-- completely unreachable through the app's own Supabase client (anon or authenticated role
-- alike) — the app never reads or writes it directly. It's visible only from inside the
-- Supabase dashboard (SQL Editor / Table Editor), which authenticates as the project owner and
-- bypasses RLS entirely.
--
-- Run this once, in Supabase's SQL Editor. Safe to re-run (every statement is idempotent).

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  company_name text,
  mobile_number text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Fires automatically on every new signup (auth.users insert), copying that user's metadata
-- into profiles. security definer + a fixed search_path is required here since this function
-- must be able to write to public.profiles regardless of who/what triggered the auth.users
-- insert.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, company_name, mobile_number, created_at)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'company_name',
    new.raw_user_meta_data ->> 'mobile_number',
    new.created_at
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill anyone who registered before this table existed, so the export isn't missing early
-- signups.
insert into public.profiles (id, email, full_name, company_name, mobile_number, created_at)
select
  id,
  email,
  raw_user_meta_data ->> 'full_name',
  raw_user_meta_data ->> 'company_name',
  raw_user_meta_data ->> 'mobile_number',
  created_at
from auth.users
on conflict (id) do nothing;
