import { useEffect, useRef, useState } from 'react';
import type { HelpTextMap } from './helpText';
import { setActiveHelpField } from './activeHelpField';

interface HelpIconProps {
  field: string;
  helpText: HelpTextMap;
}

const FALLBACK = 'No help text has been added for this field yet.';

/** A small "?" button next to a form field, showing that field's help text (from
 * public/help-text.csv) in a popover on click. Placed inline right after a <label>'s own text,
 * so it reads as part of the label rather than a separate control. */
export default function HelpIcon({ field, helpText }: HelpIconProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  // Reports this field as the current F1 "edit this help text" target (App.tsx, supervisor-only)
  // for exactly as long as this popover is open -- same mechanism Tooltip.tsx/menuTooltip.tsx use.
  useEffect(() => {
    if (!open) return;
    setActiveHelpField(field);
    return () => setActiveHelpField(null);
  }, [open, field]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <span className="help-icon-wrapper" ref={wrapperRef}>
      <button
        type="button"
        className="help-icon"
        aria-label="Help for this field"
        onClick={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
      >
        ?
      </button>
      {open && (
        <div className="help-popover">
          {helpText[field]?.helpText?.trim() || FALLBACK}
          {helpText[field]?.videoUrl && (
            <a
              href={helpText[field].videoUrl}
              target="_blank"
              rel="noreferrer"
              className="help-popover-video-link"
              onClick={(e) => e.stopPropagation()}
            >
              ▶ Watch video
            </a>
          )}
        </div>
      )}
    </span>
  );
}
