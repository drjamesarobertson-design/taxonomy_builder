import logoSrc from './assets/erp-doctor-logo.png';

export default function Logo({ className }: { className?: string }) {
  return <img className={className} src={logoSrc} alt="The ERP Doctor logo" />;
}
