import { useState } from 'react';
import Logo from './Logo';
import { startCheckout, type PaidPlanKey } from './checkout';
import type { PlanLimits } from './subscription';

interface ExpiredSubscriptionScreenProps {
  limits: PlanLimits;
  onLogOut: () => void;
}

// Stage D2: James's spec (MASTER_BRIEFING.md §4) -- on expiry, login is hard-blocked, no grace-
// period access, replaced by a clear "your subscription has expired -- renew here" screen. Shown
// in place of the entire app (App.tsx renders this instead of the normal app-shell) the moment
// subscription.ts's isExpired() is true -- there is no path around it other than renewing or
// signing out.
export default function ExpiredSubscriptionScreen({ limits, onLogOut }: ExpiredSubscriptionScreenProps) {
  const [renewing, setRenewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRenew() {
    setRenewing(true);
    setError(null);
    // Reuses the exact same Checkout flow as a first-time purchase -- Stripe treats it as a new
    // subscription for the same customer, which is enough to lift this block once the webhook
    // confirms payment (stripe-webhook's checkout.session.completed handler grants the plan and
    // clears last_reminder_stage the same way it does for any other purchase).
    const { error: checkoutError } = await startCheckout(limits.planKey as PaidPlanKey);
    if (checkoutError) {
      setError(checkoutError);
      setRenewing(false);
    }
    // On success the browser navigates away to Stripe Checkout -- nothing left to do here.
  }

  return (
    <div className="login-screen">
      <Logo className="login-logo" />
      <h1 className="login-heading">Subscription expired</h1>
      <p className="login-tagline">
        Your {limits.displayName} subscription expired on{' '}
        {limits.currentPeriodEnd ? new Date(limits.currentPeriodEnd).toLocaleDateString() : 'its renewal date'} and
        hasn't been renewed yet.
        <br />
        Renew to pick up exactly where you left off.
      </p>
      <div className="login-form">
        {error && <p className="login-error">{error}</p>}
        <button type="button" onClick={handleRenew} disabled={renewing}>
          {renewing ? 'Starting checkout…' : `Renew ${limits.displayName}`}
        </button>
      </div>
      <p className="login-switch-mode">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onLogOut();
          }}
        >
          Log Out
        </a>
      </p>
    </div>
  );
}
