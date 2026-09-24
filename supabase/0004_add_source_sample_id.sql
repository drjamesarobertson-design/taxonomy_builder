-- James's ask: let a subscriber check for and pull in NEW starter samples after their first
-- sign-in, not just the ones that existed at that exact moment — so James can invite Beta
-- testers with a handful of samples ready and add more over the following days.
--
-- Tracks which starter sample (if any) each Library entry was copied from, so "what's new" can
-- be computed as "starter samples whose id isn't among the ones I've already got a copy of" —
-- see listNewStarterSamples/importSelectedStarterSamples in library.ts.
--
-- Run this once, in Supabase's SQL Editor, same as 0001-0003. Safe to re-run (every statement is
-- idempotent).

alter table public.library_entries
  add column if not exists source_sample_id uuid references public.library_entries (id) on delete set null;
