import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export type AuditOrigin = 'standalone' | 'lock' | 'lockUpdates' | 'export-csv';
export type AuditStatus = 'checking' | 'clean' | 'issue' | 'resuming';

interface AuditPanelProps {
  status: AuditStatus;
  origin: AuditOrigin;
  /** 1-based position within the original issue count found when this audit run started. */
  currentIndex: number;
  originalTotal: number;
  message: string;
  /** Whether the current issue is one "Clear Error" jumps to a cell for (false), or one it
   * fixes immediately with no cell to jump to (true) — the button reads differently either
   * way, since there's nothing for the user to manually do in the second case. */
  isAutoFixable: boolean;
  /** Where App.tsx just scrolled/focused the current issue's cell to, in viewport coordinates —
   * null while there's no cell for this state (checking/clean/auto-fixable). James's report:
   * with the panel fixed at a single spot regardless of where the flagged row actually was, an
   * advance to a new issue (Resume Audit, Skip) updated the panel's text but nothing visibly
   * indicated where the new problem was — the panel re-anchors here on every new issue so it's
   * always near the actual error, not just wherever it happened to be dragged to for the last
   * one (the user can still drag it after that, same as before). */
  anchor: { top: number; left: number } | null;
  onClearError: () => void;
  onSkip: () => void;
  onExit: () => void;
  onResume: () => void;
  /** Only rendered for a clean result reached from the standalone Audit Taxonomy button —
   * Lock/Export-triggered audits handle their own "what next" step once clean (App.tsx). */
  onLockFromClean: () => void;
  onExportCsvFromClean: () => void;
}

const DEFAULT_POSITION = { top: 88, left: 900 };

// James's ask: unlike every other dialog in this app (either a centered modal or the sticky
// top message bar), the walkthrough needs to stay visible and out of the way while actively
// editing a cell that could be anywhere in a long taxonomy — "it is important that we make
// this as convenient as possible". A small floating panel the user can drag wherever suits
// them, re-anchoring near the actual flagged cell each time the current issue changes (`anchor`).
export default function AuditPanel({
  status,
  origin,
  currentIndex,
  originalTotal,
  message,
  isAutoFixable,
  anchor,
  onClearError,
  onSkip,
  onExit,
  onResume,
  onLockFromClean,
  onExportCsvFromClean,
}: AuditPanelProps) {
  const [position, setPosition] = useState(DEFAULT_POSITION);
  const dragState = useRef<{ startX: number; startY: number; startTop: number; startLeft: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Re-anchors to the new cell's position whenever App.tsx reports one (a fresh jump) — the
  // user's own drag (below) always wins until the NEXT jump, since this only fires on an actual
  // `anchor` change, not on every render. `position` has to stay independently mutable (drag),
  // so it can't just be derived from `anchor` during render — syncing external->local state on
  // a genuine prop change is exactly what an effect is for here (oxlint's set-state-in-effect
  // warning is expected and fine to leave — it doesn't support disabling this one inline).
  useEffect(() => {
    if (anchor) setPosition(anchor);
  }, [anchor]);

  function handleDragStart(e: ReactPointerEvent<HTMLDivElement>) {
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragState.current = { startX: e.clientX, startY: e.clientY, startTop: rect.top, startLeft: rect.left };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleDragMove(e: ReactPointerEvent<HTMLDivElement>) {
    const start = dragState.current;
    if (!start) return;
    const dx = e.clientX - start.startX;
    const dy = e.clientY - start.startY;
    setPosition({ top: Math.max(4, start.startTop + dy), left: Math.max(4, start.startLeft + dx) });
  }

  function handleDragEnd() {
    dragState.current = null;
  }

  const originLabel: Record<AuditOrigin, string> = {
    standalone: 'Audit Taxonomy',
    lock: 'Taxonomy Health Check',
    lockUpdates: 'Taxonomy Health Check',
    'export-csv': 'Taxonomy Health Check',
  };

  return (
    <div className="audit-panel" style={{ top: position.top, left: position.left }} ref={panelRef}>
      <div
        className="audit-panel-handle"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
        title="Drag to move"
      >
        <span className="audit-panel-drag-dots" aria-hidden="true">⠿</span> {originLabel[origin]}
      </div>
      <div className="audit-panel-body">
        {status === 'checking' && <p>Conducting Taxonomy Health Check…</p>}

        {status === 'clean' && (
          <>
            <p>Audit complete — no issues found. This taxonomy is ready to Lock.</p>
            {origin === 'standalone' && (
              <div className="audit-panel-actions">
                <button type="button" onClick={onExit}>
                  Close
                </button>
                <button type="button" onClick={onExportCsvFromClean}>
                  Export to CSV
                </button>
                <button type="button" onClick={onLockFromClean}>
                  Lock Taxonomy
                </button>
              </div>
            )}
          </>
        )}

        {(status === 'issue' || status === 'resuming') && (
          <>
            <p className="audit-panel-count">
              Issue {currentIndex} of {originalTotal}
            </p>
            <p>{message}</p>
            <div className="audit-panel-actions">
              <button type="button" onClick={onExit}>
                Exit Audit
              </button>
              <button type="button" onClick={onSkip}>
                Skip
              </button>
              {status === 'issue' ? (
                <button type="button" onClick={onClearError}>
                  {isAutoFixable ? 'Fix Automatically' : 'Clear Error'}
                </button>
              ) : (
                <button type="button" onClick={onResume}>
                  Resume Audit
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
