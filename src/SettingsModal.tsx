import { useState } from 'react';
import type { TaxonomyProject, TaxonomyRow } from './types';
import { MAX_LEVELS } from './types';
import HelpIcon from './HelpIcon';
import type { HelpTextMap } from './helpText';

export interface SettingsFields {
  title: string;
  tableName: string;
  purpose: string;
  maxDescriptionLength: number;
  paddingChar: string;
  codeDelimiterChar: string;
  indentChar: string;
  numLevels: number;
  delimiterPositions: number[];
}

interface SettingsModalProps {
  project: TaxonomyProject;
  onSave: (fields: SettingsFields) => void;
  onClose: () => void;
  helpText: HelpTextMap;
}

const CODE_DELIMITER_OPTIONS = ['-', '_', '+', '=', '/'];

// A row's level is the position of its deepest populated description column (Section 4.1);
// -1 means the row has no description at all yet.
function levelOf(row: TaxonomyRow): number {
  for (let i = row.descriptions.length - 1; i >= 0; i--) {
    if ((row.descriptions[i] ?? '').trim()) return i;
  }
  return -1;
}

// Item 14 (extended): a way back to the taxonomy's own settings from the working grid screen,
// without having to start over. Most fields here are pure metadata or cosmetic (title, purpose,
// padding/delimiter characters) and are always safe to change. Number of code columns is
// structural, but changing it is only actually risky in one direction — growing it is exactly
// what "Add Column" already does mid-grid (new columns start blank), while shrinking it is only
// offered down to whatever's still safe given the rows already there, checked below. Delimiter
// positions are purely a display/export concern — they're never part of a row's own stored
// data — so they're freely editable regardless of what's already in the grid. Suffix
// configuration remains genuinely structural (each row's own suffixValues are keyed by
// position), so it's still left out of this modal — a new taxonomy is the way to change that.
export default function SettingsModal({ project, onSave, onClose, helpText }: SettingsModalProps) {
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

  const [numLevelsText, setNumLevelsText] = useState(String(project.settings.numLevels));
  const [numLevelsError, setNumLevelsError] = useState<string | null>(null);
  const [delimiterPositions, setDelimiterPositions] = useState<number[]>(project.settings.delimiterPositions);

  // The fewest columns that would still hold every row's actual content — a decrease below
  // this would silently cut off real descriptions/codes, so it's blocked rather than allowed
  // through with a data-loss warning; nothing here is actually gained by cutting it that close
  // when the user can just leave the extra columns blank instead.
  const maxRowLevel = Math.max(-1, ...project.rows.map(levelOf));
  const minSafeLevels = Math.max(1, maxRowLevel + 1);

  function addDelimiter() {
    const numLevels = Math.max(1, Number(numLevelsText) || project.settings.numLevels);
    const last = delimiterPositions[delimiterPositions.length - 1] ?? 0;
    const next = Math.min(numLevels - 1, last + 3 || 3);
    if (next < 1) return;
    setDelimiterPositions([...delimiterPositions, next]);
  }

  function updateDelimiter(index: number, value: number) {
    const numLevels = Math.max(1, Number(numLevelsText) || project.settings.numLevels);
    const clamped = Math.max(1, Math.min(numLevels - 1, value));
    setDelimiterPositions(delimiterPositions.map((p, i) => (i === index ? clamped : p)));
  }

  function removeDelimiter(index: number) {
    setDelimiterPositions(delimiterPositions.filter((_, i) => i !== index));
  }

  function handleSave() {
    if (!title.trim() || !tableName.trim()) return;
    if (replaceIndentChar) {
      const code = indentChar.charCodeAt(0);
      if (indentChar.length !== 1 || Number.isNaN(code) || code < 33 || code > 126) {
        setIndentCharError('Enter a single printable ASCII character (not space).');
        return;
      }
    }
    const numLevels = Math.max(1, Math.min(MAX_LEVELS, Number(numLevelsText) || project.settings.numLevels));
    if (numLevels < minSafeLevels) {
      setNumLevelsError(
        `Column ${minSafeLevels} still holds real content — reduce it to at least ${minSafeLevels} columns, or clear that content first.`,
      );
      return;
    }
    setNumLevelsError(null);
    const sortedDelimiters = [...new Set(delimiterPositions)].filter((p) => p < numLevels).sort((a, b) => a - b);
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
      numLevels,
      delimiterPositions: sortedDelimiters,
    });
  }

  return (
    <div className="validation-overlay" onClick={onClose}>
      <div className="validation-dialog settings-modal" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <label>
          Title
          <HelpIcon field="title" helpText={helpText} />
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>
          Table Name
          <HelpIcon field="tableName" helpText={helpText} />
          <input value={tableName} onChange={(e) => setTableName(e.target.value)} required />
        </label>
        <label>
          Purpose
          <HelpIcon field="purpose" helpText={helpText} />
          <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={2} />
        </label>
        <label>
          Maximum ERP Description Field Length
          <HelpIcon field="maxDescriptionLength" helpText={helpText} />
          <input
            type="number"
            min={1}
            value={maxDescriptionLengthText}
            onChange={(e) => setMaxDescriptionLengthText(e.target.value)}
          />
        </label>
        <label>
          Number of Code Columns
          <HelpIcon field="numLevels" helpText={helpText} />
          <input
            type="number"
            min={minSafeLevels}
            max={MAX_LEVELS}
            value={numLevelsText}
            onChange={(e) => {
              setNumLevelsText(e.target.value);
              setNumLevelsError(null);
            }}
            title={
              minSafeLevels > 1
                ? `Can't go below ${minSafeLevels} — that's as far as column ${minSafeLevels}'s own content reaches`
                : undefined
            }
          />
        </label>
        {numLevelsError && <p className="field-error">{numLevelsError}</p>}
        <label>
          Pad codes with trailing
          <HelpIcon field="paddingChar" helpText={helpText} />
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
          <HelpIcon field="codeDelimiterChar" helpText={helpText} />
          <select value={codeDelimiterChar} onChange={(e) => setCodeDelimiterChar(e.target.value)}>
            {CODE_DELIMITER_OPTIONS.map((c) => (
              <option key={c} value={c}>
                "{c}"
              </option>
            ))}
          </select>
        </label>
        <fieldset className="delimiter-setup">
          <legend>
            Code Delimiters ("{codeDelimiterChar}")
            <HelpIcon field="delimiterPositions" helpText={helpText} />
          </legend>
          {delimiterPositions.length === 0 && (
            <p className="delimiter-empty">No delimiters — Insert "{codeDelimiterChar}" Code Delimiter?</p>
          )}
          {delimiterPositions.map((position, index) => (
            <div className="delimiter-row" key={index}>
              <div className="delimiter-row-fields">
                <span>Insert "{codeDelimiterChar}" Code Delimiter — after how many code columns?</span>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, Number(numLevelsText) || project.settings.numLevels) - 1}
                  value={position}
                  onChange={(e) => updateDelimiter(index, Number(e.target.value))}
                />
              </div>
              <button type="button" className="delimiter-remove-btn" onClick={() => removeDelimiter(index)}>
                Remove
              </button>
            </div>
          ))}
          {delimiterPositions.length < Math.max(1, Number(numLevelsText) || project.settings.numLevels) - 1 && (
            <button type="button" onClick={addDelimiter}>
              + Insert {delimiterPositions.length > 0 ? 'Further ' : ''}Delimiter
            </button>
          )}
        </fieldset>
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
          <HelpIcon field="indentToggle" helpText={helpText} />
        </label>
        {replaceIndentChar && (
          <label>
            Leading Pad Character
            <HelpIcon field="indentChar" helpText={helpText} />
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
          Description suffixes are structural — they can't be changed here once a taxonomy has
          rows. Start a new taxonomy if you need to change those.
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
