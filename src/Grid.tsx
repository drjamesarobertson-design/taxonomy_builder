import { Fragment, useEffect, useState } from 'react';
import type { TaxonomyRow, TaxonomySettings } from './types';
import { createEmptyRow } from './types';
import { getLevelColor } from './colors';
import { toggleCase } from './caseUtils';

interface GridProps {
  settings: TaxonomySettings;
  rows: TaxonomyRow[];
  onChange: (rows: TaxonomyRow[]) => void;
}

interface Selection {
  level: number;
  rowIds: Set<string>;
}

interface ContextMenuState {
  x: number;
  y: number;
  level: number;
}

export default function Grid({ settings, rows, onChange }: GridProps) {
  const { numLevels, delimiterAfter } = settings;
  const levels = Array.from({ length: numLevels }, (_, i) => i);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [anchorRowId, setAnchorRowId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [contextMenu]);

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

  function handleDescMouseDown(rowId: string, level: number, e: React.MouseEvent) {
    if (e.button !== 0) return; // right/middle click: leave selection to handleDescContextMenu
    if (e.shiftKey && selection && selection.level === level && anchorRowId) {
      const ids = rows.map((r) => r.id);
      const anchorIdx = ids.indexOf(anchorRowId);
      const clickIdx = ids.indexOf(rowId);
      const [start, end] = anchorIdx < clickIdx ? [anchorIdx, clickIdx] : [clickIdx, anchorIdx];
      setSelection({ level, rowIds: new Set(ids.slice(start, end + 1)) });
      return;
    }
    if ((e.ctrlKey || e.metaKey) && selection && selection.level === level) {
      const rowIds = new Set(selection.rowIds);
      if (rowIds.has(rowId)) rowIds.delete(rowId);
      else rowIds.add(rowId);
      setSelection({ level, rowIds });
      return;
    }
    setSelection({ level, rowIds: new Set([rowId]) });
    setAnchorRowId(rowId);
  }

  function handleDescContextMenu(rowId: string, level: number, e: React.MouseEvent) {
    e.preventDefault();
    let activeSelection = selection;
    if (!selection || selection.level !== level || !selection.rowIds.has(rowId)) {
      activeSelection = { level, rowIds: new Set([rowId]) };
      setSelection(activeSelection);
      setAnchorRowId(rowId);
    }
    setContextMenu({ x: e.clientX, y: e.clientY, level });
  }

  function handleToggleCase() {
    if (!contextMenu || !selection) return;
    const { level } = contextMenu;
    onChange(
      rows.map((row) =>
        selection.rowIds.has(row.id)
          ? {
              ...row,
              descriptions: row.descriptions.map((d, i) => (i === level ? toggleCase(d) : d)),
            }
          : row,
      ),
    );
    setContextMenu(null);
  }

  return (
    <div className="grid-wrapper">
      <table className="taxonomy-grid">
        <thead>
          <tr>
            {levels.map((level) => (
              <Fragment key={`code-h-${level}`}>
                <th className="code-col" style={{ backgroundColor: getLevelColor(level) }}>
                  {level + 1}
                </th>
                {level + 1 === delimiterAfter && <th className="delim-col">&nbsp;</th>}
              </Fragment>
            ))}
            {levels.map((level) => (
              <th
                key={`desc-h-${level}`}
                className="desc-col"
                style={{ backgroundColor: getLevelColor(level) }}
              >
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
                  <td className="code-col" style={{ backgroundColor: getLevelColor(level) }}>
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
              {levels.map((level) => {
                const isSelected =
                  selection?.level === level && selection.rowIds.has(row.id);
                return (
                  <td
                    key={`desc-${row.id}-${level}`}
                    className={`desc-col${isSelected ? ' desc-col-selected' : ''}`}
                    style={{ backgroundColor: getLevelColor(level) }}
                    onMouseDown={(e) => handleDescMouseDown(row.id, level, e)}
                    onContextMenu={(e) => handleDescContextMenu(row.id, level, e)}
                  >
                    <input
                      className="desc-cell"
                      style={{
                        paddingLeft: `calc(4px + ${level}ch)`,
                        width: `${Math.max(24, level + (row.descriptions[level]?.length ?? 0) + 4)}ch`,
                      }}
                      type="text"
                      value={row.descriptions[level] ?? ''}
                      onChange={(e) => updateDescription(row.id, level, e.target.value)}
                    />
                  </td>
                );
              })}
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

      {contextMenu && (
        <ul
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <li onClick={handleToggleCase}>Toggle Case</li>
        </ul>
      )}
    </div>
  );
}
