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
  codeDelimiterChar: string;
  indentChar: string;
  numLevels: number;
  delimiterPositions: number[];
  column1CodeLength: number;
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
// the code delimiter character) and are always safe to change. Number of code columns is
// structural, but changing it is only actually risky in one direction — growing it is exactly
// what "Add Column" already does mid-grid (new columns start blank), while shrinking it is only
// offered down to whatever's still safe given the rows already there, checked below. Delimiter
// positions are purely a display/export concern — they're never part of a row's own stored
// data — so they're freely editable regardless of what's already in the grid. Suffix
// configuration remains genuinely structural (each row's own suffixValues are keyed by
// position), so it's still left out of this modal — a new taxonomy is the way to change that.
// The padding character itself is no longer editable anywhere in setup — it's always "." as
// typed; a one-off "0" substitution is offered instead when exporting (see App.tsx).
export default function SettingsModal({ project, onSave, onClose, helpText }: SettingsModalProps) {
  const [title, setTitle] = useState(project.title);
  const [tableName, setTableName] = useState(project.tableName);
  const [purpose, setPurpose] = useState(project.purpose);
  const [maxDescriptionLengthText, setMaxDescriptionLengthText] = useState(
    String(project.settings.maxDescriptionLength),
  );
  const [codeDelimiterChar, setCodeDelimiterChar] = useState(project.settings.codeDelimiterChar);
  const [replaceIndentChar, setReplaceIndentChar] = useState(project.settings.indentChar !== ' ');
  const [indentChar, setIndentChar] = useState(
    project.settings.indentChar !== ' ' ? project.settings.indentChar : '_',
  );
  const [indentCharError, setIndentCharError] = useState<string | null>(null);

  const [numLevelsText, setNumLevelsText] = useState(String(project.settings.numLevels));
  const [numLevelsError, setNumLevelsError] = useState<string | null>(null);
  const [delimiterPositions, setDelimiterPositions] = useState<number[]>(project.settings.delimiterPositions);
  const [column1CodeLengthText, setColumn1CodeLengthText] = useState(String(project.settings.column1CodeLength));
  const [column1CodeLengthError, setColumn1CodeLengthError] = useState<string | null>(null);

  // The fewest columns that would still hold every row's actual content — a decrease below
  // this would silently cut off real descriptions/codes, so it's blocked rather than allowed
  // through with a data-loss warning; nothing here is actually gained by cutting it that close
  // when the user can just leave the extra columns blank instead.
  const maxRowLevel = Math.max(-1, ...project.rows.map(levelOf));
  const minSafeLevels = Math.max(1, maxRowLevel + 1);

  // Same protection for column 1's own code length — a decrease below the longest code
  // actually already sitting there would silently truncate real data.
  const minSafeColumn1CodeLength = Math.max(1, ...project.rows.map((r) => (r.codes[0] ?? '').length));

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
    const column1CodeLength = Math.max(1, Math.min(5, Number(column1CodeLengthText) || project.settings.column1CodeLength));
    if (column1CodeLength < minSafeColumn1CodeLength) {
      setColumn1CodeLengthError(
        `Column 1 already holds a ${minSafeColumn1CodeLength}-character code somewhere — reduce it to at least ${minSafeColumn1CodeLength}, or shorten that code first.`,
      );
      return;
    }
    setColumn1CodeLengthError(null);
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
      codeDelimiterChar,
      indentChar: replaceIndentChar ? indentChar : ' ',
      numLevels,
      delimiterPositions: sortedDelimiters,
      column1CodeLength,
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
          Column 1 Code Length
          <HelpIcon field="column1CodeLength" helpText={helpText} />
          <select
            value={column1CodeLengthText}
            onChange={(e) => {
              setColumn1CodeLengthText(e.target.value);
              setColumn1CodeLengthError(null);
            }}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} character{n === 1 ? '' : 's'}
              </option>
            ))}
          </select>
        </label>
        {column1CodeLengthError && <p className="field-error">{column1CodeLengthError}</p>}
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
      </div>
    </div>
  );
}
