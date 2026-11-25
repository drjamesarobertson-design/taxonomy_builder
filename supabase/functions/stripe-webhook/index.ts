// Supabase Edge Function: stripe-webhook
//
// The only thing allowed to ever change subscriptions.plan_key, status or
// current_period_end -- verifies every call genuinely came from Stripe (via
// the signing secret below) before touching anything.
//
// Handles three event types:
// - checkout.session.completed (Stage C3 piece (e)) -- the initial purchase:
//   grants the purchased plan_key for the first time.
// - customer.subscription.updated (Stage C4) -- fires on every renewal
//   (successful or failed) and on any other change to the subscription
//   (e.g. a future upgrade/downgrade via Stripe's Billing Portal). Keeps
//   current_period_end and status in step with Stripe's own record, which
//   checkout.session.completed alone cannot do -- that event only ever
//   fires once, at the very first payment, never on later renewals.
// - customer.subscription.deleted (Stage C4) -- the subscription has fully
//   ended (cancelled, or Stripe gave up retrying a failed payment). Drops
//   the account back to the free plan.
//
// No Supabase auth on this endpoint at all -- Stripe calls it directly, with
// no Supabase session to present. "Verify JWT with legacy secret" MUST be
// turned off for this function: a Stripe call carries no Supabase JWT, so
// leaving verification on would make Supabase reject every delivery before
// this code ever runs.
//
// Needs one new secret beyond STRIPE_SECRET_KEY: STRIPE_WEBHOOK_SECRET (the
// "Signing secret" Stripe shows once, the moment the endpoint is registered
// in its dashboard).

import Stripe from 'npm:stripe@17.5.0';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  httpClient: Stripe.createFetchHttpClient(),
});

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

function adminClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, serviceRoleKey);
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.supabase_user_id;
  const planKey = session.metadata?.plan_key;
  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;

  if (!userId || !planKey) {
    // This is a malformed/unexpected session, not a delivery failure -- logged, not thrown, so
    // Stripe doesn't retry the same thing forever.
    console.error('stripe-webhook: checkout.session.completed missing metadata', session.id);
    return;
  }

  let currentPeriodEnd: string | null = null;
  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();
  }

  const { error } = await adminClient()
    .from('subscriptions')
    .update({
      plan_key: planKey,
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      current_period_end: currentPeriodEnd,
      status: 'active',
      last_reminder_stage: null,
    })
    .eq('user_id', userId);

  if (error) throw new Error(`Failed to update subscriptions row: ${error.message}`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.supabase_user_id;
  const planKey = subscription.metadata?.plan_key;
  const currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();

  const client = adminClient();

  // Match by user_id from metadata when present (the normal case -- every subscription this
  // app creates carries it, set in create-checkout-session's subscription_data.metadata).
  // Falls back to matching by stripe_subscription_id for the rare case metadata is missing
  // (e.g. a subscription created directly in Stripe's dashboard, bypassing our Checkout flow).
  const matchColumn = userId ? 'user_id' : 'stripe_subscription_id';
  const matchValue = userId ?? subscription.id;
  if (!userId) {
    console.error('stripe-webhook: customer.subscription.updated missing supabase_user_id metadata', subscription.id);
  }

  const { data: existing } = await client
    .from('subscriptions')
    .select('current_period_end')
    .eq(matchColumn, matchValue)
    .maybeSingle();

  // A later period end than what's already on record means a renewal payment just succeeded --
  // reset the reminder trail so the next cycle's reminders start fresh. Any other change (a
  // failed-payment status flip, a dashboard edit) leaves the trail as-is.
  const isRenewal = !existing?.current_period_end || new Date(currentPeriodEnd) > new Date(existing.current_period_end);

  const update: Record<string, unknown> = {
    current_period_end: currentPeriodEnd,
    status: subscription.status,
    stripe_subscription_id: subscription.id,
  };
  if (planKey) update.plan_key = planKey;
  if (isRenewal) update.last_reminder_stage = null;

  const { error } = await client.from('subscriptions').update(update).eq(matchColumn, matchValue);
  if (error) throw new Error(`Failed to update subscriptions row: ${error.message}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.supabase_user_id;
  const client = adminClient();

  const matchColumn = userId ? 'user_id' : 'stripe_subscription_id';
  const matchValue = userId ?? subscription.id;
  if (!userId) {
    console.error('stripe-webhook: customer.subscription.deleted missing supabase_user_id metadata', subscription.id);
  }

  const { error } = await client
    .from('subscriptions')
    .update({
      plan_key: 'free',
      status: 'canceled',
      current_period_end: null,
      last_reminder_stage: null,
    })
    .eq(matchColumn, matchValue);

  if (error) throw new Error(`Failed to update subscriptions row: ${error.message}`);
}

Deno.serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature');
  const body = await req.text();

  let event: Stripe.Event;
  try {
    if (!signature) throw new Error('Missing Stripe-Signature header.');
    // constructEventAsync (not constructEvent) -- Deno has no Node-style sync crypto,
    // and Stripe's SDK provides this async form specifically for edge runtimes.
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error('stripe-webhook signature verification failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(`Webhook signature verification failed: ${message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
    }
    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('stripe-webhook error:', err);
    return new Response('Internal error', { status: 500 });
  }
});
