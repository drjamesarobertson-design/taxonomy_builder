-- James's ask: only his own account (the "supervisor") should be able to flag a Library entry
-- as a starter sample — today ANY signed-in subscriber can star their own entries (0003's
-- design explicitly left this open, "effectively James curating his own entries... but the
-- design isn't hardcoded to his account specifically"), which then get copied into every new
-- subscriber's Library on first sign-in. That's no longer the intent.
--
-- A client-side check (src/supervisor.ts) hides the "Mark as Starter Sample" control from
-- everyone else, but that alone is only ever a UI convenience — anyone could still call the
-- same Supabase update directly. This trigger is the real enforcement: it rejects any attempt
-- to set is_starter_sample = true unless the request's own JWT email matches the supervisor's,
-- regardless of what the client actually sends.
--
-- Run this once, in Supabase's SQL Editor, same as 0001-0004. Safe to re-run (every statement is
-- idempotent).

create or replace function public.enforce_starter_sample_supervisor_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_starter_sample = true
     and (tg_op = 'INSERT' or new.is_starter_sample is distinct from old.is_starter_sample)
     and coalesce(auth.email(), '') <> 'jamesar@jar-and-a.com' then
    raise exception 'Only the supervisor account may flag an entry as a starter sample.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_starter_sample_supervisor_only on public.library_entries;
create trigger enforce_starter_sample_supervisor_only
  before insert or update on public.library_entries
  for each row execute function public.enforce_starter_sample_supervisor_only();
