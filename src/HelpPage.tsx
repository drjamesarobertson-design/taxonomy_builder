import { useMemo, useState } from 'react';
import type { HelpTextMap } from './helpText';
import { saveExportFile } from './exportFolder';

interface HelpPageProps {
  helpText: HelpTextMap;
  onClose: () => void;
}

// James's ask (Option 3): "a help screen with a search facility and nice formatting, something
// professional ... I want to include links to videos in some places". Reuses the exact same
// help-text.csv data as the toolbar/menu tooltips (Tooltip.tsx / menuTooltip.tsx) and the "?"
// HelpIcon on the setup screens, so James only ever writes a given field's wording once.
export default function HelpPage({ helpText, onClose }: HelpPageProps) {
  const [query, setQuery] = useState('');
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // James's report: unable to get help-text.csv out of the app any other way. Same
  // save-picker-with-download-fallback every other Export button already uses (exportFolder.ts)
  // -- known to work for him, so this is the most reliable path rather than a new mechanism.
  async function handleDownloadCsv() {
    setDownloadError(null);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}help-text.csv`);
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
      await saveExportFile(blob, 'help-text.csv');
    } catch {
      setDownloadError('Could not download help-text.csv. Please try again, or ask for it to be sent another way.');
    }
  }

  const entries = useMemo(
    () =>
      Object.entries(helpText)
        .filter(([, entry]) => entry.helpText?.trim())
        .sort((a, b) => a[1].label.localeCompare(b[1].label)),
    [helpText],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      ([, entry]) => entry.label.toLowerCase().includes(q) || entry.helpText.toLowerCase().includes(q),
    );
  }, [entries, query]);

  return (
    <div className="validation-overlay" onClick={onClose}>
      <div className="validation-dialog help-page" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="help-page-header">
          <h2>Help</h2>
          <button type="button" className="help-page-close" onClick={onClose} aria-label="Close help">
            ×
          </button>
        </div>
        <input
          type="text"
          className="help-page-search"
          placeholder="Search help topics…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <div className="help-page-list">
          {entries.length === 0 ? (
            <p className="help-page-empty">
              No help topics have been written yet. Help text is loaded from <code>help-text.csv</code>.
            </p>
          ) : filtered.length === 0 ? (
            <p className="help-page-empty">No help topics match "{query}".</p>
          ) : (
            filtered.map(([field, entry]) => (
              <div className="help-page-entry" key={field}>
                <h3>{entry.label}</h3>
                <p>{entry.helpText.trim()}</p>
                {entry.videoUrl && (
                  <a
                    href={entry.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="help-page-video-link"
                  >
                    ▶ Watch video
                  </a>
                )}
              </div>
            ))
          )}
        </div>
        {downloadError && <p className="help-page-empty">{downloadError}</p>}
        <div className="confirm-dialog-actions">
          <button type="button" onClick={handleDownloadCsv}>
            Download Help CSV
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
