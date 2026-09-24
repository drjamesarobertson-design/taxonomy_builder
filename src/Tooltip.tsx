import { useState, type ReactElement } from 'react';
import type { HelpTextMap } from './helpText';

interface TooltipProps {
  field: string;
  helpText: HelpTextMap;
  children: ReactElement;
}

// James's ask: a proper, professionally-styled hover tooltip on every toolbar button (this
// component) and right-click menu item (menuTooltip.ts's lighter event-based variant, for the
// much larger number of <li> menu items) — replacing plain browser title="" tooltips, which
// can't be styled at all. Both read from the exact same help-text.csv data as the existing "?"
// HelpIcon on the setup screens (helpText.ts), so a field only ever needs its text written once;
// a field with no CSV row yet still renders its child normally, just with no tooltip attached
// (nothing to show), rather than a placeholder — safe to wire onto every button today and have
// James fill in the wording afterward at his own pace.
export default function Tooltip({ field, helpText, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const entry = helpText[field];

  return (
    <span
      className="app-tooltip-wrapper"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && entry?.helpText?.trim() && (
        <span className="app-tooltip-popup" role="tooltip">
          {entry.helpText.trim()}
          {entry.videoUrl && (
            <a
              href={entry.videoUrl}
              target="_blank"
              rel="noreferrer"
              className="app-tooltip-video-link"
              onClick={(e) => e.stopPropagation()}
            >
              ▶ Watch video
            </a>
          )}
        </span>
      )}
    </span>
  );
}
