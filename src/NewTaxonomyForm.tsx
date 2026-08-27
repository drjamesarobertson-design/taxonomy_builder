import { useState } from 'react';
import { DEFAULT_SETTINGS } from './types';

interface NewTaxonomyFormProps {
  onCreate: (
    title: string,
    tableName: string,
    purpose: string,
    maxDescriptionLength: number,
    delimiterPositions: number[],
  ) => void;
}

const numLevels = DEFAULT_SETTINGS.numLevels;

export default function NewTaxonomyForm({ onCreate }: NewTaxonomyFormProps) {
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
    const sorted = [...new Set(delimiterPositions)].sort((a, b) => a - b);
    const maxDescriptionLength = Math.max(1, Number(maxDescriptionLengthText) || DEFAULT_SETTINGS.maxDescriptionLength);
    onCreate(title.trim(), tableName.trim(), purpose.trim(), maxDescriptionLength, sorted);
  }

  return (
    <form className="new-taxonomy-form" onSubmit={handleSubmit}>
      <h2>Create a New Taxonomy</h2>
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
        <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={3} />
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

      <button type="submit">Create Taxonomy</button>
    </form>
  );
}
