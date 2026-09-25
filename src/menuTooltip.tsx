import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HelpTextMap } from './helpText';

interface MenuTooltipState {
  field: string;
  anchorTop: number;
  anchorLeft: number;
  anchorRight: number;
}

interface Position {
  top: number;
  left: number;
}

// The right-click menus (Grid.tsx's code/description/suffix menus, LibrarySidebar.tsx's own)
// run to 60+ items between them — wrapping every single <li> in its own <Tooltip> (App.tsx's
// toolbar buttons, a much smaller and structurally simpler set) would mean touching the JSX
// tree at every single item. This gives the same professionally-styled popup (same CSS class as
// Tooltip.tsx) from just two extra props on each existing <li> — onMouseEnter={showTooltip
// ('fieldKey')} onMouseLeave={hideTooltip} — plus one <MenuTooltipPortal> rendered once per
// menu component.
export function useMenuTooltip() {
  const [tooltip, setTooltip] = useState<MenuTooltipState | null>(null);

  function showTooltip(field: string) {
    return (e: React.MouseEvent<HTMLElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({ field, anchorTop: rect.top, anchorLeft: rect.left, anchorRight: rect.right });
    };
  }

  function hideTooltip() {
    setTooltip(null);
  }

  return { tooltip, showTooltip, hideTooltip };
}

// Normally opens just to the right of the hovered <li>; if that would run off the right edge of
// the screen (a menu sitting near the window's own edge), opens to its left instead — same
// viewport-clamping approach as Tooltip.tsx, and for the same reason (James's report of tooltips
// running off the edge of the screen uncorrected).
export function MenuTooltipPortal({ tooltip, helpText }: { tooltip: MenuTooltipState | null; helpText: HelpTextMap }) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const entry = tooltip ? helpText[tooltip.field] : undefined;
  const text = entry?.helpText?.trim();

  useLayoutEffect(() => {
    if (!tooltip || !text || !popupRef.current) {
      setPosition(null);
      return;
    }
    const popupWidth = popupRef.current.getBoundingClientRect().width;
    const overflowsRight = tooltip.anchorRight + 8 + popupWidth > window.innerWidth - 8;
    setPosition({
      top: tooltip.anchorTop,
      left: overflowsRight ? Math.max(8, tooltip.anchorLeft - popupWidth - 8) : tooltip.anchorRight + 8,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tooltip, text]);

  if (!tooltip || !text) return null;
  return createPortal(
    <div
      ref={popupRef}
      className="app-tooltip-popup"
      style={{
        top: position?.top ?? tooltip.anchorTop,
        left: position?.left ?? tooltip.anchorRight + 8,
        visibility: position ? 'visible' : 'hidden',
      }}
      role="tooltip"
    >
      {text}
      {entry?.videoUrl && (
        <a href={entry.videoUrl} target="_blank" rel="noreferrer" className="app-tooltip-video-link">
          ▶ Watch video
        </a>
      )}
    </div>,
    document.body,
  );
}
