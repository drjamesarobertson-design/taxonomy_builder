import { useState } from 'react';
import type { ParsedDiscreteCsv } from './csvImport';
import HelpIcon from './HelpIcon';
import Tooltip from './Tooltip';
import type { HelpTextMap } from './helpText';

export interface CsvImportFields {
  title: string;
  tableName: string;
  purpose: string;
  maxDescriptionLength: number;
  dropCodes: boolean;
}

interface CsvImportConfirmProps {
  parsed: ParsedDiscreteCsv;
  defaultTitle: string;
  onConfirm: (fields: CsvImportFields) => void;
  onCancel: () => void;
  helpText: HelpTextMap;
}

// A CSV has no way to carry a taxonomy's title/table name/purpose (Section 5 step 1) or its
// Maximum ERP Description Field Length — everything else (level count, delimiter positions,
// suffix columns) is read straight off the file's own structure (csvImport.ts), so this only
// asks for what the file genuinely can't tell us, with a summary of what was detected so the
// import isn't a total leap of faith.
export default function CsvImportConfirm({ parsed, defaultTitle, onConfirm, onCancel, helpText }: CsvImportConfirmProps) {
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
  // James's ask: a way to bring in just the headings/descriptions from a source file and start
  // coding fresh, when the source's own codes aren't worth carrying over (e.g. from a different
  // system's own scheme). Row/level structure — which description lands in which column — is
  // still read from the file's codes as usual; this only blanks the actual code values afterward
  // (App.tsx's handleCsvImportConfirm), leaving every cell ready for manual or Auto Code entry.
  const [dropCodes, setDropCodes] = useState(false);

  function handleConfirm() {
    if (!title.trim() || !tableName.trim()) return;
    onConfirm({
      title: title.trim(),
      tableName: tableName.trim(),
      purpose: purpose.trim(),
      maxDescriptionLength: Math.max(1, Number(maxDescriptionLengthText) || 40),
      dropCodes,
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
        <label className="checkbox-label">
          <input type="checkbox" checked={dropCodes} onChange={(e) => setDropCodes(e.target.checked)} />
          Descriptions only — drop the file's codes and start coding fresh
          <HelpIcon field="csvImportDropCodes" helpText={helpText} />
        </label>
        <div className="confirm-dialog-actions">
          <Tooltip field="btnCsvImportCancel" helpText={helpText}>
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
          </Tooltip>
          <Tooltip field="btnCsvImportConfirm" helpText={helpText}>
            <button type="button" onClick={handleConfirm}>
              Import
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
