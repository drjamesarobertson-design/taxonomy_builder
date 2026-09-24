import { useState } from 'react';
import type { ParsedCompositeCsv } from './csvImport';

const CODE_DELIMITER_OPTIONS = ['-', '_', '+', '=', '/'];

interface SeparateCodeElementsSetupProps {
  parsed: ParsedCompositeCsv;
  onConfirm: (delimiterPositions: number[], codeDelimiterChar: string) => void;
  onCancel: () => void;
}

// James's ask: "Separate Out Code Elements" — once csvImport.ts's parseCompositeCodeCsv has
// split each row's composite code into individual characters, this collects the one thing the
// source file genuinely can't tell us — where (if anywhere) a delimiter should sit between those
// new code columns — before handing off to the same title/table-name/purpose confirm step every
// other CSV import already uses. Same delimiter-position editing UI as SettingsModal's own
// "Code Delimiters" fieldset, reused here rather than duplicated with different behaviour.
export default function SeparateCodeElementsSetup({ parsed, onConfirm, onCancel }: SeparateCodeElementsSetupProps) {
  const [delimiterPositions, setDelimiterPositions] = useState<number[]>([]);
  const [codeDelimiterChar, setCodeDelimiterChar] = useState('-');

  function addDelimiter() {
    const last = delimiterPositions[delimiterPositions.length - 1] ?? 0;
    const next = Math.min(parsed.numLevels - 1, last + 3 || 3);
    if (next < 1) return;
    setDelimiterPositions([...delimiterPositions, next]);
  }

  function updateDelimiter(index: number, value: number) {
    const clamped = Math.max(1, Math.min(parsed.numLevels - 1, value));
    setDelimiterPositions(delimiterPositions.map((p, i) => (i === index ? clamped : p)));
  }

  function removeDelimiter(index: number) {
    setDelimiterPositions(delimiterPositions.filter((_, i) => i !== index));
  }

  return (
    <div className="validation-overlay" onClick={onCancel}>
      <div className="validation-dialog settings-modal" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <h2>Separate Out Code Elements</h2>
        <p className="csv-import-summary">
          Detected composite codes up to {parsed.numLevels} character{parsed.numLevels === 1 ? '' : 's'} long — will
          create {parsed.numLevels} separate code column{parsed.numLevels === 1 ? '' : 's'}, one character each,
          from {parsed.rows.length} row{parsed.rows.length === 1 ? '' : 's'}.
        </p>
        {parsed.numLevels > 1 && (
          <>
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
                      max={parsed.numLevels - 1}
                      value={position}
                      onChange={(e) => updateDelimiter(index, Number(e.target.value))}
                    />
                  </div>
                  <button type="button" className="delimiter-remove-btn" onClick={() => removeDelimiter(index)}>
                    Remove
                  </button>
                </div>
              ))}
              {delimiterPositions.length < parsed.numLevels - 1 && (
                <button type="button" onClick={addDelimiter}>
                  + Insert {delimiterPositions.length > 0 ? 'Further ' : ''}Delimiter
                </button>
              )}
            </fieldset>
          </>
        )}
        <div className="confirm-dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={() => onConfirm(delimiterPositions, codeDelimiterChar)}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
