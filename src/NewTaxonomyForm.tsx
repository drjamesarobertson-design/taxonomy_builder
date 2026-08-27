import { useState } from 'react';
import { DEFAULT_SETTINGS } from './types';

interface NewTaxonomyFormProps {
  onCreate: (
    title: string,
    tableName: string,
    purpose: string,
    maxDescriptionLength: number,
    delimiterPositions: number[],
    indentChar: string,
  ) => void;
  onLoadClick: () => void;
}

const numLevels = DEFAULT_SETTINGS.numLevels;

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
  const [delimiterPositions, setDelimiterPositions] = useState<number[]>(
    DEFAULT_SETTINGS.delimiterPositions,
  );
  // Concatenated exports (Section 9) indent each level with a leading space by default; some
  // ERPs trim leading spaces on import, so James asked for an alternative single character
  // (e.g. "_") to be configurable per taxonomy instead.
  const [replaceIndentChar, setReplaceIndentChar] = useState(false);
  const [indentChar, setIndentChar] = useState('_');
  const [indentCharError, setIndentCharError] = useState<string | null>(null);

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
    const sorted = [...new Set(delimiterPositions)].sort((a, b) => a - b);
    const maxDescriptionLength = Math.max(1, Number(maxDescriptionLengthText) || DEFAULT_SETTINGS.maxDescriptionLength);
    onCreate(
      title.trim(),
      tableName.trim(),
      purpose.trim(),
      maxDescriptionLength,
      sorted,
      replaceIndentChar ? indentChar : ' ',
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

      <fieldset className="delimiter-setup">
        <legend>Code Delimiters ("-")</legend>
        {delimiterPositions.length === 0 && <p className="delimiter-empty">No delimiters — Insert "-" Code Delimiter?</p>}
        {delimiterPositions.map((position, index) => (
          <div className="delimiter-row" key={index}>
            <div className="delimiter-row-fields">
              <span>Insert "-" Code Delimiter — after how many code columns?</span>
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
        <legend>Leading Pad Character</legend>
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

      <div className="form-actions">
        <button type="submit">Create Taxonomy</button>
        <button type="button" onClick={onLoadClick}>
          Load from File
        </button>
      </div>
    </form>
  );
}
