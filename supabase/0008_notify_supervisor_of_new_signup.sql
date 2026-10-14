-- One-time setup: James's ask (2026-10-14) -- an email to jamesar@jar-and-a.com every time
-- someone registers for Taxonomy Builder, so he doesn't have to go looking in Supabase's own
-- Users list to notice a new sign-up.
--
-- This is a SEPARATE trigger from 0001's on_auth_user_created (which copies the new user into
-- public.profiles) -- both fire on the same auth.users insert; this one doesn't touch that one.
--
-- Sends via Resend's own HTTP API directly from Postgres (pg_net -- an async, non-blocking HTTP
-- call; it queues the request and returns immediately, so a slow or failed send can never delay
-- or break someone's sign-up). Reuses the exact same Resend account/sending domain already
-- confirmed working for auth emails (MASTER_BRIEFING.md section 4) -- no new provider, no new
-- API key to generate, just a second use of the one already in place.
--
-- *** IMPORTANT -- run this FIRST, before the migration below, and do NOT commit your real API
-- key anywhere (not in this file, not in chat) ***: store the Resend API key in Supabase Vault,
-- a built-in, encrypted secret store separate from ordinary tables -- never put a real secret
-- directly in a SQL file that ends up committed to the repo. In Supabase's SQL Editor, run (with
-- YOUR_RESEND_API_KEY replaced by the actual key, the same "re_..." one already set up as
-- Custom SMTP's password):
--
--   select vault.create_secret('YOUR_RESEND_API_KEY', 'resend_api_key');
--
-- Then run the migration below. Safe to re-run (every statement is idempotent) -- re-running it
-- does NOT need the vault step repeated.

create extension if not exists pg_net;

create or replace function public.notify_supervisor_of_new_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  api_key text;
begin
  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  -- Vault step not done yet, or the secret got removed -- skip silently rather than ever
  -- blocking or erroring a real sign-up over a missing notification.
  if api_key is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || api_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'from', 'noreply@the-erp-doctor.com',
      'to', 'jamesar@jar-and-a.com',
      'subject', 'New Taxonomy Builder sign-up: ' || new.email,
      'text',
        'A new user has registered for Taxonomy Builder.' || chr(10) || chr(10) ||
        'Email: ' || new.email || chr(10) ||
        'Name: ' || coalesce(new.raw_user_meta_data ->> 'full_name', '(not given)') || chr(10) ||
        'Company: ' || coalesce(new.raw_user_meta_data ->> 'company_name', '(not given)') || chr(10) ||
        'Mobile: ' || coalesce(new.raw_user_meta_data ->> 'mobile_number', '(not given)') || chr(10) ||
        'Signed up at: ' || new.created_at
    )
  );
  return new;
end;
$$;

drop trigger if exists notify_supervisor_of_new_signup on auth.users;
create trigger notify_supervisor_of_new_signup
  after insert on auth.users
  for each row execute function public.notify_supervisor_of_new_signup();
