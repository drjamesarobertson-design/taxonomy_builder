-- One-time setup: two new nullable columns on subscription_plans (0010) to hold the Stripe Price
-- ID that actually charges for each tier/billing-period combination -- kept alongside the rest of
-- the tier config, same "live editable data, not hardcoded" philosophy as everything else there,
-- rather than e.g. a separate lookup hardcoded into the Edge Function itself.
--
-- Both columns start empty. Free and Beta never need one (nothing to charge). The three paid
-- tiers' *_monthly columns need to be filled in by hand, once, with the real Price IDs from the
-- Stripe Product catalog (Stripe Dashboard -> Product catalog -> click into each paid product ->
-- copy its Price ID, looks like "price_1AbCdEfGhIjKlMnO") -- a short follow-up UPDATE statement,
-- not part of this file, since the actual IDs aren't known yet. The *_annual columns stay null
-- until Annual billing actually goes live (subscription_settings.annual_billing_enabled) and its
-- own Price objects get created in Stripe.
--
-- Run this once, in Supabase's SQL Editor. Safe to re-run (every statement is idempotent).

alter table public.subscription_plans
  add column if not exists stripe_price_id_monthly text,
  add column if not exists stripe_price_id_annual text;
