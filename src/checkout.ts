// Calls the create-checkout-session Edge Function (Stage C3 piece (b)) and redirects the browser
// straight to the returned Stripe Checkout URL. Supabase's own client automatically attaches the
// signed-in user's session as the request's Authorization header, which is how that function
// identifies who's upgrading -- nothing extra to pass here for that.
import { supabase } from './supabaseClient';

export type PaidPlanKey = 'basic' | 'advanced' | 'enterprise';

export async function startCheckout(planKey: PaidPlanKey): Promise<{ error: string | null }> {
  const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>(
    'create-checkout-session',
    { body: { plan_key: planKey, billing_period: 'monthly' } },
  );
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  if (!data?.url) return { error: 'No checkout URL was returned.' };
  window.location.href = data.url;
  return { error: null };
}
