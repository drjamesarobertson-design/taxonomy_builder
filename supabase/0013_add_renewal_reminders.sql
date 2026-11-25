-- One-time setup: Stage C4 -- staged renewal reminder emails, per James's spec
-- (MASTER_BRIEFING.md section 4): one month out, one week out, one day out, an expired notice,
-- then a single follow-up nudge if still unrenewed, each sent through the same Resend account
-- already confirmed working for auth emails and the new-signup notification (supabase/0008).
--
-- Reuses 0008's exact pattern: pg_net for a non-blocking async HTTP call to Resend's API, and
-- the same 'resend_api_key' secret already stored in Supabase Vault -- no new provider, no new
-- API key, no Edge Function needed for sending (this runs entirely as a scheduled SQL function).
--
-- last_reminder_stage records the most advanced stage already sent for the current billing
-- period, so a daily run never re-sends one. The stripe-webhook function resets it to null
-- whenever current_period_end moves forward (a successful renewal) or a subscription is
-- cancelled, so each new period/subscription starts its own reminder trail from scratch.
--
-- Run this once, in Supabase's SQL Editor. Safe to re-run (every statement is idempotent,
-- including the cron.schedule call -- it unschedules any existing job of the same name first).

create extension if not exists pg_cron;

alter table public.subscriptions
  add column if not exists last_reminder_stage text;

create or replace function public.send_subscription_renewal_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  api_key text;
  rec record;
  days_left integer;
  target_stage text;
  target_rank integer;
  last_rank integer;
  subject text;
  body_text text;
begin
  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  -- Same safety rule as 0008: skip silently rather than ever erroring this scheduled job over a
  -- missing secret.
  if api_key is null then
    return;
  end if;

  for rec in
    select s.user_id, s.plan_key, s.current_period_end, s.last_reminder_stage, u.email
    from public.subscriptions s
    join auth.users u on u.id = s.user_id
    where s.plan_key <> 'free' and s.current_period_end is not null
  loop
    days_left := (rec.current_period_end::date - current_date);

    if days_left < -7 then
      continue; -- more than a week past expiry: the one follow-up nudge already covered this
    elsif days_left < 0 then
      target_stage := 'followup';
    elsif days_left = 0 then
      target_stage := 'expired';
    elsif days_left <= 1 then
      target_stage := '1d';
    elsif days_left <= 7 then
      target_stage := '7d';
    elsif days_left <= 30 then
      target_stage := '30d';
    else
      continue; -- more than 30 days out: nothing due yet
    end if;

    target_rank := case target_stage
      when '30d' then 1 when '7d' then 2 when '1d' then 3 when 'expired' then 4 when 'followup' then 5
    end;
    last_rank := case rec.last_reminder_stage
      when '30d' then 1 when '7d' then 2 when '1d' then 3 when 'expired' then 4 when 'followup' then 5
      else 0
    end;
    if target_rank <= last_rank then
      continue; -- this stage (or a later one) was already sent for the current period
    end if;

    case target_stage
      when '30d' then
        subject := 'Your Taxonomy Builder subscription renews in 30 days';
        body_text := 'This is a reminder that your Taxonomy Builder subscription is due to renew in about 30 days, on ' || rec.current_period_end::date || '.' || chr(10) || chr(10) ||
          'No action is needed if you''d like it to continue -- it will renew automatically.';
      when '7d' then
        subject := 'Your Taxonomy Builder subscription renews in 7 days';
        body_text := 'This is a reminder that your Taxonomy Builder subscription is due to renew in about 7 days, on ' || rec.current_period_end::date || '.' || chr(10) || chr(10) ||
          'No action is needed if you''d like it to continue -- it will renew automatically.';
      when '1d' then
        subject := 'Your Taxonomy Builder subscription renews tomorrow';
        body_text := 'This is a reminder that your Taxonomy Builder subscription renews tomorrow, ' || rec.current_period_end::date || '.' || chr(10) || chr(10) ||
          'No action is needed if you''d like it to continue -- it will renew automatically.';
      when 'expired' then
        subject := 'Your Taxonomy Builder subscription has expired';
        body_text := 'Your Taxonomy Builder subscription expired today, ' || rec.current_period_end::date || '.' || chr(10) || chr(10) ||
          'Sign in and visit the Pricing page to renew and keep access to your account.';
      when 'followup' then
        subject := 'Your Taxonomy Builder subscription is still unrenewed';
        body_text := 'Your Taxonomy Builder subscription expired on ' || rec.current_period_end::date || ' and hasn''t been renewed yet.' || chr(10) || chr(10) ||
          'Sign in and visit the Pricing page whenever you''d like to pick it back up.';
    end case;

    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || api_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'from', 'noreply@the-erp-doctor.com',
        'to', rec.email,
        'subject', subject,
        'text', body_text
      )
    );

    update public.subscriptions set last_reminder_stage = target_stage where user_id = rec.user_id;
  end loop;
end;
$$;

-- Runs once daily at 08:00 UTC. unschedule first so re-running this migration doesn't create a
-- second, duplicate job.
select cron.unschedule('send-subscription-renewal-reminders')
where exists (select 1 from cron.job where jobname = 'send-subscription-renewal-reminders');

select cron.schedule(
  'send-subscription-renewal-reminders',
  '0 8 * * *',
  $$select public.send_subscription_renewal_reminders();$$
);
