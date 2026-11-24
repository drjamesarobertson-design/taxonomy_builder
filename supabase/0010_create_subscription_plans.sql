-- One-time setup: the subscription tier structure as live, editable data rather than hardcoded
-- app constants -- James's explicit requirement ("the names of the categories and the break
-- points need to be user defined, may change as we gain experience"). Seeded with the 4-tier
-- structure agreed 2026-11-24 (see MASTER_BRIEFING.md §4) plus one hidden "beta" row for the
-- commercial override James asked for ("give them full access but NOT edit help" -- Edit Help
-- stays gated purely on src/supervisor.ts's hardcoded supervisor check, independent of plan, so
-- no column is needed here for that).
--
-- A null limit means "unlimited"; 0 means "not allowed at all"; a positive number is the actual
-- cap. Every *_allowed column is a plain feature gate. subscription_settings is a single-row
-- table for the one genuinely global toggle (showing Annual billing as "Coming soon" vs. live) --
-- kept separate from subscription_plans since it isn't a per-tier value.
--
-- Readable by anyone, signed in or not (the Pricing page shows on the Login screen too, before
-- sign-in) -- this is published pricing information, not sensitive. Writable only by the
-- supervisor account, same auth.email() gating already used throughout (see
-- 0005_restrict_starter_sample_to_supervisor.sql, 0009_allow_supervisor_read_profiles.sql).
--
-- Run this once, in Supabase's SQL Editor. Safe to re-run (every statement is idempotent) --
-- re-running will NOT overwrite any price/limit you've since edited by hand, since the seed
-- insert below only ever fires "on conflict do nothing".

create table if not exists public.subscription_plans (
  plan_key text primary key,
  display_name text not null,
  sort_order integer not null,
  is_public boolean not null default true,
  monthly_price_gbp numeric(10, 2) not null default 0,
  annual_price_gbp numeric(10, 2) not null default 0,
  max_code_columns integer,
  max_rows integer,
  max_library_entries integer,
  max_locked_taxonomies integer,
  audit_allowed boolean not null default false,
  chart_of_accounts_wizard_allowed boolean not null default false,
  function_master_allowed boolean not null default false,
  location_master_allowed boolean not null default false,
  division_master_allowed boolean not null default false,
  folders_local_drive_allowed boolean not null default false,
  folders_outlook_allowed boolean not null default false,
  gl_analyser_import_allowed boolean not null default false,
  gl_builder_export_allowed boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.subscription_settings (
  id smallint primary key default 1,
  annual_billing_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint subscription_settings_singleton check (id = 1)
);

insert into public.subscription_settings (id, annual_billing_enabled)
values (1, false)
on conflict (id) do nothing;

insert into public.subscription_plans (
  plan_key, display_name, sort_order, is_public, monthly_price_gbp, annual_price_gbp,
  max_code_columns, max_rows, max_library_entries, max_locked_taxonomies,
  audit_allowed, chart_of_accounts_wizard_allowed, function_master_allowed,
  location_master_allowed, division_master_allowed,
  folders_local_drive_allowed, folders_outlook_allowed,
  gl_analyser_import_allowed, gl_builder_export_allowed
)
values
  ('free', 'Free', 1, true, 0, 0,
   3, 30, 3, 0,
   false, false, false, false, false,
   false, false, false, false),
  ('basic', 'Basic', 2, true, 19.99, 179.91,
   6, 60, 6, 0,
   false, true, false, false, false,
   true, false, false, false),
  ('advanced', 'Advanced', 3, true, 39.99, 359.91,
   9, 120, 12, 6,
   true, true, true, false, false,
   true, true, true, false),
  ('enterprise', 'Enterprise', 4, true, 99.99, 899.91,
   15, null, null, null,
   true, true, true, true, true,
   true, true, true, true),
  ('beta', 'Beta Tester', 99, false, 0, 0,
   null, null, null, null,
   true, true, true, true, true,
   true, true, true, true)
on conflict (plan_key) do nothing;

alter table public.subscription_plans enable row level security;
alter table public.subscription_settings enable row level security;

drop policy if exists "Anyone can read subscription plans" on public.subscription_plans;
create policy "Anyone can read subscription plans"
  on public.subscription_plans for select
  to anon, authenticated
  using (true);

drop policy if exists "Supervisor can manage subscription plans" on public.subscription_plans;
create policy "Supervisor can manage subscription plans"
  on public.subscription_plans for all
  to authenticated
  using (auth.email() = 'jamesar@jar-and-a.com')
  with check (auth.email() = 'jamesar@jar-and-a.com');

drop policy if exists "Anyone can read subscription settings" on public.subscription_settings;
create policy "Anyone can read subscription settings"
  on public.subscription_settings for select
  to anon, authenticated
  using (true);

drop policy if exists "Supervisor can manage subscription settings" on public.subscription_settings;
create policy "Supervisor can manage subscription settings"
  on public.subscription_settings for all
  to authenticated
  using (auth.email() = 'jamesar@jar-and-a.com')
  with check (auth.email() = 'jamesar@jar-and-a.com');

-- Required for any newly-created table from 30 October 2026 onward -- see MASTER_BRIEFING.md §3.
grant select on public.subscription_plans to anon;
grant select, insert, update, delete on public.subscription_plans to authenticated;
grant select, insert, update, delete on public.subscription_plans to service_role;

grant select on public.subscription_settings to anon;
grant select, insert, update, delete on public.subscription_settings to authenticated;
grant select, insert, update, delete on public.subscription_settings to service_role;
