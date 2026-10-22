import { useState } from 'react';
import type { HelpEntry } from './helpText';

interface TooltipQuickEditProps {
  field: string;
  entry: HelpEntry | undefined;
  onSave: (field: string, entry: HelpEntry) => void;
  onClose: () => void;
}

// James's ask (2026-10-14): edit a specific tooltip/"?" popup's help text right where it's shown,
// rather than hunting for it in the full Help Editor's flat, alphabetical list of every field in
// the app. Opened via F1 while a Tooltip/menuTooltip/HelpIcon is showing (App.tsx reads
// activeHelpField.ts to know which one) -- supervisor-only, same restriction as the rest of Help
// editing. Writes straight into App.tsx's live `helpText` state (not the file), so the change is
// visible everywhere immediately and is included the next time the Help page's download button is
// used -- there's still no backend of its own, so getting an edit live for every subscriber still
// means downloading that CSV and sending it on to be pushed, same as before this existed.
export default function TooltipQuickEdit({ field, entry, onSave, onClose }: TooltipQuickEditProps) {
  const [label, setLabel] = useState(entry?.label ?? field);
  const [helpText, setHelpText] = useState(entry?.helpText ?? '');
  const [videoUrl, setVideoUrl] = useState(entry?.videoUrl ?? '');

  function handleSave() {
    onSave(field, { label: label.trim() || field, helpText, videoUrl: videoUrl.trim() || undefined });
    onClose();
  }

  return (
    <div className="validation-overlay" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="validation-dialog tooltip-quick-edit" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="help-page-header">
          <h2>Edit Help Text</h2>
          <button type="button" className="help-page-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="workflow-menu-hint">
          Field: <code>{field}</code>
        </p>
        <label>
          Label
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
        </label>
        <label>
          Help Text
          <textarea value={helpText} onChange={(e) => setHelpText(e.target.value)} rows={4} />
        </label>
        <label>
          Video URL (optional)
          <input
            type="text"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://..."
          />
        </label>
        <div className="confirm-dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
