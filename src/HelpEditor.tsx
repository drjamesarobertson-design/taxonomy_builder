import { useMemo, useState } from 'react';
import type { HelpTextMap } from './helpText';
import { stringifyHelpTextCsv } from './helpText';
import { saveExportFile } from './exportFolder';

interface HelpEditorProps {
  helpText: HelpTextMap;
  onClose: () => void;
}

interface EditableRow {
  /** A stable key for React's own list identity — untouched even if the user edits `field`
   * itself (renaming a field's own key), so editing that text box doesn't reset the row. */
  key: string;
  field: string;
  label: string;
  helpText: string;
  videoUrl: string;
}

function toRows(map: HelpTextMap): EditableRow[] {
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([field, entry]) => ({
      key: field,
      field,
      label: entry.label,
      helpText: entry.helpText,
      videoUrl: entry.videoUrl ?? '',
    }));
}

// James's ask (supervisor-only, see supervisor.ts): edit Help content directly in the app
// instead of downloading help-text.csv and editing it in Excel. Still produces that exact same
// file at the end — there's no backend of its own to write to, so "Download Updated Help CSV"
// followed by pushing it to the repo (same as today) is how an edit actually goes live for
// every subscriber. What changes is where the EDITING itself happens, and who can reach it.
export default function HelpEditor({ helpText, onClose }: HelpEditorProps) {
  const [rows, setRows] = useState<EditableRow[]>(() => toRows(helpText));
  const [query, setQuery] = useState('');
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [nextNewKey, setNextNewKey] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.field.toLowerCase().includes(q) || r.label.toLowerCase().includes(q) || r.helpText.toLowerCase().includes(q),
    );
  }, [rows, query]);

  function updateRow(key: string, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function addRow() {
    const key = `__new_${nextNewKey}`;
    setNextNewKey((n) => n + 1);
    setRows((prev) => [...prev, { key, field: '', label: '', helpText: '', videoUrl: '' }]);
  }

  async function handleDownload() {
    setDownloadError(null);
    const map: HelpTextMap = {};
    for (const r of rows) {
      const field = r.field.trim();
      if (!field) continue;
      map[field] = { label: r.label, helpText: r.helpText, videoUrl: r.videoUrl.trim() || undefined };
    }
    try {
      const blob = new Blob([stringifyHelpTextCsv(map)], { type: 'text/csv;charset=utf-8' });
      await saveExportFile(blob, 'help-text.csv');
    } catch {
      setDownloadError('Could not download help-text.csv. Please try again.');
    }
  }

  // Rendered nested inside HelpPage's own overlay (App.tsx only ever shows one of these at a
  // time otherwise) — stopping propagation here keeps a backdrop click closing just this editor,
  // not bubbling up through the DOM tree and closing the Help page underneath it too.
  return (
    <div className="validation-overlay" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="validation-dialog help-page help-editor" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="help-page-header">
          <h2>Edit Help</h2>
          <button type="button" className="help-page-close" onClick={onClose} aria-label="Close help editor">
            ×
          </button>
        </div>
        <p className="workflow-menu-hint">
          Edits here only apply once you download the file and it's pushed live — this doesn't change
          what subscribers see until then.
        </p>
        <input
          type="text"
          className="help-page-search"
          placeholder="Search by field, label, or text…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <div className="help-editor-list">
          {filtered.map((row) => (
            <div className="help-editor-row" key={row.key}>
              <div className="help-editor-row-header">
                <label className="help-editor-field-label">
                  Field
                  <input
                    type="text"
                    value={row.field}
                    onChange={(e) => updateRow(row.key, { field: e.target.value })}
                    placeholder="e.g. btnSomeButton"
                  />
                </label>
                <button type="button" className="help-editor-delete" onClick={() => removeRow(row.key)}>
                  Delete
                </button>
              </div>
              <label>
                Label
                <input type="text" value={row.label} onChange={(e) => updateRow(row.key, { label: e.target.value })} />
              </label>
              <label>
                Help Text
                <textarea
                  value={row.helpText}
                  onChange={(e) => updateRow(row.key, { helpText: e.target.value })}
                  rows={3}
                />
              </label>
              <label>
                Video URL (optional)
                <input
                  type="text"
                  value={row.videoUrl}
                  onChange={(e) => updateRow(row.key, { videoUrl: e.target.value })}
                  placeholder="https://..."
                />
              </label>
            </div>
          ))}
          {filtered.length === 0 && <p className="help-page-empty">No fields match "{query}".</p>}
        </div>
        {downloadError && <p className="help-page-empty">{downloadError}</p>}
        <div className="confirm-dialog-actions">
          <button type="button" onClick={addRow}>
            Add New Field
          </button>
          <button type="button" onClick={handleDownload}>
            Download Updated Help CSV
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="help-page-publish-instructions">
          <strong>To make downloaded edits live for everyone:</strong> send the downloaded file to
          Claude in this Taxonomy Builder session and ask it to replace{' '}
          <code>public/help-text.csv</code> with it. Claude commits it, pushes it, and the update
          goes live for every subscriber within a few minutes, once the next deploy finishes — you
          don't need to touch GitHub directly.
        </p>
      </div>
    </div>
  );
}
