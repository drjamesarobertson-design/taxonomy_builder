import { useState } from 'react';
import type { TaxonomyProject } from './types';

export interface SettingsFields {
  title: string;
  tableName: string;
  purpose: string;
  maxDescriptionLength: number;
  paddingChar: string;
  codeDelimiterChar: string;
  indentChar: string;
}

interface SettingsModalProps {
  project: TaxonomyProject;
  onSave: (fields: SettingsFields) => void;
  onClose: () => void;
}

const CODE_DELIMITER_OPTIONS = ['-', '_', '+', '=', '/'];

// Item 14: a way back to the taxonomy's own settings from the working grid screen, without
// having to start over. Only the fields that stay safe to change after rows already exist are
// editable here — title/table name/purpose (pure metadata), the description length warning
// threshold, the padding character, the code delimiter, and the Concatenated-export indent
// character. Number of code columns, delimiter positions, and suffix configuration are
// structural — changing them after data exists risks orphaning or misreading existing rows —
// so they're deliberately left out of this modal; a new taxonomy is the way to change those.
export default function SettingsModal({ project, onSave, onClose }: SettingsModalProps) {
  const [title, setTitle] = useState(project.title);
  const [tableName, setTableName] = useState(project.tableName);
  const [purpose, setPurpose] = useState(project.purpose);
  const [maxDescriptionLengthText, setMaxDescriptionLengthText] = useState(
    String(project.settings.maxDescriptionLength),
  );
  const [paddingChar, setPaddingChar] = useState(project.settings.paddingChar);
  const [showPaddingWarning, setShowPaddingWarning] = useState(false);
  const [codeDelimiterChar, setCodeDelimiterChar] = useState(project.settings.codeDelimiterChar);
  const [replaceIndentChar, setReplaceIndentChar] = useState(project.settings.indentChar !== ' ');
  const [indentChar, setIndentChar] = useState(
    project.settings.indentChar !== ' ' ? project.settings.indentChar : '_',
  );
  const [indentCharError, setIndentCharError] = useState<string | null>(null);

  function handleSave() {
    if (!title.trim() || !tableName.trim()) return;
    if (replaceIndentChar) {
      const code = indentChar.charCodeAt(0);
      if (indentChar.length !== 1 || Number.isNaN(code) || code < 33 || code > 126) {
        setIndentCharError('Enter a single printable ASCII character (not space).');
        return;
      }
    }
    const maxDescriptionLength = Math.max(
      1,
      Number(maxDescriptionLengthText) || project.settings.maxDescriptionLength,
    );
    onSave({
      title: title.trim(),
      tableName: tableName.trim(),
      purpose: purpose.trim(),
      maxDescriptionLength,
      paddingChar,
      codeDelimiterChar,
      indentChar: replaceIndentChar ? indentChar : ' ',
    });
  }

  return (
    <div className="validation-overlay" onClick={onClose}>
      <div className="validation-dialog settings-modal" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>
          Table Name
          <input value={tableName} onChange={(e) => setTableName(e.target.value)} required />
        </label>
        <label>
          Purpose
          <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={2} />
        </label>
        <label>
          Maximum ERP Description Field Length
          <input
            type="number"
            min={1}
            value={maxDescriptionLengthText}
            onChange={(e) => setMaxDescriptionLengthText(e.target.value)}
          />
        </label>
        <label>
          Pad codes with trailing
          <select
            value={paddingChar}
            onChange={(e) => {
              const v = e.target.value;
              setPaddingChar(v);
              if (v === '0') setShowPaddingWarning(true);
            }}
          >
            <option value=".">"." (default)</option>
            <option value="0">"0"</option>
          </select>
        </label>
        <label>
          Delimit codes with
          <select value={codeDelimiterChar} onChange={(e) => setCodeDelimiterChar(e.target.value)}>
            {CODE_DELIMITER_OPTIONS.map((c) => (
              <option key={c} value={c}>
                "{c}"
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={replaceIndentChar}
            onChange={(e) => {
              setReplaceIndentChar(e.target.checked);
              setIndentCharError(null);
            }}
          />
          Replace leading space with other ASCII character on Concatenated exports?
        </label>
        {replaceIndentChar && (
          <label>
            Leading Pad Character
            <input
              value={indentChar}
              maxLength={1}
              onChange={(e) => {
                setIndentChar(e.target.value);
                setIndentCharError(null);
              }}
            />
          </label>
        )}
        {indentCharError && <p className="field-error">{indentCharError}</p>}
        <p className="field-warning">
          Number of code columns, delimiter positions, and description suffixes are structural
          — they can't be changed here once a taxonomy has rows. Start a new taxonomy if you
          need to change those.
        </p>
        <div className="confirm-dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={handleSave}>
            Save
          </button>
        </div>

        {showPaddingWarning && (
          <div className="validation-overlay" onClick={() => setShowPaddingWarning(false)}>
            <div className="validation-dialog" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
              <p>
                Note that "0" as the pad character has limitations — it is strongly
                recommended that you use "." unless your software cannot be configured to
                accept ".".
              </p>
              <button type="button" onClick={() => setShowPaddingWarning(false)}>
                OK
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
