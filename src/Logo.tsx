// A recreation of the ERP Doctor mark: four slanted parallelograms in a pinwheel
// arrangement (top-left cell deliberately left empty), rendered as SVG so it stays crisp
// at any size instead of depending on a raster image asset.
export default function Logo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 104 88"
      role="img"
      aria-label="The ERP Doctor logo"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="erpdoc-logo-br" x1="0%" y1="0%" x2="60%" y2="100%">
          <stop offset="0%" stopColor="#3E7BE0" />
          <stop offset="100%" stopColor="#123A80" />
        </linearGradient>
      </defs>
      {/* top-right */}
      <polygon points="62,0 102,0 86,40 46,40" fill="#1660D1" />
      {/* bottom-left */}
      <polygon points="16,46 56,46 40,86 0,86" fill="#0A1440" />
      {/* bottom-right */}
      <polygon points="62,46 102,46 86,86 46,86" fill="url(#erpdoc-logo-br)" />
    </svg>
  );
}
