interface PricingPageProps {
  onClose: () => void;
  /** Shown on the Free tier's own button once signed out (routes straight into Create Account)
   * — omitted once already signed in, where there's nothing useful for it to do. */
  onCreateAccount?: () => void;
}

interface Tier {
  name: string;
  price: string;
  tagline: string;
  features: string[];
  cta: string;
  onCta?: () => void;
  highlight?: boolean;
}

// James's ask: a pricing page for the commercial launch, proposing three tiers -- his own Free
// sketch (3 columns, 50 rows, 5 taxonomies, read-only Library, no Lock), plus two paid tiers
// scaling up from there ("what do you think would be a good three tier model"). These are a
// DRAFT for review, not live commitments -- there is no working checkout behind the paid tiers
// yet (Stripe isn't wired up), so their buttons say so plainly rather than pretending a purchase
// flow exists. Reachable from the Login screen (pre-signup) and, once signed in, from the
// landing menu, so an existing Free user can see what upgrading would unlock.
export default function PricingPage({ onClose, onCreateAccount }: PricingPageProps) {
  const tiers: Tier[] = [
    {
      name: 'Free',
      price: '$0',
      tagline: 'Try the tool for real, on a real (small) taxonomy.',
      features: [
        'Up to 3 code columns (levels)',
        'Up to 50 rows',
        'Up to 5 taxonomies in your Library',
        'Library entries are read-only once saved',
        'CSV import and export',
        'Lock Taxonomy not available',
      ],
      cta: onCreateAccount ? 'Create Free Account' : 'Your Current Plan',
      onCta: onCreateAccount,
    },
    {
      name: 'Professional',
      price: '$19/mo',
      tagline: 'Full-depth taxonomies, ready for production.',
      features: [
        'Up to 8 code columns (the standard full depth)',
        'Up to 500 rows',
        'Up to 25 taxonomies in your Library',
        'Full Library — save, edit and reorganise freely',
        'Lock Taxonomy, CSV and Excel export',
        'HDD Folders — create real folders from your taxonomy',
      ],
      cta: 'Coming Soon',
      highlight: true,
    },
    {
      name: 'Enterprise',
      price: '$79/mo',
      tagline: 'Unlimited scale, plus the Cubic Business Model tools.',
      features: [
        'Up to 15 code columns (the app maximum)',
        'Unlimited rows',
        'Unlimited taxonomies in your Library',
        'Everything in Professional',
        'GL Builder and Cubic Business Model tables',
        'Priority support',
      ],
      cta: 'Contact Us',
    },
  ];

  return (
    <div className="validation-overlay" onClick={onClose}>
      <div className="validation-dialog pricing-page" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="help-page-header">
          <h2>Pricing</h2>
          <button type="button" className="help-page-close" onClick={onClose} aria-label="Close pricing">
            ×
          </button>
        </div>
        <p className="pricing-page-note">
          Proposed pricing — under review, not yet final. Paid tiers aren't purchasable yet.
        </p>
        <div className="pricing-tiers">
          {tiers.map((tier) => (
            <div className={`pricing-tier${tier.highlight ? ' pricing-tier-highlight' : ''}`} key={tier.name}>
              <h3>{tier.name}</h3>
              <p className="pricing-tier-price">{tier.price}</p>
              <p className="pricing-tier-tagline">{tier.tagline}</p>
              <ul className="pricing-tier-features">
                {tier.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <button type="button" className="pricing-tier-cta" onClick={tier.onCta} disabled={!tier.onCta}>
                {tier.cta}
              </button>
            </div>
          ))}
        </div>
        <div className="confirm-dialog-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
