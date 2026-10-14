// James's ask (2026-10-14): a supervisor-only panel on the landing menu listing anyone who's
// signed up since he last checked — an in-app alternative to the outbound Resend email (0008),
// which proved hard to confirm/debug. Shown underneath "Resume Work in Progress" on the same
// landing screen, same dismiss-and-it-stays-gone convention (App.tsx tracks the dismiss as "seen
// up to this point in time", not just a one-render hide).
import type { SignupRecord } from './signups';

interface NewSignupsBannerProps {
  signups: SignupRecord[];
  onDismiss: () => void;
}

export default function NewSignupsBanner({ signups, onDismiss }: NewSignupsBannerProps) {
  if (signups.length === 0) return null;
  return (
    <div className="new-signups-banner">
      <div className="new-signups-banner-header">
        <strong>
          {signups.length} new sign-up{signups.length === 1 ? '' : 's'} since you last checked
        </strong>
        <button type="button" className="new-signups-banner-dismiss" onClick={onDismiss} aria-label="Dismiss">
          ✕
        </button>
      </div>
      <ul className="new-signups-banner-list">
        {signups.map((s) => (
          <li key={s.id}>
            <strong>{s.fullName || '(name not given)'}</strong> — {s.email || '(no email)'}
            {s.companyName && <> · {s.companyName}</>}
            {s.mobileNumber && <> · {s.mobileNumber}</>}
            <span className="new-signups-banner-date"> · {new Date(s.createdAt).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
