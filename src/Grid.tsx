import { Fragment, useEffect, useRef, useState } from 'react';
import type { TaxonomyRow, TaxonomySettings } from './types';
import { createEmptyRow } from './types';
import { getLevelColor } from './colors';
import { toggleCase } from './caseUtils';
import { isValidCodeChar } from './codeValidation';

interface GridProps {
  settings: TaxonomySettings;
  rows: TaxonomyRow[];
  /**
   * coalesceKey, when present, identifies the single field being edited (e.g. a specific
   * code or description cell) — the caller uses it to merge consecutive edits to the same
   * field into one undo step, without Grid needing to know anything about undo itself.
   */
  onChange: (rows: TaxonomyRow[], coalesceKey?: string) => void;
  /** Focus the first row's first description cell once, on mount (freshly created taxonomy). */
  autoFocusFirstRow?: boolean;
}

type CellKind = 'code' | 'desc';

interface Selection {
  kind: CellKind;
  level: number;
  /** For a code-cell selection spanning several columns; absent (or equal to level) for a
   * single-column selection. Description selections are always single-column. */
  levelEnd?: number;
  rowIds: Set<string>;
}

interface ContextMenuState {
  kind: CellKind;
  x: number;
  y: number;
  level: number;
  rowId: string;
}

const codeInputId = (level: number, rowId: string) => `code-${level}-${rowId}`;
const descInputId = (level: number, rowId: string) => `desc-${level}-${rowId}`;

