-- One-time setup: subscriptions -- the one real record of "what plan is this account on,"
-- separate from subscription_plans (0010, which just defines what each plan IS). Every account
-- gets exactly one row here, defaulting to 'free' the moment it signs up -- mirrors 0001's
-- handle_new_user() trigger for profiles, but as its own additional trigger function rather than
-- editing that one, so this is purely additive and can't disturb anything already shipped.
--
-- Deliberately NO write access for ordinary users, not even to their own row -- unlike
-- library_entries (where "owns their own data" is the whole point), letting the app's own client
-- write here directly would mean a bug (or a motivated user poking the API) could self-grant a
-- paid tier for nothing. The only two things that can ever change a row are this trigger
-- (security definer, bypasses RLS) and, later, the Stripe webhook Edge Function (running with
-- the service_role key, which also bypasses RLS) -- nothing else, ever.
--
-- billing_period/stripe_customer_id/stripe_subscription_id/current_period_end are all nullable
-- and unused until Stage C3 (the Checkout/webhook Edge Functions) actually populates them -- this
-- migration only ever writes plan_key = 'free' and status = 'active'.
--
-- Run this once, in Supabase's SQL Editor. Safe to re-run (every statement is idempotent).

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan_key text not null default 'free' references public.subscription_plans (plan_key),
  billing_period text,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'active',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "Users can read their own subscription" on public.subscriptions;
create policy "Users can read their own subscription"
  on public.subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Supervisor can read all subscriptions" on public.subscriptions;
create policy "Supervisor can read all subscriptions"
  on public.subscriptions for select
  to authenticated
  using (auth.email() = 'jamesar@jar-and-a.com');

create or replace function public.handle_new_user_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (user_id, plan_key)
  values (new.id, 'free')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_subscription on auth.users;
create trigger on_auth_user_created_subscription
  after insert on auth.users
  for each row execute function public.handle_new_user_subscription();

-- Backfill anyone who registered before this table existed, same as 0001 does for profiles.
insert into public.subscriptions (user_id, plan_key)
select id, 'free' from auth.users
on conflict (user_id) do nothing;

-- Required for any newly-created table from 30 October 2026 onward -- see MASTER_BRIEFING.md §3.
-- No anon grant at all (this is per-account data, never publicly readable) and no insert/update/
-- delete grant for authenticated (see the note above -- only the trigger and, later, the webhook
-- function running as service_role may ever write here).
grant select on public.subscriptions to authenticated;
grant select, insert, update, delete on public.subscriptions to service_role;
