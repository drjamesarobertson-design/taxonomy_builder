import { useState } from 'react';
import type { ParsedDiscreteCsv } from './csvImport';

export interface CsvImportFields {
  title: string;
  tableName: string;
  purpose: string;
  maxDescriptionLength: number;
}

interface CsvImportConfirmProps {
  parsed: ParsedDiscreteCsv;
  defaultTitle: string;
  onConfirm: (fields: CsvImportFields) => void;
  onCancel: () => void;
}

// A CSV has no way to carry a taxonomy's title/table name/purpose (Section 5 step 1) or its
// Maximum ERP Description Field Length — everything else (level count, delimiter positions,
// suffix columns) is read straight off the file's own structure (csvImport.ts), so this only
// asks for what the file genuinely can't tell us, with a summary of what was detected so the
// import isn't a total leap of faith.
export default function CsvImportConfirm({ parsed, defaultTitle, onConfirm, onCancel }: CsvImportConfirmProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [tableName, setTableName] = useState(defaultTitle);
  const [purpose, setPurpose] = useState('');
  const longestDescription = parsed.rows.reduce(
    (max, row) => Math.max(max, ...row.descriptions.map((d) => d.length)),
    0,
  );
  const [maxDescriptionLengthText, setMaxDescriptionLengthText] = useState(
    String(Math.max(40, longestDescription + parsed.numLevels + 4)),
  );

  function handleConfirm() {
    if (!title.trim() || !tableName.trim()) return;
    onConfirm({
      title: title.trim(),
      tableName: tableName.trim(),
      purpose: purpose.trim(),
      maxDescriptionLength: Math.max(1, Number(maxDescriptionLengthText) || 40),
    });
  }

  return (
    <div className="validation-overlay" onClick={onCancel}>
      <div className="validation-dialog settings-modal" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <h2>Import CSV</h2>
        <p className="csv-import-summary">
          Detected {parsed.numLevels} code/description level{parsed.numLevels === 1 ? '' : 's'}
          {parsed.delimiterPositions.length > 0 ? `, delimiter after column ${parsed.delimiterPositions.join(', ')}` : ''}
          {parsed.suffixes.length > 0 ? `, ${parsed.suffixes.length} suffix column${parsed.suffixes.length === 1 ? '' : 's'}` : ''}
          , {parsed.rows.length} row{parsed.rows.length === 1 ? '' : 's'}.
        </p>
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
        <div className="confirm-dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={handleConfirm}>
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
