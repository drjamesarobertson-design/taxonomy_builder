-- James's ask: a curated set of "starter sample" taxonomies, copied automatically into every
-- new subscriber's own Library the first time they sign in, for training purposes. Marking an
-- entry as a starter sample is an ordinary in-app action (a right-click toggle on any Library
-- entry, LibrarySidebar.tsx) available to whoever owns that entry — there's no separate "admin"
-- concept yet, so today this is effectively James curating his own entries, but the design isn't
-- hardcoded to his account specifically.
--
-- Run this once, in Supabase's SQL Editor, same as 0001 and 0002. Safe to re-run (every
-- statement is idempotent).

alter table public.library_entries
  add column if not exists is_starter_sample boolean not null default false;

-- The existing owner-only select policy (0002) still applies for a user's own rows. This ADDS a
-- second select policy specifically for starter-sample rows, visible to ANY signed-in user
-- regardless of who owns them — Postgres RLS policies for the same command are OR'd together, so
-- a user can read a row if it's their own OR if it's flagged as a starter sample. Insert/update/
-- delete stay owner-only (0002's existing policies) — only an entry's own owner can flag or
-- unflag it, or edit/delete it, same as any other Library entry.
drop policy if exists "Anyone signed in can view starter sample entries" on public.library_entries;
create policy "Anyone signed in can view starter sample entries"
  on public.library_entries for select
  using (is_starter_sample = true);
