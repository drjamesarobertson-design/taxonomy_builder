import logoSrc from './assets/erp-doctor-logo.png';
import Tooltip from './Tooltip';

// James's own wording, fixed content rather than something he'd edit via help-text.csv, so it's
// kept right here rather than routed through the help-text system -- and shown everywhere the
// logo appears (App.tsx's toolbar, Login.tsx, ResetPassword.tsx), pre-login screens included.
const LOGO_TOOLTIP =
  'Logo represents strategy (the right things) horizontally and tactics (doing things right) ' +
  'vertically. By doing the right things well (top right) an organization will thrive -- The ' +
  'ERP Doctor assists clients to thrive through the effective application of Business ' +
  'Information Systems, especially ERP.';

export default function Logo({ className }: { className?: string }) {
  return (
    <Tooltip text={LOGO_TOOLTIP} popupClassName="app-tooltip-popup-logo">
      <img className={className} src={logoSrc} alt="The ERP Doctor logo" tabIndex={0} />
    </Tooltip>
  );
}
