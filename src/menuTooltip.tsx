import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { HelpTextMap } from './helpText';

interface MenuTooltipState {
  field: string;
  x: number;
  y: number;
}

// The right-click menus (Grid.tsx's code/description/suffix menus, LibrarySidebar.tsx's own)
// run to 60+ items between them — wrapping every single <li> in its own <Tooltip> (App.tsx's
// toolbar buttons, a much smaller and structurally simpler set) would mean touching the JSX
// tree at every single item. This gives the same professionally-styled popup (same CSS classes
// as Tooltip.tsx) from just two extra props on each existing <li> — onMouseEnter={showTooltip
// ('fieldKey')} onMouseLeave={hideTooltip} — plus one <MenuTooltipPortal> rendered once per
// menu component.
export function useMenuTooltip() {
  const [tooltip, setTooltip] = useState<MenuTooltipState | null>(null);

  function showTooltip(field: string) {
    return (e: React.MouseEvent<HTMLElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({ field, x: rect.right + 8, y: rect.top });
    };
  }

  function hideTooltip() {
    setTooltip(null);
  }

  return { tooltip, showTooltip, hideTooltip };
}

export function MenuTooltipPortal({ tooltip, helpText }: { tooltip: MenuTooltipState | null; helpText: HelpTextMap }) {
  if (!tooltip) return null;
  const entry = helpText[tooltip.field];
  if (!entry?.helpText?.trim()) return null;
  return createPortal(
    <div
      className="app-tooltip-popup app-tooltip-popup-menu"
      style={{ position: 'fixed', left: tooltip.x, top: tooltip.y }}
      role="tooltip"
    >
      {entry.helpText.trim()}
      {entry.videoUrl && (
        <a href={entry.videoUrl} target="_blank" rel="noreferrer" className="app-tooltip-video-link">
          ▶ Watch video
        </a>
      )}
    </div>,
    document.body,
  );
}
