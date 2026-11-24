// Supabase Edge Function: create-checkout-session
//
// Called by the app when a signed-in user clicks "Upgrade" to a paid tier. Creates (or reuses) a
// Stripe Customer tied to this account, then a Stripe Checkout Session for the requested plan's
// Price (Monthly only works today -- Annual isn't live yet, see subscription_settings.annual_
// billing_enabled -- so billing_period is accepted but anything other than a configured monthly
// Price ID is rejected with a clear error), and returns the Checkout URL for the frontend to
// redirect the browser to.
//
// Deploy: Supabase Dashboard -> Edge Functions -> deploy a new function named
// "create-checkout-session" -> paste this file's contents -> deploy. The exact click-path may
// differ from what's described here if Supabase's own UI has moved things around since this was
// written (it has before, for both Stripe and Supabase in this project) -- if so, tell Claude what
// you actually see and it'll adapt, same as every other step so far.
//
// Needs exactly one secret already configured (Project Settings -> Edge Functions -> Secrets,
// done 2026-11-24): STRIPE_SECRET_KEY. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided
// automatically to every Edge Function by Supabase itself -- nothing to add for those. This
// function also reads the caller's own anon/publishable key from its environment -- Supabase
// auto-injects this as SUPABASE_ANON_KEY (the older name for what the dashboard itself now calls
// the "publishable" key, same distinction noted in src/supabaseClient.ts); if a future Supabase
// change ever renames the injected variable too, SUPABASE_PUBLISHABLE_KEY is tried as a fallback.
//
// Never grants a paid plan itself -- that only ever happens via the separate webhook function
// (a later Stage C3 piece), once Stripe actually confirms payment. This function's only job is to
// start a Checkout Session; the plan_key on `subscriptions` stays whatever it already was until
// the webhook says otherwise -- deliberately, so nothing in the regular app flow can self-grant a
// paid tier (see supabase/0011_create_subscriptions.sql).

import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17.5.0';

// apiVersion is deliberately left unset -- it pins to whatever this exact SDK release's own
// built-in default is, rather than this file guessing a specific Stripe API version string that
// could go stale.
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  httpClient: Stripe.createFetchHttpClient(),
});

// The live app's own URL -- same one everything else in this repo points at (e.g.
// src/supabaseClient.ts hardcodes its own project URL the same way, not as a secret). Stripe
// sends the browser back here after Checkout succeeds or is cancelled.
const APP_URL = 'https://drjamesarobertson-design.github.io/taxonomy_builder/';

const PAID_PLAN_KEYS = new Set(['basic', 'advanced', 'enterprise']);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { plan_key, billing_period } = await req.json();

    if (!PAID_PLAN_KEYS.has(plan_key)) {
      return jsonResponse({ error: 'plan_key must be one of basic, advanced, enterprise.' }, 400);
    }
    const period = billing_period === 'annual' ? 'annual' : 'monthly';

    // Identify the caller from their own session -- the frontend's normal, signed-in Supabase
    // client passes this through automatically as the request's Authorization header.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Not signed in.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: 'Not signed in.' }, 401);

    // A service-role client for the two things the signed-in user's own client is deliberately
    // never allowed to do (see supabase/0011_create_subscriptions.sql's RLS): writing to
    // `subscriptions` at all, even their own row.
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: plan, error: planError } = await adminClient
      .from('subscription_plans')
      .select('stripe_price_id_monthly, stripe_price_id_annual, display_name')
      .eq('plan_key', plan_key)
      .single();
    if (planError || !plan) return jsonResponse({ error: 'Unknown plan.' }, 400);

    const priceId = period === 'annual' ? plan.stripe_price_id_annual : plan.stripe_price_id_monthly;
    if (!priceId) {
      return jsonResponse(
        { error: `No Stripe price is configured yet for ${plan.display_name} (${period}).` },
        400,
      );
    }

    const { data: subscription, error: subError } = await adminClient
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();
    if (subError || !subscription) {
      return jsonResponse({ error: 'No subscription record for this account.' }, 500);
    }

    let customerId = subscription.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await adminClient.from('subscriptions').update({ stripe_customer_id: customerId }).eq('user_id', user.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${APP_URL}?checkout=success`,
      cancel_url: `${APP_URL}?checkout=cancelled`,
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id, plan_key, billing_period: period },
      // Carried onto the resulting Stripe Subscription object itself too, not just this one
      // Checkout Session -- the webhook mainly reacts to subscription events, so having
      // supabase_user_id directly there means it never has to cross-reference the session.
      subscription_data: {
        metadata: { supabase_user_id: user.id, plan_key, billing_period: period },
      },
    });

    return jsonResponse({ url: session.url });
  } catch (err) {
    console.error('create-checkout-session error:', err);
    return jsonResponse({ error: 'Something went wrong starting checkout. Please try again.' }, 500);
  }
});
