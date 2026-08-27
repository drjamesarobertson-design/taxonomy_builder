import { Fragment, useEffect, useState } from 'react';
import type { TaxonomyRow, TaxonomySettings } from './types';
import { createEmptyRow } from './types';
import { getLevelColor } from './colors';
import { toggleCase } from './caseUtils';
import { formatCharRanges, isValidCodeChar, validCodesInRange } from './codeValidation';

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

type CellKind = 'code' | 'desc';

const codeInputId = (level: number, rowId: string) => `code-${level}-${rowId}`;
const descInputId = (level: number, rowId: string) => `desc-${level}-${rowId}`;

export default function Grid({ settings, rows, onChange }: GridProps) {
  const { numLevels, delimiterAfter, maxDescriptionLength } = settings;
  const levels = Array.from({ length: numLevels }, (_, i) => i);
  const overflowChars = Math.max(10, maxDescriptionLength - numLevels);

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

  // Nearest enclosing values in this column, within the same parent group, that the new
  // code must sort between (ASCII, ascending) per CLAUDE.md Section 4.4 / 6.7.
  function findOrderBounds(editIndex: number, level: number) {
    const parentValue = level > 0 ? (rows[editIndex].codes[level - 1] ?? '') : null;
    const oldValue = rows[editIndex].codes[level] ?? '';

    let upper: string | null = null;
    for (let i = editIndex - 1; i >= 0; i--) {
      if (parentValue !== null && (rows[i].codes[level - 1] ?? '') !== parentValue) break;
      const v = rows[i].codes[level] ?? '';
      if (v !== '') {
        upper = v;
        break;
      }
    }

    let lower: string | null = null;
    for (let i = editIndex + 1; i < rows.length; i++) {
      if (parentValue !== null && (rows[i].codes[level - 1] ?? '') !== parentValue) break;
      const v = rows[i].codes[level] ?? '';
      if (v === oldValue) continue; // will be overwritten by the fill-down cascade
      if (v !== '') {
        lower = v;
        break;
      }
    }

    return { upper, lower };
  }

  function updateCode(rowId: string, level: number, value: string) {
    const char = value.slice(-1);
    const editIndex = rows.findIndex((r) => r.id === rowId);
    if (editIndex === -1) return;

    const oldValue = rows[editIndex].codes[level] ?? '';
    // Retyping the same character is a deliberate re-entry (e.g. re-cascading "." padding),
    // not a no-op — it still runs the full cascade/clear-right logic below.
    const isPadding = char === '.';

    if (char !== '' && !isValidCodeChar(char)) {
      window.alert('Invalid code. Valid codes are: ".", 0 to 9, A to Z, a to z');
      return;
    }

    // "." marks "no description / unused from here on" (Section 4.4), so it's exempt from
    // both the ordering rule and the description-correspondence rule below.
    if (char !== '' && !isPadding && !(rows[editIndex].descriptions[level] ?? '').trim()) {
      window.alert(
        'There is no corresponding description, codes can only be entered for columns with a corresponding description entry',
      );
      return;
    }

    if (char !== '' && !isPadding && char !== oldValue) {
      const { upper, lower } = findOrderBounds(editIndex, level);
      const tooLow = upper !== null && char.charCodeAt(0) <= upper.charCodeAt(0);
      const tooHigh = lower !== null && char.charCodeAt(0) >= lower.charCodeAt(0);
      if (tooLow || tooHigh) {
        const validList = formatCharRanges(validCodesInRange(upper, lower));
        window.alert(`Code must increase. Valid codes are: ${validList}`);
        return;
      }
    }

    const parentValue = level > 0 ? (rows[editIndex].codes[level - 1] ?? '') : null;
    let cascadeActive = true;

    // "." fills every column to the right with "." too (padding runs to the end of the
    // row); any other value simply clears the columns to the right, per Section 4.4/6.3.
    function applyCode(row: TaxonomyRow): TaxonomyRow {
      const codes = row.codes.map((c, i) => (i === level ? char : i > level ? (isPadding ? '.' : '') : c));
      return { ...row, codes };
    }

    onChange(
      rows.map((row, idx) => {
        if (idx < editIndex) return row;
        if (idx === editIndex) return applyCode(row);
        if (!cascadeActive) return row;
        const rowParent = level > 0 ? (row.codes[level - 1] ?? '') : null;
        const rowOwnOld = row.codes[level] ?? '';
        if ((parentValue !== null && rowParent !== parentValue) || rowOwnOld !== oldValue) {
          cascadeActive = false;
          return row;
        }
        return applyCode(row);
      }),
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
    const previous = rows[rows.length - 1];
    const newRow = createEmptyRow(numLevels);
    if (previous) newRow.codes = [...previous.codes];
    onChange([...rows, newRow]);
  }

  function removeRow(rowId: string) {
    onChange(rows.filter((row) => row.id !== rowId));
  }

  function focusCell(kind: CellKind, level: number, rowIndex: number) {
    if (level < 0 || level >= numLevels) return;
    const row = rows[rowIndex];
    if (!row) return;
    const id = kind === 'code' ? codeInputId(level, row.id) : descInputId(level, row.id);
    document.getElementById(id)?.focus();
  }

  function handleCellKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    kind: CellKind,
    level: number,
    rowIndex: number,
  ) {
    const input = e.currentTarget;

    // Retyping the exact character a code cell already holds is a deliberate re-entry
    // (e.g. re-cascading "." padding), but the browser never fires onChange when the
    // resulting value is unchanged — so handle that case here instead.
    if (kind === 'code' && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const row = rows[rowIndex];
      if (row && (row.codes[level] ?? '') === e.key) {
        e.preventDefault();
        updateCode(row.id, level, e.key);
        return;
      }
    }

    switch (e.key) {
      case 'Enter':
      case 'ArrowDown':
        e.preventDefault();
        focusCell(kind, level, rowIndex + 1);
        return;
      case 'ArrowUp':
        e.preventDefault();
        focusCell(kind, level, rowIndex - 1);
        return;
      case 'ArrowLeft':
        // Code cells hold a single character, so there's no meaningful mid-text caret
        // position to preserve — always move to the adjacent cell. Description cells only
        // move when the caret is already at that edge, so normal text navigation still works.
        if (kind === 'code' || (input.selectionStart === 0 && input.selectionEnd === 0)) {
          e.preventDefault();
          focusCell(kind, level - 1, rowIndex);
        }
        return;
      case 'ArrowRight':
        if (
          kind === 'code' ||
          (input.selectionStart === input.value.length && input.selectionEnd === input.value.length)
        ) {
          e.preventDefault();
          focusCell(kind, level + 1, rowIndex);
        }
        return;
      default:
        return;
    }
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
            <th className="gap-col">&nbsp;</th>
            {levels.map((level) => (
              <th
                key={`desc-h-${level}`}
                className="desc-col"
                style={{ backgroundColor: getLevelColor(level) }}
              >
                {level + 1}
              </th>
            ))}
            <th className="overflow-col" style={{ width: `${overflowChars}ch` }}>
              &nbsp;
            </th>
            <th className="row-actions-col">&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.id}>
              {levels.map((level) => (
                <Fragment key={`code-${row.id}-${level}`}>
                  <td className="code-col" style={{ backgroundColor: getLevelColor(level) }}>
                    <input
                      id={codeInputId(level, row.id)}
                      className="code-cell"
                      type="text"
                      maxLength={1}
                      value={row.codes[level] ?? ''}
                      onChange={(e) => updateCode(row.id, level, e.target.value)}
                      onKeyDown={(e) => handleCellKeyDown(e, 'code', level, rowIndex)}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                  </td>
                  {level + 1 === delimiterAfter && <td className="delim-col">-</td>}
                </Fragment>
              ))}
              <td className="gap-col">&nbsp;</td>
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
                      id={descInputId(level, row.id)}
                      className="desc-cell"
                      style={{
                        width: `${Math.max(1, (row.descriptions[level]?.length ?? 0) + 2)}ch`,
                      }}
                      type="text"
                      value={row.descriptions[level] ?? ''}
                      onChange={(e) => updateDescription(row.id, level, e.target.value)}
                      onKeyDown={(e) => handleCellKeyDown(e, 'desc', level, rowIndex)}
                    />
                  </td>
                );
              })}
              <td className="overflow-col" style={{ width: `${overflowChars}ch` }} />
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
