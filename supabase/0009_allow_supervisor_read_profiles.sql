-- James's ask (2026-10-14): see new sign-ups directly inside Taxonomy Builder itself, the
-- moment he next logs in -- rather than relying only on an outbound email (Resend/pg_net,
-- 0008) that's proven hard to confirm/debug, or going to look in Supabase's own dashboard.
--
-- public.profiles (0001) was deliberately built with Row Level Security enabled and NO
-- policies at all, so the app's own Supabase client could never read it under any account --
-- this adds exactly one read-only policy, scoped to the supervisor account alone, using the
-- same auth.email() gating already used to restrict starring Library entries
-- (0005_restrict_starter_sample_to_supervisor.sql). Every other signed-in account still has
-- zero access to this table -- nothing changes for them.
--
-- Run this once, in Supabase's SQL Editor. Safe to re-run (every statement is idempotent).

drop policy if exists "Supervisor can read all profiles" on public.profiles;
create policy "Supervisor can read all profiles"
  on public.profiles for select
  to authenticated
  using (auth.email() = 'jamesar@jar-and-a.com');
