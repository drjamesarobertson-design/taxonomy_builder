-- One-time setup: Stage D5b -- enforcing the pricing table's "Lock Taxonomy" row (Advanced = up
-- to 6 locked taxonomies, Enterprise = unlimited). Taxonomy project files themselves are never
-- stored centrally (local project files only, per CLAUDE.md section 8) -- there is no table of
-- "this account's taxonomies" to count against. This adds the one small piece that makes the cap
-- enforceable at all: a running counter on each account's own subscriptions row, kept in step by
-- the app itself calling adjust_locked_taxonomy_count() exactly once per real Lock and once per
-- Unlock (never on Lock Taxonomy's own "Lock updates" re-sweep of an already-locked taxonomy,
-- and never on Stage D5a's unrelated read-only-over-limit Library samples, which set the same
-- settings.locked flag for a completely different reason and must never count against this).
--
-- Deliberately a narrow, single-purpose RPC rather than a generic write grant: subscriptions
-- still has zero ordinary UPDATE grant for `authenticated` (0011's own rule, unchanged) -- this
-- function is security definer specifically so it can touch exactly this one counter, scoped to
-- auth.uid()'s own row only, and nothing else on that row can be touched through it.
--
-- Run this once, in Supabase's SQL Editor. Safe to re-run (every statement is idempotent).

alter table public.subscriptions
  add column if not exists locked_taxonomy_count integer not null default 0;

create or replace function public.adjust_locked_taxonomy_count(delta integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  update public.subscriptions
  set locked_taxonomy_count = greatest(0, locked_taxonomy_count + delta)
  where user_id = auth.uid()
  returning locked_taxonomy_count into new_count;
  return new_count;
end;
$$;

grant execute on function public.adjust_locked_taxonomy_count(integer) to authenticated;
