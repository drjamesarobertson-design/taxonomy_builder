import { useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import type { HelpTextMap } from './helpText';

interface TooltipProps {
  /** Looked up in `helpText` for its wording — the usual case, every toolbar button. */
  field?: string;
  helpText?: HelpTextMap;
  /** Fixed wording that isn't meant to be edited via help-text.csv (e.g. the logo's own
   * explanation) — takes precedence over `field`/`helpText` when given. */
  text?: string;
  videoUrl?: string;
  /** Extra class for the popup itself — e.g. a wider variant for a longer fixed text. */
  popupClassName?: string;
  children: ReactElement;
}

interface Position {
  top: number;
  left: number;
}

// James's ask: a proper, professionally-styled hover tooltip on every toolbar button (this
// component) and right-click menu item (menuTooltip.ts's lighter event-based variant, for the
// much larger number of <li> menu items) — replacing plain browser title="" tooltips, which
// can't be styled at all. Both read from the exact same help-text.csv data as the existing "?"
// HelpIcon on the setup screens (helpText.ts), so a field only ever needs its text written once;
// a field with no CSV row yet still renders its child normally, just with no tooltip attached
// (nothing to show), rather than a placeholder — safe to wire onto every button today and have
// James fill in the wording afterward at his own pace.
//
// Portalled to document.body and positioned via a measured, viewport-clamped inline style
// (position: fixed) rather than plain CSS anchored to the hovered element — James's report: a
// CSS-anchored popup got clipped by the Library sidebar's own scroll container, and ran off the
// right edge of the screen entirely near the window's edge (the logo). Clamping in JS, after the
// popup has actually mounted so its real rendered width is known, fixes both.
export default function Tooltip({ field, helpText, text, videoUrl, popupClassName, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const popupRef = useRef<HTMLSpanElement>(null);

  const entryText = (text ?? (field ? helpText?.[field]?.helpText : undefined))?.trim();
  const entryVideoUrl = videoUrl ?? (field ? helpText?.[field]?.videoUrl : undefined);
  const show = visible && !!entryText;

  useLayoutEffect(() => {
    if (!show) {
      setPosition(null);
      return;
    }
    const wrapper = wrapperRef.current;
    const popup = popupRef.current;
    if (!wrapper || !popup) return;
    const wrapperRect = wrapper.getBoundingClientRect();
    const popupWidth = popup.getBoundingClientRect().width;
    const overflowsRight = wrapperRect.left + popupWidth > window.innerWidth - 8;
    setPosition({
      top: wrapperRect.bottom + 6,
      left: overflowsRight ? Math.max(8, wrapperRect.right - popupWidth) : wrapperRect.left,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  return (
    <span
      ref={wrapperRef}
      className="app-tooltip-wrapper"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {show &&
        createPortal(
          <span
            ref={popupRef}
            className={`app-tooltip-popup${popupClassName ? ` ${popupClassName}` : ''}`}
            style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? 'visible' : 'hidden' }}
            role="tooltip"
          >
            {entryText}
            {entryVideoUrl && (
              <a
                href={entryVideoUrl}
                target="_blank"
                rel="noreferrer"
                className="app-tooltip-video-link"
                onClick={(e) => e.stopPropagation()}
              >
                ▶ Watch video
              </a>
            )}
          </span>,
          document.body,
        )}
    </span>
  );
}
