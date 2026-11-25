// Supabase Edge Function: stripe-webhook
//
// Stage C3 piece (e): the only thing allowed to ever move subscriptions.plan_key
// away from 'free' -- Stripe calls this the moment a Checkout Session actually
// completes (payment accepted), and this function verifies the call genuinely
// came from Stripe (via the signing secret below) before touching anything.
//
// Listens for one event type for now: checkout.session.completed. Renewal and
// cancellation handling (customer.subscription.updated / .deleted) is Stage C4,
// not built yet -- deliberately out of scope here.
//
// No Supabase auth on this endpoint at all -- Stripe calls it directly, with no
// Supabase session to present. "Verify JWT with legacy secret" MUST be turned
// off for this function. Unlike create-checkout-session (where that was just
// Supabase's own recommendation for a function with custom auth logic), here
// it's a hard requirement: a Stripe call carries no Supabase JWT at all, so
// leaving verification on would make Supabase reject every delivery before
// this code ever runs.
//
// Needs one new secret: STRIPE_WEBHOOK_SECRET (the "Signing secret" Stripe
// shows once, the moment the endpoint is registered in its dashboard).

import Stripe from 'npm:stripe@17.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  httpClient: Stripe.createFetchHttpClient(),
});

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

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
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.supabase_user_id;
      const planKey = session.metadata?.plan_key;
      const subscriptionId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;

      if (!userId || !planKey) {
        // Acknowledge with 200 anyway -- this is a malformed/unexpected session, not a delivery
        // failure, and returning an error here would just make Stripe retry the same thing forever.
        console.error('stripe-webhook: checkout.session.completed missing metadata', session.id);
        return new Response('ok', { status: 200 });
      }

      let currentPeriodEnd: string | null = null;
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const adminClient = createClient(supabaseUrl, serviceRoleKey);

      const { error } = await adminClient
        .from('subscriptions')
        .update({
          plan_key: planKey,
          stripe_subscription_id: subscriptionId,
          stripe_customer_id: customerId,
          current_period_end: currentPeriodEnd,
          status: 'active',
        })
        .eq('user_id', userId);

      if (error) {
        console.error('stripe-webhook: failed to update subscriptions row', error);
        return new Response('Database update failed', { status: 500 });
      }
    }

    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('stripe-webhook error:', err);
    return new Response('Internal error', { status: 500 });
  }
});
