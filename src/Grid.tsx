import { Fragment } from 'react';
import type { TaxonomyRow, TaxonomySettings } from './types';
import { createEmptyRow } from './types';

interface GridProps {
  settings: TaxonomySettings;
  rows: TaxonomyRow[];
  onChange: (rows: TaxonomyRow[]) => void;
}

export default function Grid({ settings, rows, onChange }: GridProps) {
  const { numLevels, delimiterAfter } = settings;
  const levels = Array.from({ length: numLevels }, (_, i) => i);

  function updateCode(rowId: string, level: number, value: string) {
    const char = value.slice(-1);
    onChange(
      rows.map((row) =>
        row.id === rowId
          ? { ...row, codes: row.codes.map((c, i) => (i === level ? char : c)) }
          : row,
      ),
    );
  }

  function updateDescription(rowId: string, level: number, value: string) {
    onChange(
      rows.map((row) =>
        row.id === rowId
          ? { ...row, descriptions: row.descriptions.map((d, i) => (i === level ? value : d)) }
          : row,
      ),
    );
  }

  function addRow() {
    onChange([...rows, createEmptyRow(numLevels)]);
  }

  function removeRow(rowId: string) {
    onChange(rows.filter((row) => row.id !== rowId));
  }

  return (
    <div className="grid-wrapper">
      <table className="taxonomy-grid">
        <thead>
          <tr>
            {levels.map((level) => (
              <Fragment key={`code-h-${level}`}>
                <th className="code-col">Code {level + 1}</th>
                {level + 1 === delimiterAfter && <th className="delim-col">&nbsp;</th>}
              </Fragment>
            ))}
            {levels.map((level) => (
              <th key={`desc-h-${level}`} className="desc-col">
                Description {level + 1}
              </th>
            ))}
            <th className="row-actions-col">&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {levels.map((level) => (
                <Fragment key={`code-${row.id}-${level}`}>
                  <td className="code-col">
                    <input
                      className="code-cell"
                      type="text"
                      maxLength={1}
                      value={row.codes[level] ?? ''}
                      onChange={(e) => updateCode(row.id, level, e.target.value)}
                    />
                  </td>
                  {level + 1 === delimiterAfter && <td className="delim-col">-</td>}
                </Fragment>
              ))}
              {levels.map((level) => (
                <td key={`desc-${row.id}-${level}`} className="desc-col">
                  <input
                    className="desc-cell"
                    type="text"
                    value={row.descriptions[level] ?? ''}
                    onChange={(e) => updateDescription(row.id, level, e.target.value)}
                  />
                </td>
              ))}
              <td className="row-actions-col">
                <button
                  type="button"
                  className="remove-row-btn"
                  onClick={() => removeRow(row.id)}
                  title="Remove row"
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="add-row-btn" onClick={addRow}>
        + Add Row
      </button>
    </div>
  );
}
