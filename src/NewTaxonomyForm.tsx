import { useState } from 'react';
import { DEFAULT_SETTINGS, MAX_LEVELS } from './types';
import type { SuffixField } from './types';

interface NewTaxonomyFormProps {
  onCreate: (
    title: string,
    tableName: string,
    purpose: string,
    maxDescriptionLength: number,
    delimiterPositions: number[],
    indentChar: string,
    numLevels: number,
    suffixes: SuffixField[],
    paddingChar: string,
    codeDelimiterChar: string,
  ) => void;
  onLoadClick: () => void;
}

const CODE_DELIMITER_OPTIONS = ['-', '_', '+', '=', '/'];

function defaultSuffix(): SuffixField {
  return { width: 4, delimiter: '-', mode: 'editable', constantValue: '' };
}

export default function NewTaxonomyForm({ onCreate, onLoadClick }: NewTaxonomyFormProps) {
  const [title, setTitle] = useState('');
  const [tableName, setTableName] = useState('');
  const [purpose, setPurpose] = useState('');
  // Kept as free text while editing (not coerced to a number on every keystroke) so that
  // backspacing the field to empty doesn't get immediately replaced by a stray "0" that then
  // sits in front of the next digit typed.
  const [maxDescriptionLengthText, setMaxDescriptionLengthText] = useState(
    String(DEFAULT_SETTINGS.maxDescriptionLength),
  );
  const [numLevelsText, setNumLevelsText] = useState(String(DEFAULT_SETTINGS.numLevels));
  const numLevels = Math.max(1, Math.min(MAX_LEVELS, Number(numLevelsText) || DEFAULT_SETTINGS.numLevels));
  const [delimiterPositions, setDelimiterPositions] = useState<number[]>(
    DEFAULT_SETTINGS.delimiterPositions,
  );
  // Some ERPs don't accept "." in a code field (pad with "0" instead), and some need a code
  // delimiter other than "-" (Section 4.4).
  const [paddingChar, setPaddingChar] = useState(DEFAULT_SETTINGS.paddingChar);
  const [codeDelimiterChar, setCodeDelimiterChar] = useState(DEFAULT_SETTINGS.codeDelimiterChar);
  // Concatenated exports (Section 9) indent each level with a leading space by default; some
  // ERPs trim leading spaces on import, so James asked for an alternative single character
  // (e.g. "_") to be configurable per taxonomy instead.
  const [replaceIndentChar, setReplaceIndentChar] = useState(false);
  const [indentChar, setIndentChar] = useState('_');
  const [indentCharError, setIndentCharError] = useState<string | null>(null);

  // User-defined suffix columns (0 to 6), appended after the wide description column on the
  // working screen — e.g. a fixed currency code or a per-row free-text tag.
  const [suffixCount, setSuffixCount] = useState(0);
  const [suffixes, setSuffixes] = useState<SuffixField[]>([]);

  function updateSuffixCount(raw: number) {
    const clamped = Math.max(0, Math.min(6, Number.isFinite(raw) ? Math.round(raw) : 0));
    setSuffixCount(clamped);
    setSuffixes((prev) => {
      const next = prev.slice(0, clamped);
      while (next.length < clamped) next.push(defaultSuffix());
      return next;
    });
  }

  function updateSuffix(index: number, patch: Partial<SuffixField>) {
    setSuffixes((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  // Each suffix column needs room for its own delimiter plus its configured width; if that
  // leaves little or nothing of the configured max description length for the description
  // itself, warn (Section 6.7-style soft warning — informs, never blocks).
  const totalSuffixWidth = suffixes.reduce((sum, s) => sum + 1 + s.width, 0);
  const maxDescriptionLength = Math.max(1, Number(maxDescriptionLengthText) || DEFAULT_SETTINGS.maxDescriptionLength);
  const suffixWidthWarning =
    suffixes.length > 0 && maxDescriptionLength <= totalSuffixWidth
      ? `The suffix columns and their delimiters need ${totalSuffixWidth} characters, leaving little or nothing of the ${maxDescriptionLength}-character Maximum ERP Description Field Length for the description itself — consider increasing that field or reducing suffix widths.`
      : null;

  function addDelimiter() {
    // Default the new one to just after the last one, or after column 3 if there are none yet.
    const last = delimiterPositions[delimiterPositions.length - 1] ?? 0;
    const next = Math.min(numLevels - 1, last + 3 || 3);
    setDelimiterPositions([...delimiterPositions, next]);
  }

  function updateDelimiter(index: number, value: number) {
    const clamped = Math.max(1, Math.min(numLevels - 1, value));
    setDelimiterPositions(delimiterPositions.map((p, i) => (i === index ? clamped : p)));
  }

  function removeDelimiter(index: number) {
    setDelimiterPositions(delimiterPositions.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !tableName.trim()) return;
    if (replaceIndentChar) {
      const code = indentChar.charCodeAt(0);
      if (indentChar.length !== 1 || Number.isNaN(code) || code < 33 || code > 126) {
        setIndentCharError('Enter a single printable ASCII character (not space).');
        return;
      }
    }
    const sorted = [...new Set(delimiterPositions)].filter((p) => p < numLevels).sort((a, b) => a - b);
    const normalizedSuffixes = suffixes.map((s) => ({
      ...s,
      delimiter: s.delimiter || '-',
      width: Math.max(1, Math.min(8, s.width)),
    }));
    onCreate(
      title.trim(),
      tableName.trim(),
      purpose.trim(),
      maxDescriptionLength,
      sorted,
      replaceIndentChar ? indentChar : ' ',
      numLevels,
      normalizedSuffixes,
      paddingChar,
      codeDelimiterChar,
    );
  }

  return (
    <form className="new-taxonomy-form" onSubmit={handleSubmit}>
      <h2>Create a New Taxonomy</h2>
      <label>
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          title="The name by which this table will be known in project documentation and the description of the table in the ERP"
        />
      </label>
      <label>
        Table Name
        <input
          value={tableName}
          onChange={(e) => setTableName(e.target.value)}
          required
          title="The database table name that will be used in the ERP"
        />
      </label>
      <label>
        Purpose
        <textarea
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          rows={3}
          title="A description of the role of this table in the ERP"
        />
      </label>
      <label>
        Maximum ERP Description Field Length
        <input
          type="number"
          min={1}
          value={maxDescriptionLengthText}
          onChange={(e) => setMaxDescriptionLengthText(e.target.value)}
          onBlur={() => {
            const n = Number(maxDescriptionLengthText);
            if (!maxDescriptionLengthText || Number.isNaN(n) || n < 1) {
              setMaxDescriptionLengthText(String(DEFAULT_SETTINGS.maxDescriptionLength));
            }
          }}
          title="This is the description field length limit imposed by the ERP or a lesser length if it is desired to curtail description length, should never exceed the field length in the ERP"
        />
      </label>
      <label>
        Maximum Number of Code Columns
        <input
          type="number"
          min={1}
          max={MAX_LEVELS}
          value={numLevelsText}
          onChange={(e) => setNumLevelsText(e.target.value)}
          onBlur={() => {
            const n = Number(numLevelsText);
            if (!numLevelsText || Number.isNaN(n) || n < 1) {
              setNumLevelsText(String(DEFAULT_SETTINGS.numLevels));
            } else if (n > MAX_LEVELS) {
              setNumLevelsText(String(MAX_LEVELS));
            }
          }}
          title={`How many hierarchy levels (code and description columns) this taxonomy starts with, up to ${MAX_LEVELS}`}
        />
      </label>

      <label>
        Pad codes with trailing
        <select value={paddingChar} onChange={(e) => setPaddingChar(e.target.value)} title="Some ERPs won't accept &quot;.&quot; in a code field — pad with &quot;0&quot; instead">
          <option value=".">"." (default)</option>
          <option value="0">"0"</option>
        </select>
      </label>
      <label>
        Delimit codes with
        <select value={codeDelimiterChar} onChange={(e) => setCodeDelimiterChar(e.target.value)} title="Some ERPs need a different code delimiter character">
          {CODE_DELIMITER_OPTIONS.map((c) => (
            <option key={c} value={c}>
              "{c}"{c === DEFAULT_SETTINGS.codeDelimiterChar ? ' (default)' : ''}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="delimiter-setup">
        <legend>Code Delimiters ("{codeDelimiterChar}")</legend>
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
                max={numLevels - 1}
                value={position}
                onChange={(e) => updateDelimiter(index, Number(e.target.value))}
              />
            </div>
            <button type="button" className="delimiter-remove-btn" onClick={() => removeDelimiter(index)}>
              Remove
            </button>
          </div>
        ))}
        {delimiterPositions.length < numLevels - 1 && (
          <button type="button" onClick={addDelimiter}>
            + Insert {delimiterPositions.length > 0 ? 'Further ' : ''}Delimiter
          </button>
        )}
      </fieldset>

      <fieldset className="indent-char-setup">
        <legend>Leading Pad Character on Concatenated Export</legend>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={replaceIndentChar}
            onChange={(e) => {
              setReplaceIndentChar(e.target.checked);
              setIndentCharError(null);
            }}
          />
          Replace leading space with other ASCII character?
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
              title="A single printable ASCII character (e.g. &quot;_&quot;) used instead of a space to indent each level in Concatenated exports"
            />
          </label>
        )}
        {indentCharError && <p className="field-error">{indentCharError}</p>}
      </fieldset>

      <fieldset className="suffix-setup">
        <legend>Description Suffixes</legend>
        <label>
          Description Suffixes required (0 to 6)
          <input
            type="number"
            min={0}
            max={6}
            value={suffixCount}
            onChange={(e) => updateSuffixCount(Number(e.target.value))}
            title="Extra fixed-width columns after the description, e.g. a currency code or a per-row tag"
          />
        </label>
        {suffixes.map((suffix, index) => (
          <div className="suffix-row" key={index}>
            <span className="suffix-row-label">Suffix {index + 1}</span>
            <label>
              Width (up to 8 characters)
              <input
                type="number"
                min={1}
                max={8}
                value={suffix.width}
                onChange={(e) => updateSuffix(index, { width: Math.max(1, Math.min(8, Number(e.target.value))) })}
              />
            </label>
            <label>
              Delimiter before this suffix
              <input
                value={suffix.delimiter}
                maxLength={1}
                onChange={(e) => updateSuffix(index, { delimiter: e.target.value })}
                title="A single character shown immediately before this suffix column, default &quot;-&quot;"
              />
            </label>
            <label>
              Constant or Editable
              <select
                value={suffix.mode}
                onChange={(e) => updateSuffix(index, { mode: e.target.value as SuffixField['mode'] })}
              >
                <option value="editable">Editable — each row has its own value</option>
                <option value="constant">Constant — one value for every row</option>
              </select>
            </label>
            {suffix.mode === 'constant' && (
              <label>
                Constant Value
                <input
                  value={suffix.constantValue}
                  maxLength={suffix.width}
                  onChange={(e) => updateSuffix(index, { constantValue: e.target.value })}
                />
              </label>
            )}
          </div>
        ))}
        {suffixWidthWarning && <p className="field-warning">{suffixWidthWarning}</p>}
      </fieldset>

      <div className="form-actions">
        <button type="submit">Create Taxonomy</button>
        <button type="button" onClick={onLoadClick}>
          Load from File
        </button>
      </div>
    </form>
  );
}
