import { useState } from 'react';
import logoSrc from './assets/erp-doctor-logo.png';

// James's own wording, fixed content rather than something he'd edit via help-text.csv, so it's
// kept right here rather than routed through the help-text system -- and shown everywhere the
// logo appears (App.tsx's toolbar, Login.tsx, ResetPassword.tsx), pre-login screens included,
// without needing helpText threaded into those.
const LOGO_TOOLTIP =
  'Logo represents strategy (the right things) horizontally and tactics (doing things right) ' +
  'vertically. By doing the right things well (top right) an organization will thrive -- The ' +
  'ERP Doctor assists clients to thrive through the effective application of Business ' +
  'Information Systems, especially ERP.';

export default function Logo({ className }: { className?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <span
      className="app-tooltip-wrapper"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      <img className={className} src={logoSrc} alt="The ERP Doctor logo" tabIndex={0} />
      {visible && (
        <span className="app-tooltip-popup app-tooltip-popup-logo" role="tooltip">
          {LOGO_TOOLTIP}
        </span>
      )}
    </span>
  );
}