export default function Grid({ settings, rows, onChange, autoFocusFirstRow }: GridProps) {
  const { numLevels, delimiterPositions, maxDescriptionLength, suffixes } = settings;
  const levels = Array.from({ length: numLevels }, (_, i) => i);
  // The wide overflow column gets whatever's left of the configured max description length
  // after reserving one character per description level (Section 6.7's indent padding) and
  // the width of every suffix column plus its own delimiter.
  const suffixTotalWidth = suffixes.reduce((sum, s) => sum + 1 + s.width, 0);
  const overflowChars = Math.max(4, maxDescriptionLength - numLevels - suffixTotalWidth);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [anchorRowId, setAnchorRowId] = useState<string | null>(null);
  const [anchorLevel, setAnchorLevel] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);
  const [promoteDemoteChoice, setPromoteDemoteChoice] = useState<{
    direction: 'promote' | 'demote';
  } | null>(null);
  // "Move" mode (click a cell, choose Move, then click a target row): the set of row ids
  // being relocated, and — once a target row has been clicked — that target, awaiting an
  // above/below choice.
  const [moveMode, setMoveMode] = useState<{ rowIds: Set<string> } | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ rowId: string } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmDialogRef = useRef<HTMLDivElement>(null);
  const promoteDemoteDialogRef = useRef<HTMLDivElement>(null);
  const moveDialogRef = useRef<HTMLDivElement>(null);
  // Tracks a click-and-drag range-select in progress; a ref (not state) since it doesn't
  // itself need to trigger a render, only the selection it produces does.
  const isDraggingRef = useRef(false);

  useEffect(() => {
    // A native window.alert() can be dismissed by keystrokes the user is still buffering
    // in from typing (e.g. a focused OK button treats a buffered Enter as a click), so it
    // can flash and vanish before it's read. This dialog closes only on an explicit mouse
    // click: focus goes to the (non-interactive) dialog itself, not the OK button, so no
    // keystroke — buffered or otherwise — can activate anything.
    if (validationError) dialogRef.current?.focus();
  }, [validationError]);

  useEffect(() => {
    if (confirmDialog) confirmDialogRef.current?.focus();
  }, [confirmDialog]);

  useEffect(() => {
    if (promoteDemoteChoice) promoteDemoteDialogRef.current?.focus();
  }, [promoteDemoteChoice]);

  useEffect(() => {
    if (moveTarget) moveDialogRef.current?.focus();
  }, [moveTarget]);

  useEffect(() => {
    // Ends a click-and-drag range-select no matter where the mouse is released.
    const endDrag = () => {
      isDraggingRef.current = false;
    };
    window.addEventListener('mouseup', endDrag);
    return () => window.removeEventListener('mouseup', endDrag);
  }, []);

  useEffect(() => {
    // Code cells are only 1 character wide, so a real (non-synthetic) mouse drag easily
    // moves fast enough to skip straight over one without ever firing its own mouseenter —
    // especially sideways, across several of them, to form a multi-column block. A mousemove
    // listener that re-derives the cell under the cursor on every move (via elementFromPoint,
    // keyed by the data-* attributes below) doesn't depend on "entering" any single narrow
    // target, so it keeps up regardless of how fast the drag moves.
    function handleMouseMove(e: MouseEvent) {
      if (!isDraggingRef.current || moveMode) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el instanceof Element ? el.closest('[data-cell-kind]') : null;
      if (!cell) return;
      const kind = cell.getAttribute('data-cell-kind') as CellKind | null;
      const rowId = cell.getAttribute('data-row-id');
      const levelAttr = cell.getAttribute('data-level');
      if (!kind || !rowId || levelAttr === null) return;
      extendDragSelection(kind, rowId, Number(levelAttr));
    }
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  });

  useEffect(() => {
    if (!moveMode) return;
    const cancelOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMoveMode(null);
        setMoveTarget(null);
      }
    };
    window.addEventListener('keydown', cancelOnEscape);
    return () => window.removeEventListener('keydown', cancelOnEscape);
  }, [moveMode]);

  useEffect(() => {
    // A freshly created taxonomy starts with one empty row already in place — put the
    // cursor straight on it instead of leaving the user to click in.
    if (autoFocusFirstRow && rows.length > 0) {
      const firstRowId = rows[0].id;
      requestAnimationFrame(() => {
        document.getElementById(descInputId(0, firstRowId))?.focus();
      });
    }
    // Mount-only: this is meant to fire once for the row the taxonomy was created with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // The rightmost description column used anywhere in the taxonomy. A code (real or "."
  // padding) can only exist at or to the left of this column — there's no level of the
  // hierarchy deeper than the deepest description anyone has actually written yet.
  function getMaxDescriptionColumn(): number {
    let max = -1;
    for (const row of rows) {
      for (let i = row.descriptions.length - 1; i > max; i--) {
        if ((row.descriptions[i] ?? '').trim()) {
          max = i;
          break;
        }
      }
    }
    return max;
  }

  // Nearest enclosing values in this column, within the same parent group, that the new
  // code must sort between (ASCII, ascending) per CLAUDE.md Section 4.4 / 6.7. The lower
  // bound skips any row that the cascade below will sweep up (blank, or smaller than char)
  // since those aren't real boundaries — only a row that will survive the cascade is.
  function findOrderBounds(editIndex: number, level: number, char: string) {
    const parentValue = level > 0 ? (rows[editIndex].codes[level - 1] ?? '') : null;

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
      if (v === '' || v.charCodeAt(0) < char.charCodeAt(0)) continue; // will be swept up by the cascade
      lower = v;
      break;
    }

    return { upper, lower };
  }

  function updateCode(
    rowId: string,
    level: number,
    value: string,
    options?: { skipOrderCheck?: boolean },
  ) {
    if (value.length > 1) {
      setValidationError('Only one character permitted');
      return;
    }
    const char = value;
    const editIndex = rows.findIndex((r) => r.id === rowId);
    if (editIndex === -1) return;

    const oldValue = rows[editIndex].codes[level] ?? '';
    // Retyping the same character is a deliberate re-entry (e.g. re-cascading "." padding),
    // not a no-op — it still runs the full cascade/clear-right logic below.
    const isPadding = char === '.';

    if (char !== '' && !isValidCodeChar(char)) {
      setValidationError('Invalid code. Valid codes are: ".", 0 to 9, A to Z, a to z');
      return;
    }

    // Codes must populate left to right — every column before this one must already hold
    // a value (real or padding) before this one can.
    if (char !== '') {
      for (let i = 0; i < level; i++) {
        if (!(rows[editIndex].codes[i] ?? '')) {
          setValidationError('Code to left is blank, codes must populate from left to right');
          return;
        }
      }
    }

    // No code — real or "." padding — can exist to the right of the deepest description
    // written anywhere in the taxonomy; there's no level of hierarchy deeper than that yet.
    const maxDescCol = getMaxDescriptionColumn();
    if (char !== '' && level > maxDescCol) {
      setValidationError(
        'There are no descriptions in this column, codes can only be entered for columns covered by the description hierarchy',
      );
      return;
    }

    if (char !== '' && !isPadding && char !== oldValue && !options?.skipOrderCheck) {
      const { upper, lower } = findOrderBounds(editIndex, level, char);
      const tooLow = upper !== null && char.charCodeAt(0) <= upper.charCodeAt(0);
      const tooHigh = lower !== null && char.charCodeAt(0) >= lower.charCodeAt(0);
      if (tooLow || tooHigh) {
        // Section 4.4/6.7's ascending-order rule is a hard rule everywhere else, but James
        // asked for an escape hatch here specifically — mid-restructure, a user may know a
        // "backwards" value is exactly what they want for now. Override re-runs this same
        // update bypassing only this check, not the others (charset, left-to-right, etc).
        setConfirmDialog({
          message: 'Codes should increase, lesser value is invalid—Override?',
          confirmLabel: 'Override',
          onConfirm: () => updateCode(rowId, level, value, { skipOrderCheck: true }),
        });
        return;
      }
    }

    const parentValue = level > 0 ? (rows[editIndex].codes[level - 1] ?? '') : null;

    // "." fills every column to the right with "." too, but no further than the deepest
    // description written anywhere (Section 4.4); any other value simply clears the
    // columns to the right, per Section 4.4/6.3.
    function applyCode(row: TaxonomyRow): TaxonomyRow {
      const codes = row.codes.map((c, i) =>
        i === level ? char : i > level ? (isPadding && i <= maxDescCol ? '.' : '') : c,
      );
      return { ...row, codes };
    }

    if (isPadding) {
      // "." replicates right across every column up to the deepest description (applied to
      // the edited row via applyCode), then cascades down through blank cells below — but
      // each of those replicated columns cascades independently, stopping only when THAT
      // column hits a non-blank cell, not the moment any other column happens to.
      let end = rows.length;
      for (let i = editIndex + 1; i < rows.length; i++) {
        const rowParent = level > 0 ? (rows[i].codes[level - 1] ?? '') : null;
        if (parentValue !== null && rowParent !== parentValue) {
          end = i;
          break;
        }
      }
      const updated = rows.map((row, idx) =>
        idx === editIndex ? applyCode(row) : { ...row, codes: [...row.codes] },
      );
      for (let c = level; c <= maxDescCol; c++) {
        for (let i = editIndex + 1; i < end; i++) {
          if ((updated[i].codes[c] ?? '') === '') {
            updated[i].codes[c] = '.';
          } else {
            break;
          }
        }
      }
      onChange(updated, `code:${level}:${rowId}`);
      return;
    }

    let cascadeActive = true;
    onChange(
      rows.map((row, idx) => {
        if (idx < editIndex) return row;
        if (idx === editIndex) return applyCode(row);
        if (!cascadeActive) return row;
        const rowParent = level > 0 ? (row.codes[level - 1] ?? '') : null;
        if (parentValue !== null && rowParent !== parentValue) {
          cascadeActive = false;
          return row;
        }
        const rowOwnOld = row.codes[level] ?? '';
        if (char === '') {
          // Clearing propagates only through rows that held the exact value being cleared.
          if (rowOwnOld !== oldValue) {
            cascadeActive = false;
            return row;
          }
        } else {
          // A real code sweeps through blank cells and any smaller value below it, and
          // stops at the first cell that already holds an equal or greater one.
          if (rowOwnOld !== '' && rowOwnOld.charCodeAt(0) >= char.charCodeAt(0)) {
            cascadeActive = false;
            return row;
          }
        }
        return applyCode(row);
      }),
      `code:${level}:${rowId}`,
    );
  }

  function updateDescription(rowId: string, level: number, value: string) {
    const editIndex = rows.findIndex((r) => r.id === rowId);
    if (editIndex === -1) return;

    // A row has exactly one populated description column — the one matching its level
    // (Section 4.1). Typing into a second column while another already holds text would
    // leave the row with two simultaneous descriptions, which breaks that invariant, so it's
    // blocked outright; the existing entry must be cleared first.
    if (value.trim()) {
      const otherFilledLevel = rows[editIndex].descriptions.findIndex(
        (d, i) => i !== level && (d ?? '').trim(),
      );
      if (otherFilledLevel !== -1) {
        setValidationError('A row can only have one description — clear the existing entry first.');
        return;
      }
    }

    // A description can move left any number of columns, but rightward only one column
    // at a time — it can't skip a level of the hierarchy that was never established.
    const wasEmpty = !(rows[editIndex].descriptions[level] ?? '').trim();
    if (wasEmpty && value.trim()) {
      let prevDepth: number | null = null;
      for (let i = editIndex - 1; i >= 0 && prevDepth === null; i--) {
        for (let j = rows[i].descriptions.length - 1; j >= 0; j--) {
          if ((rows[i].descriptions[j] ?? '').trim()) {
            prevDepth = j;
            break;
          }
        }
      }
      if (prevDepth !== null && level > prevDepth + 1) {
        setValidationError('Descriptions must cascade no more than one column right');
        return;
      }
    }

    onChange(
      rows.map((row) =>
        row.id === rowId
          ? { ...row, descriptions: row.descriptions.map((d, i) => (i === level ? value : d)) }
          : row,
      ),
      `desc:${level}:${rowId}`,
    );
  }

  // Edits an "editable" suffix column's per-row value (Section 3-adjacent: user-defined
  // suffixes). "Constant" suffixes aren't edited in the grid at all — their value comes
  // straight from settings and is the same for every row.
  function updateSuffix(rowId: string, index: number, value: string) {
    const width = settings.suffixes[index]?.width ?? 8;
    const clamped = value.slice(0, width);
    onChange(
      rows.map((row) =>
        row.id === rowId
          ? { ...row, suffixValues: row.suffixValues.map((v, i) => (i === index ? clamped : v)) }
          : row,
      ),
      `suffix:${index}:${rowId}`,
    );
  }

  // Editable suffix values are free text, not a code, so a duplicate isn't invalid — just
  // flagged once the user leaves the cell, in case it wasn't intentional (e.g. a copy/paste
  // slip). Purely informational: it never blocks or changes the entry.
  function checkSuffixDuplicate(rowId: string, index: number) {
    const value = (rows.find((r) => r.id === rowId)?.suffixValues[index] ?? '').trim();
    if (!value) return;
    const isDuplicate = rows.some((r) => r.id !== rowId && (r.suffixValues[index] ?? '').trim() === value);
    if (isDuplicate) setValidationError('Duplicate Entry');
  }

  function createRowInheritingFrom(previous?: TaxonomyRow): TaxonomyRow {
    const newRow = createEmptyRow(numLevels, settings.suffixes.length);
    if (previous) newRow.codes = [...previous.codes];
    return newRow;
  }

  function addRow() {
    onChange([...rows, createRowInheritingFrom(rows[rows.length - 1])]);
  }

  // Deletes a row (Section 6.5). If it has children, warns first — they'd be deleted along
  // with it — via a confirm dialog rather than the immediate delete used for a childless row.
  function deleteRow(rowId: string) {
    const idx = rows.findIndex((r) => r.id === rowId);
    if (idx === -1) return;
    const level = levelOf(rows[idx]);
    const end = level === -1 ? idx + 1 : getDescendantEndIndex(idx);
    const hasChildren = end > idx + 1;
    const doDelete = () => onChange(rows.filter((_, i) => i < idx || i >= end));
    if (hasChildren) {
      setConfirmDialog({
        message: 'This entry has child entries — deleting it will delete its children too. Continue?',
        onConfirm: doDelete,
      });
    } else {
      doDelete();
    }
  }

  // How many rows "Insert Row Above/Below" would add for the current context menu: more
  // than one when the row it was opened on is part of a multi-row drag/shift-click
  // selection — dragging down a column to highlight a range is how many rows to insert.
  function pendingInsertCount(): number {
    if (!contextMenu) return 1;
    if (selection && selection.rowIds.has(contextMenu.rowId) && selection.rowIds.size > 1) {
      return selection.rowIds.size;
    }
    return 1;
  }

  // Right-click "Insert Row(s) Above" / "Insert Row(s) Below" (Section 6.5) — one or more
  // blank new entries. For a single row, relative to whichever row the context menu was
  // opened on; for a multi-row drag/shift-click selection, relative to the top (Above) or
  // bottom (Below) of the whole selected range, not wherever within it was right-clicked.
  function handleInsertRow(position: 'above' | 'below') {
    if (!contextMenu) return;
    const count = pendingInsertCount();
    let idx: number;
    if (count > 1 && selection) {
      const selectedIndices = rows
        .map((r, i) => (selection.rowIds.has(r.id) ? i : -1))
        .filter((i) => i !== -1);
      idx = position === 'above' ? Math.min(...selectedIndices) : Math.max(...selectedIndices);
    } else {
      idx = rows.findIndex((r) => r.id === contextMenu.rowId);
    }
    if (idx === -1) return;
    const refLevel = Math.max(0, levelOf(rows[idx]));
    const insertAt = position === 'above' ? idx : idx + 1;
    // Each new row's codes are duplicated from whichever row ends up directly above it —
    // the same "inherit, then recode manually" convention Add Row already uses — rather
    // than left blank; only the descriptions start empty.
    let previous = insertAt > 0 ? rows[insertAt - 1] : undefined;
    const newRows: TaxonomyRow[] = [];
    for (let i = 0; i < count; i++) {
      const newRow = createRowInheritingFrom(previous);
      newRows.push(newRow);
      previous = newRow;
    }
    onChange([...rows.slice(0, insertAt), ...newRows, ...rows.slice(insertAt)]);
    setSelection(null);
    setContextMenu(null);
    requestAnimationFrame(() => {
      document.getElementById(descInputId(refLevel, newRows[0].id))?.focus();
    });
  }

  function handleDeleteRowFromMenu() {
    if (!contextMenu) return;
    const rowId = contextMenu.rowId;
    setContextMenu(null);
    deleteRow(rowId);
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
    // Code cells handle every printable keystroke here directly, rather than letting the
    // browser insert it natively and relying on onChange: a maxLength=1 field that's
    // already focused (no fresh focus event, so nothing gets selected) silently blocks a
    // second character at the native level, and separately, retyping the exact character
    // already there (e.g. re-cascading "." padding) never fires a change event because the
    // value doesn't change. Handling the key ourselves sidesteps both.
    if (kind === 'code' && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const row = rows[rowIndex];
      if (row) updateCode(row.id, level, e.key);
      return;
    }

    switch (e.key) {
      case 'Enter':
      case 'ArrowDown': {
        e.preventDefault();
        const isLastRow = rowIndex === rows.length - 1;
        if (kind === 'desc' && isLastRow) {
          const newRow = createRowInheritingFrom(rows[rowIndex]);
          onChange([...rows, newRow]);
          requestAnimationFrame(() => {
            document.getElementById(descInputId(level, newRow.id))?.focus();
          });
          return;
        }
        focusCell(kind, level, rowIndex + 1);
        return;
      }
      case 'ArrowUp':
        e.preventDefault();
        focusCell(kind, level, rowIndex - 1);
        return;
      case 'ArrowLeft':
        // Cells always exit to the adjacent one on arrow keys, rather than moving a text
        // caret within the field — consistent, spreadsheet-style navigation.
        e.preventDefault();
        focusCell(kind, level - 1, rowIndex);
        return;
      case 'ArrowRight':
        e.preventDefault();
        focusCell(kind, level + 1, rowIndex);
        return;
      default:
        return;
    }
  }

  // Shift-click extends a contiguous range from the anchor; ctrl/cmd-click toggles one row
  // in or out; a plain click starts a fresh single-cell selection (and arms drag-select, so
  // dragging down the column extends it the same way shift-click would). Shared by code and
  // description cells. A code selection can also span several columns — shift-clicking or
  // dragging into a different column extends a rectangular block, so codes can be replicated
  // across more than one column at once — but a description selection always stays within
  // its own column, since Toggle Case/Promote/Demote/Move are inherently single-column.
  function handleCellMouseDown(kind: CellKind, rowId: string, level: number, e: React.MouseEvent) {
    if (e.button !== 0) return; // right/middle click: leave selection to handleCellContextMenu
    if (moveMode) {
      if (moveMode.rowIds.has(rowId)) {
        setValidationError('Cannot move an entry into itself or its own children.');
        return;
      }
      setMoveTarget({ rowId });
      return;
    }
    if (e.shiftKey && selection && selection.kind === kind && anchorRowId && anchorLevel !== null) {
      const ids = rows.map((r) => r.id);
      const anchorIdx = ids.indexOf(anchorRowId);
      const clickIdx = ids.indexOf(rowId);
      const [start, end] = anchorIdx < clickIdx ? [anchorIdx, clickIdx] : [clickIdx, anchorIdx];
      const rowIds = new Set(ids.slice(start, end + 1));
      if (kind === 'code') {
        const [colStart, colEnd] = anchorLevel <= level ? [anchorLevel, level] : [level, anchorLevel];
        setSelection({ kind, level: colStart, levelEnd: colEnd, rowIds });
      } else {
        setSelection({ kind, level: anchorLevel, rowIds });
      }
      return;
    }
    if (
      (e.ctrlKey || e.metaKey) &&
      selection &&
      selection.kind === kind &&
      selection.level === level &&
      !selection.levelEnd
    ) {
      const rowIds = new Set(selection.rowIds);
      if (rowIds.has(rowId)) rowIds.delete(rowId);
      else rowIds.add(rowId);
      setSelection({ kind, level, rowIds });
      return;
    }
    setSelection({ kind, level, rowIds: new Set([rowId]) });
    setAnchorRowId(rowId);
    setAnchorLevel(level);
    isDraggingRef.current = true;
  }

  // Extends the selection to include (rowId, level) while a click-and-drag is in progress
  // (Section 6.5's "drag cursor down column to highlight range"), matching shift-click's
  // range-from-anchor behaviour — including, for code cells, dragging sideways into a
  // rectangular multi-column block.
  function extendDragSelection(kind: CellKind, rowId: string, level: number) {
    if (!selection || selection.kind !== kind || anchorRowId === null || anchorLevel === null) return;
    const ids = rows.map((r) => r.id);
    const anchorIdx = ids.indexOf(anchorRowId);
    const hoverIdx = ids.indexOf(rowId);
    if (anchorIdx === -1 || hoverIdx === -1) return;
    const [start, end] = anchorIdx < hoverIdx ? [anchorIdx, hoverIdx] : [hoverIdx, anchorIdx];
    const rowIds = new Set(ids.slice(start, end + 1));
    if (kind === 'code') {
      const [colStart, colEnd] = anchorLevel <= level ? [anchorLevel, level] : [level, anchorLevel];
      setSelection({ kind, level: colStart, levelEnd: colEnd, rowIds });
    } else {
      setSelection({ kind, level: anchorLevel, rowIds });
    }
  }

  function handleCellMouseEnter(kind: CellKind, rowId: string, level: number) {
    if (!isDraggingRef.current || moveMode) return;
    extendDragSelection(kind, rowId, level);
  }

  function handleCellContextMenu(kind: CellKind, rowId: string, level: number, e: React.MouseEvent) {
    e.preventDefault();
    const inRange =
      selection &&
      selection.kind === kind &&
      selection.rowIds.has(rowId) &&
      level >= selection.level &&
      level <= (selection.levelEnd ?? selection.level);
    if (!inRange) {
      setSelection({ kind, level, rowIds: new Set([rowId]) });
      setAnchorRowId(rowId);
      setAnchorLevel(level);
    }
    setContextMenu({ kind, x: e.clientX, y: e.clientY, level, rowId });
  }

  function handleToggleCase() {
    if (!contextMenu || contextMenu.kind !== 'desc' || !selection) return;
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

  // Clears every selected code cell in this column, and blanks each affected row's deeper
  // codes too, per the same rule as any other code change (Section 4.4/6.3).
  function handleDeleteCodes() {
    if (!contextMenu || contextMenu.kind !== 'code' || !selection) return;
    const { level } = contextMenu;
    onChange(
      rows.map((row) =>
        selection.rowIds.has(row.id)
          ? { ...row, codes: row.codes.map((c, i) => (i >= level ? '' : c)) }
          : row,
      ),
    );
    setSelection(null);
    setContextMenu(null);
  }

  // Right-click "Replicate Codes Above" — recovers codes that were deleted (or never
  // entered) by copying the value from the row directly above the selection into every
  // selected cell in this column. A deliberate copy, not a fresh entry, so it skips the
  // ascending-order check that would otherwise reject a duplicate of the row above.
  function handleReplicateAbove() {
    if (!contextMenu || contextMenu.kind !== 'code' || !selection) return;
    const levelStart = selection.level;
    const levelEnd = selection.levelEnd ?? selection.level;
    const selectedIndices = rows
      .map((r, i) => (selection.rowIds.has(r.id) ? i : -1))
      .filter((i) => i !== -1)
      .sort((a, b) => a - b);
    if (selectedIndices.length === 0) return;
    const topIndex = selectedIndices[0];
    const updated = rows.map((row) => ({ ...row, codes: [...row.codes] }));
    // For each column in the selected block, take the value from the row directly above the
    // block's top row and roll it down through every blank cell below — not just the ones
    // actually selected, but on through any further run of blanks immediately beneath the
    // selection too — stopping at the first cell that already holds something. Never
    // overwrites real content; the selection only marks where the source row and the columns
    // to replicate come from, not how far down the cascade is allowed to reach.
    //
    // "A source exists above" and "something was actually filled in" are tracked separately:
    // Add Row/Insert Row already duplicate the row above's codes into a new row, so the very
    // cell a user right-clicks is often already holding that same value by the time they ask
    // to replicate it — that's not a missing source, it's nothing left to do, and shouldn't
    // be reported as the same error as a genuinely blank column with nothing above it at all.
    let anySourceFound = false;
    let anyReplicated = false;
    for (let level = levelStart; level <= levelEnd; level++) {
      const sourceValue = topIndex > 0 ? (rows[topIndex - 1].codes[level] ?? '') : '';
      if (!sourceValue) continue;
      anySourceFound = true;
      for (let idx = topIndex; idx < updated.length; idx++) {
        if ((updated[idx].codes[level] ?? '') !== '') break;
        updated[idx].codes[level] = sourceValue;
        anyReplicated = true;
      }
    }
    if (!anySourceFound) {
      setValidationError('No code above to replicate from.');
      return;
    }
    if (!anyReplicated) {
      // Every selected cell already holds a value (most commonly because Add/Insert Row had
      // already duplicated it in) — nothing needs filling in, so this is a silent no-op
      // rather than an error.
      setSelection(null);
      setContextMenu(null);
      return;
    }
    onChange(updated);
    setSelection(null);
    setContextMenu(null);
  }

  // A row's level is the position of its deepest populated description column (Section
  // 4.1); -1 means the row has no description at all yet.
  function levelOf(row: TaxonomyRow): number {
    for (let i = row.descriptions.length - 1; i >= 0; i--) {
      if ((row.descriptions[i] ?? '').trim()) return i;
    }
    return -1;
  }

  // The end (exclusive) of the contiguous run of descendant rows following startIndex —
  // every row deeper than it, stopping at the first row at the same level or shallower.
  function getDescendantEndIndex(startIndex: number): number {
    const startLevel = levelOf(rows[startIndex]);
    let i = startIndex + 1;
    while (i < rows.length && levelOf(rows[i]) > startLevel) i++;
    return i;
  }

  // Decides whether promote/demote needs to ask "just this entry, or with children?" — only
  // relevant when at least one selected entry actually has children — then dispatches. A
  // boundary violation on one of the selected entries themselves is reported immediately,
  // before ever asking about scope, since it fails regardless of which scope is chosen.
  function requestPromoteDemote(direction: 'promote' | 'demote') {
    if (!selection || selection.kind !== 'desc') return;
    const offset = direction === 'promote' ? -1 : 1;
    const selectedIndices = rows
      .map((r, i) => (selection.rowIds.has(r.id) ? i : -1))
      .filter((i) => i !== -1 && levelOf(rows[i]) !== -1);
    if (selectedIndices.length === 0) return;
    setContextMenu(null);
    const outOfBounds = selectedIndices.some((idx) => {
      const newLevel = levelOf(rows[idx]) + offset;
      return newLevel < 0 || newLevel >= numLevels;
    });
    if (outOfBounds) {
      setValidationError(
        direction === 'promote'
          ? 'Cannot promote further — already at the leftmost level'
          : 'Cannot demote further — no levels remain to the right',
      );
      return;
    }
    const hasChildren = selectedIndices.some((idx) => getDescendantEndIndex(idx) > idx + 1);
    if (hasChildren) {
      setPromoteDemoteChoice({ direction });
    } else {
      handlePromoteDemote(direction, 'withChildren');
    }
  }

  function handlePromoteDemote(direction: 'promote' | 'demote', scope: 'entry' | 'withChildren') {
    if (!selection || selection.kind !== 'desc') return;
    const offset = direction === 'promote' ? -1 : 1;
    const selectedIndices = rows
      .map((r, i) => (selection.rowIds.has(r.id) ? i : -1))
      .filter((i) => i !== -1 && levelOf(rows[i]) !== -1)
      .sort((a, b) => a - b);
    if (selectedIndices.length === 0) return;

    // Each selected entry moves either alone, or together with all of its descendants
    // (Section 6.3), per the chosen scope.
    const affected = new Set<number>();
    const ranges: Array<{ start: number; end: number }> = [];
    for (const idx of selectedIndices) {
      if (affected.has(idx)) continue; // already covered by an earlier ancestor's range
      const end = scope === 'withChildren' ? getDescendantEndIndex(idx) : idx + 1;
      ranges.push({ start: idx, end });
      for (let i = idx; i < end; i++) affected.add(i);
    }

    for (const i of affected) {
      const newLevel = levelOf(rows[i]) + offset;
      if (newLevel < 0 || newLevel >= numLevels) {
        setValidationError(
          direction === 'promote'
            ? 'Cannot promote further — already at the leftmost level'
            : 'Cannot demote further — no levels remain to the right',
        );
        return;
      }
    }

    // Moving the block can't leave its new position skipping a level relative to its
    // still-unmoved neighbours above or below — the same cascade rule that governs typing
    // a description directly (Section 4.1 / the description-cascade rule). Deliberately
    // skipped when moving "just this entry" away from its children — detaching it from
    // them is the entire point, so the gap it leaves behind is expected, not an error.
    if (scope === 'withChildren') {
      for (const { start, end } of ranges) {
        const newTopLevel = levelOf(rows[start]) + offset;
        for (let i = start - 1; i >= 0; i--) {
          if (affected.has(i)) continue;
          const lvl = levelOf(rows[i]);
          if (lvl === -1) continue;
          if (newTopLevel > lvl + 1) {
            setValidationError('Descriptions must cascade no more than one column right');
            return;
          }
          break;
        }
        const newBottomLevel = levelOf(rows[end - 1]) + offset;
        if (end < rows.length) {
          const lvl = levelOf(rows[end]);
          if (lvl !== -1 && lvl > newBottomLevel + 1) {
            setValidationError('Descriptions must cascade no more than one column right');
            return;
          }
        }
      }
    }

    onChange(
      rows.map((row, i) => {
        if (!affected.has(i)) return row;
        const oldLevel = levelOf(row);
        const newLevel = oldLevel + offset;
        // Only the description moves; colour follows the column automatically since it's
        // never stored per-row. Only the code cell at the entry's new column is blanked —
        // that's the one whose value is no longer trustworthy at the new level and needs a
        // fresh code — every other code cell on the row (its ancestor path) is left alone
        // (Section 6.3).
        const descriptions = row.descriptions.map((d, idx) => {
          if (idx === newLevel) return row.descriptions[oldLevel];
          if (idx === oldLevel) return '';
          return d;
        });
        const codes = row.codes.map((c, idx) => (idx === newLevel ? '' : c));
        return { ...row, descriptions, codes };
      }),
    );
    setSelection(null);
    setContextMenu(null);
  }

  // Right-click "Alpha Sort" (Section 6.4) — sorts a selected block of sibling entries within
  // one description column alphabetically, each carrying its own descendants along with it.
  // The block may be the whole column or any contiguous subset; rows outside the selection are
  // untouched.
  function handleAlphaSort() {
    if (!contextMenu || contextMenu.kind !== 'desc' || !selection || selection.kind !== 'desc') return;
    const { level } = selection;
    const selectedIndices = rows
      .map((r, i) => (selection.rowIds.has(r.id) ? i : -1))
      .filter((i) => i !== -1)
      .sort((a, b) => a - b);
    if (selectedIndices.length < 2) {
      setContextMenu(null);
      return;
    }
    const topIndex = selectedIndices[0];
    const bottomIndex = selectedIndices[selectedIndices.length - 1];
    // Split the selected range into chunks — each selected sibling plus every descendant row
    // that immediately follows it — then sort the chunks as units by the sibling's own text,
    // never disturbing a chunk's internal (parent-then-children) order.
    const chunks: TaxonomyRow[][] = [];
    for (let i = topIndex; i <= bottomIndex; ) {
      const end = getDescendantEndIndex(i);
      chunks.push(rows.slice(i, end));
      i = end;
    }
    const sorted = [...chunks].sort((a, b) =>
      (a[0].descriptions[level] ?? '').localeCompare(b[0].descriptions[level] ?? '', undefined, {
        sensitivity: 'base',
      }),
    );
    const updated = [...rows.slice(0, topIndex), ...sorted.flat(), ...rows.slice(bottomIndex + 1)];
    onChange(updated);
    setSelection(null);
    setContextMenu(null);
  }

  // Right-click "Move" — arms move mode with the selected entry (or entries) and all of
  // their descendants (always the whole hierarchy; unlike promote/demote there's no "just
  // this one" here, since detaching a moved entry from its children mid-move would leave
  // them stranded at the old position). The next plain click on any row picks the target.
  function handleMoveStart() {
    if (!contextMenu || contextMenu.kind !== 'desc' || !selection) return;
    const selectedIndices = rows
      .map((r, i) => (selection.rowIds.has(r.id) ? i : -1))
      .filter((i) => i !== -1 && levelOf(rows[i]) !== -1)
      .sort((a, b) => a - b);
    if (selectedIndices.length === 0) return;
    const affected = new Set<number>();
    for (const idx of selectedIndices) {
      if (affected.has(idx)) continue;
      const end = getDescendantEndIndex(idx);
      for (let i = idx; i < end; i++) affected.add(i);
    }
    setMoveMode({ rowIds: new Set(Array.from(affected).map((i) => rows[i].id)) });
    setSelection(null);
    setContextMenu(null);
  }

  // Relocates the moving block to sit directly above/below the target row, preserving the
  // moving rows' own internal order, descriptions, and codes untouched — a pure reorder.
  function executeMove(position: 'above' | 'below') {
    if (!moveMode || !moveTarget) return;
    const movingIds = moveMode.rowIds;
    const movingRows = rows.filter((r) => movingIds.has(r.id));
    const remaining = rows.filter((r) => !movingIds.has(r.id));
    const targetIndex = remaining.findIndex((r) => r.id === moveTarget.rowId);
    if (targetIndex === -1) {
      setMoveMode(null);
      setMoveTarget(null);
      return;
    }
    const insertAt = position === 'above' ? targetIndex : targetIndex + 1;
    onChange([...remaining.slice(0, insertAt), ...movingRows, ...remaining.slice(insertAt)]);
    setMoveMode(null);
    setMoveTarget(null);
  }

  return (
    <div className="grid-wrapper">
      <table className="taxonomy-grid">
        <thead>
          <tr>
            <th colSpan={numLevels + delimiterPositions.length} className="section-heading">
              Code
            </th>
            <th className="gap-col">&nbsp;</th>
            <th colSpan={numLevels + 1} className="section-heading">
              Description
            </th>
            <th className="row-actions-col">&nbsp;</th>
          </tr>
          <tr>
            {levels.map((level) => (
              <Fragment key={`code-h-${level}`}>
                <th className="code-col" style={{ backgroundColor: getLevelColor(level) }}>
                  {level + 1}
                </th>
                {delimiterPositions.includes(level + 1) && <th className="delim-col">&nbsp;</th>}
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
            {suffixes.map((suffix, index) => (
              <Fragment key={`suffix-h-${index}`}>
                <th className="delim-col">&nbsp;</th>
                <th className="suffix-col" style={{ width: `${suffix.width}ch` }}>
                  Suffix {index + 1}
                </th>
              </Fragment>
            ))}
            <th className="row-actions-col">&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.id} className={moveMode?.rowIds.has(row.id) ? 'row-moving' : undefined}>
              {levels.map((level) => {
                const isCodeSelected =
                  selection?.kind === 'code' &&
                  level >= selection.level &&
                  level <= (selection.levelEnd ?? selection.level) &&
                  selection.rowIds.has(row.id);
                return (
                  <Fragment key={`code-${row.id}-${level}`}>
                    <td
                      className={`code-col${isCodeSelected ? ' code-col-selected' : ''}`}
                      style={{ backgroundColor: getLevelColor(level) }}
                      data-cell-kind="code"
                      data-row-id={row.id}
                      data-level={level}
                      onMouseDown={(e) => handleCellMouseDown('code', row.id, level, e)}
                      onMouseEnter={() => handleCellMouseEnter('code', row.id, level)}
                      onContextMenu={(e) => handleCellContextMenu('code', row.id, level, e)}
                    >
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
                    {delimiterPositions.includes(level + 1) && <td className="delim-col">-</td>}
                  </Fragment>
                );
              })}
              <td className="gap-col">&nbsp;</td>
              {levels.map((level) => {
                const isSelected =
                  selection?.kind === 'desc' &&
                  selection.level === level &&
                  selection.rowIds.has(row.id);
                return (
                  <td
                    key={`desc-${row.id}-${level}`}
                    className={`desc-col${isSelected ? ' desc-col-selected' : ''}`}
                    style={{ backgroundColor: getLevelColor(level) }}
                    data-cell-kind="desc"
                    data-row-id={row.id}
                    data-level={level}
                    onMouseDown={(e) => handleCellMouseDown('desc', row.id, level, e)}
                    onMouseEnter={() => handleCellMouseEnter('desc', row.id, level)}
                    onContextMenu={(e) => handleCellContextMenu('desc', row.id, level, e)}
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
              {suffixes.map((suffix, index) => (
                <Fragment key={`suffix-${row.id}-${index}`}>
                  <td className="delim-col">{suffix.delimiter || '-'}</td>
                  <td className="suffix-col">
                    {suffix.mode === 'constant' ? (
                      <input className="suffix-cell" type="text" value={suffix.constantValue} readOnly />
                    ) : (
                      <input
                        className="suffix-cell"
                        type="text"
                        maxLength={suffix.width}
                        value={row.suffixValues[index] ?? ''}
                        onChange={(e) => updateSuffix(row.id, index, e.target.value)}
                        onBlur={() => checkSuffixDuplicate(row.id, index)}
                      />
                    )}
                  </td>
                </Fragment>
              ))}
              <td className="row-actions-col">
                <button
                  type="button"
                  className="remove-row-btn"
                  onClick={() => deleteRow(row.id)}
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

      {moveMode && (
        <p className="move-mode-banner">
          Click a row to move the selected {moveMode.rowIds.size} row
          {moveMode.rowIds.size > 1 ? 's' : ''} there — Escape to cancel.
        </p>
      )}

      {contextMenu && (
        <ul
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.kind === 'desc' && (
            <>
              <li onClick={handleToggleCase}>Toggle Case</li>
              <li onClick={handleAlphaSort}>Alpha Sort</li>
              <li onClick={() => requestPromoteDemote('promote')}>Promote</li>
              <li onClick={() => requestPromoteDemote('demote')}>Demote</li>
              <li onClick={handleMoveStart}>Move</li>
            </>
          )}
          {contextMenu.kind === 'code' && (
            <>
              <li onClick={handleDeleteCodes}>Delete Codes</li>
              <li onClick={handleReplicateAbove}>Replicate Codes Above</li>
            </>
          )}
          <li className="context-menu-separator" onClick={() => handleInsertRow('above')}>
            {pendingInsertCount() > 1 ? `Insert ${pendingInsertCount()} Rows Above` : 'Insert Row Above'}
          </li>
          <li onClick={() => handleInsertRow('below')}>
            {pendingInsertCount() > 1 ? `Insert ${pendingInsertCount()} Rows Below` : 'Insert Row Below'}
          </li>
          <li onClick={handleDeleteRowFromMenu}>Delete Row</li>
        </ul>
      )}

      {confirmDialog && (
        <div className="validation-overlay" onClick={() => setConfirmDialog(null)}>
          <div
            ref={confirmDialogRef}
            className="validation-dialog"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <p>{confirmDialog.message}</p>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setConfirmDialog(null)}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
              >
                {confirmDialog.confirmLabel ?? 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {promoteDemoteChoice && (
        <div className="validation-overlay" onClick={() => setPromoteDemoteChoice(null)}>
          <div
            ref={promoteDemoteDialogRef}
            className="validation-dialog"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <p>
              {promoteDemoteChoice.direction === 'promote' ? 'Promote' : 'Demote'} just this
              entry, or this entry and its children?
            </p>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setPromoteDemoteChoice(null)}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handlePromoteDemote(promoteDemoteChoice.direction, 'entry');
                  setPromoteDemoteChoice(null);
                }}
              >
                Just This Entry
              </button>
              <button
                type="button"
                onClick={() => {
                  handlePromoteDemote(promoteDemoteChoice.direction, 'withChildren');
                  setPromoteDemoteChoice(null);
                }}
              >
                Entry + Children
              </button>
            </div>
          </div>
        </div>
      )}

      {moveTarget && (
        <div
          className="validation-overlay"
          onClick={() => {
            setMoveTarget(null);
            setMoveMode(null);
          }}
        >
          <div
            ref={moveDialogRef}
            className="validation-dialog"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <p>Insert the moved row(s) above or below this row?</p>
            <div className="confirm-dialog-actions">
              <button
                type="button"
                onClick={() => {
                  setMoveTarget(null);
                  setMoveMode(null);
                }}
              >
                Cancel
              </button>
              <button type="button" onClick={() => executeMove('above')}>
                Insert Above
              </button>
              <button type="button" onClick={() => executeMove('below')}>
                Insert Below
              </button>
            </div>
          </div>
        </div>
      )}

      {validationError && (
        <div className="validation-overlay" onClick={() => setValidationError(null)}>
          <div
            ref={dialogRef}
            className="validation-dialog"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              // Absorb every keystroke while the dialog is up — including a buffered
              // Enter from typing that hasn't reached the browser yet — so nothing can
              // dismiss it or leak through to the grid underneath except a real click.
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <p>{validationError}</p>
            <button type="button" onClick={() => setValidationError(null)}>
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
