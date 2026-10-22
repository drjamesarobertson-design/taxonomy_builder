import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HelpTextMap } from './helpText';
import { setActiveHelpField } from './activeHelpField';

interface HelpIconProps {
  field: string;
  helpText: HelpTextMap;
}

interface Position {
  top: number;
  left: number;
}

const FALLBACK = 'No help text has been added for this field yet.';

/** A small "?" button next to a form field, showing that field's help text (from
 * public/help-text.csv) in a popover on click. Placed inline right after a <label>'s own text,
 * so it reads as part of the label rather than a separate control.
 *
 * James's report (2026-10-22): on the Export Format Choice dialog, where the icon sits mid-title
 * in a fairly narrow dialog, the popover ran off the dialog's own right edge and got truncated --
 * it used to be plain CSS (position: absolute, left: 0 relative to the icon), which only ever
 * worked by coincidence in every other dialog this appears in (wide forms, icon near the left).
 * Portalled to document.body and positioned via a measured, viewport-clamped inline style
 * instead, same technique already fixed the equivalent overflow for Tooltip.tsx. */
export default function HelpIcon({ field, helpText }: HelpIconProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

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
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node) &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
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

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const wrapper = wrapperRef.current;
    const popover = popoverRef.current;
    if (!wrapper || !popover) return;
    const wrapperRect = wrapper.getBoundingClientRect();
    const popoverWidth = popover.getBoundingClientRect().width;
    const overflowsRight = wrapperRect.left + popoverWidth > window.innerWidth - 8;
    setPosition({
      top: wrapperRect.bottom + 4,
      left: overflowsRight ? Math.max(8, wrapperRect.right - popoverWidth) : wrapperRect.left,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className="help-popover"
            style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? 'visible' : 'hidden' }}
          >
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
          </div>,
          document.body,
        )}
    </span>
  );
}
