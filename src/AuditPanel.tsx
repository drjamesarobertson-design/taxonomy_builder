import { useRef, useState } from 'react';
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
  onClearError: () => void;
  onSkip: () => void;
  onExit: () => void;
  onResume: () => void;
  /** Only rendered for a clean result reached from the standalone Audit Taxonomy button —
   * Lock/Export-triggered audits handle their own "what next" step once clean (App.tsx). */
  onLockFromClean: () => void;
  onExportCsvFromClean: () => void;
}

// James's ask: unlike every other dialog in this app (either a centered modal or the sticky
// top message bar), the walkthrough needs to stay visible and out of the way while actively
// editing a cell that could be anywhere in a long taxonomy — "it is important that we make
// this as convenient as possible". A small floating panel the user can drag wherever suits
// them, defaulting to the top-right corner so it doesn't cover the grid on first appearance.
export default function AuditPanel({
  status,
  origin,
  currentIndex,
  originalTotal,
  message,
  isAutoFixable,
  onClearError,
  onSkip,
  onExit,
  onResume,
  onLockFromClean,
  onExportCsvFromClean,
}: AuditPanelProps) {
  const [position, setPosition] = useState({ top: 88, right: 24 });
  const dragState = useRef<{ startX: number; startY: number; startTop: number; startRight: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function handleDragStart(e: ReactPointerEvent<HTMLDivElement>) {
    // Right-anchored (not left) so dragging tracks naturally from the panel's default corner —
    // converted to a left/top box once the user actually starts dragging, so it can freely
    // reach anywhere on screen rather than staying pinned to the right edge.
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startTop: rect.top,
      startRight: window.innerWidth - rect.right,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleDragMove(e: ReactPointerEvent<HTMLDivElement>) {
    const start = dragState.current;
    if (!start) return;
    const dx = e.clientX - start.startX;
    const dy = e.clientY - start.startY;
    setPosition({ top: Math.max(4, start.startTop + dy), right: Math.max(4, start.startRight - dx) });
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
    <div className="audit-panel" style={{ top: position.top, right: position.right }} ref={panelRef}>
      <div
        className="audit-panel-handle"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
        title="Drag to move"
      >
        {originLabel[origin]}
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
