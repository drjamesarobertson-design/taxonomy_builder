import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TaxonomyRow, TaxonomySettings } from './types';
import { createEmptyRow, growRowsToLevels } from './types';
import { getLevelColor } from './colors';
import { toggleCase } from './caseUtils';
import { isValidCodeChar, isAllowedByCodeRestriction, hasCodeGap } from './codeValidation';
import { codeInputId, descInputId } from './domIds';
import type { TaxonomyBlock } from './blockTransfer';
import { parseBlockFile } from './blockTransfer';
import type { HelpTextMap } from './helpText';

interface GridProps {
  settings: TaxonomySettings;
  rows: TaxonomyRow[];
  /**
   * coalesceKey, when present, identifies the single field being edited (e.g. a specific
   * code or description cell) — the caller uses it to merge consecutive edits to the same
   * field into one undo step, without Grid needing to know anything about undo itself.
   */
  onChange: (rows: TaxonomyRow[], coalesceKey?: string) => void;
  /** For a change that touches settings and rows together — Import Block's anchor/level-growth
   * flow, or the grid's own right-click "Add Column" — unlike onChange, this can also grow
   * settings.numLevels. The caller applies both in one update, so it never sees an inconsistent
   * settings/rows pairing along the way. */
  onSettingsAndRowsChange: (settings: TaxonomySettings, rows: TaxonomyRow[]) => void;
  /** Field-level help text (see helpText.ts) — also covers the right-click menus' own "Help"
   * entries here (gridCodeMenuHelp / gridDescMenuHelp / gridSuffixMenuHelp). */
  helpText: HelpTextMap;
  /** Focus the first row's first description cell once, on mount (freshly created taxonomy). */
  autoFocusFirstRow?: boolean;
  /** Item 3: right-click "Export Block" on a selected range of rows — App.tsx owns the actual
   * Include Suffix?/filename flow, Grid just hands up which rows the selection covered. */
  onExportBlock: (rowsSubset: TaxonomyRow[]) => void;
}

type CellKind = 'code' | 'desc' | 'suffix';

interface Selection {
  kind: CellKind;
  level: number;
  /** For a code-cell selection spanning several columns; absent (or equal to level) for a
   * single-column selection. Description selections are always single-column. */
  levelEnd?: number;
  rowIds: Set<string>;
  /** Item 3: set once a drag or shift-click has crossed from one cell kind to another (e.g.
   * a code cell to a description cell — "top-left code cell to bottom-right description
   * cell"). There's no single column/level range left to represent across two different
   * kinds, so every code AND description column highlights for these rows instead, and it
   * stays set for the rest of that selection's life (kind/level are left as whatever they
   * were at the point of crossing — nothing reads them while this flag is set). */
  allColumns?: boolean;
}

interface ContextMenuState {
  kind: CellKind;
  x: number;
  y: number;
  level: number;
  rowId: string;
}

const suffixInputId = (index: number, rowId: string) => `suffix-${index}-${rowId}`;

export default function Grid({
  settings,
  rows,
  onChange,
  onSettingsAndRowsChange,
  helpText,
  autoFocusFirstRow,
  onExportBlock,
}: GridProps) {
  const {
    numLevels,
    delimiterPositions,
    maxDescriptionLength,
    suffixes,
    paddingChar,
    codeDelimiterChar,
    codeRestriction,
    locked,
    guidance,
  } = settings;
  // Simple Taxonomy wizard: no code column is shown at all until the coding stage — the
  // 'headings' and 'subItems' stages are description-only by design. `numLevels` itself grows
  // as those stages advance, so this is purely a display concern layered on top, not a change
  // to how many levels actually exist.
  const hideAllCodes = guidance?.stage === 'headings' || guidance?.stage === 'subItems';
  const levels = Array.from({ length: numLevels }, (_, i) => i);
  // The wide overflow column gets whatever's left of the configured max description length
  // after reserving one character per description level (Section 6.7's indent padding) and
  // the width of every suffix column plus its own delimiter.
  const suffixTotalWidth = suffixes.reduce((sum, s) => sum + 1 + s.width, 0);
  const overflowChars = Math.max(4, maxDescriptionLength - numLevels - suffixTotalWidth);

  // Items 5/6: a caret button under each column header collapses/filters the working view —
  // so a long taxonomy can be worked on level by level without scrolling past everything
  // beneath. Purely a display filter: it never touches `rows` itself, so every index-based
  // operation elsewhere (context menus, insert-row math, drag-select) keeps working against
  // the real, complete row list exactly as before — hidden rows are hidden with CSS only.
  // The two column types filter differently: a description-column caret collapses to that
  // level (show that column or shallower); a code-column caret instead filters on content —
  // only rows whose code in that exact column is the padding character "." — since James
  // asked for the code side to literally filter on "." rather than mirror the level collapse.
  // null means nothing is filtered (show every row).
  const [collapseFilter, setCollapseFilter] = useState<
    { kind: 'level'; level: number } | { kind: 'codeDot'; level: number } | null
  >(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [anchorRowId, setAnchorRowId] = useState<string | null>(null);
  const [anchorLevel, setAnchorLevel] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  // An optional action to run once the validation-error dialog above is dismissed — e.g.
  // Check Ascending Order jumping the cursor to the first offending cell, so the user lands
  // right where they need to fix it instead of having to hunt for it themselves.
  const validationFollowUpRef = useRef<(() => void) | null>(null);
  // A one-time reminder shown the first time text is typed into the very first description
  // cell (row 1, column 1) of a taxonomy — explains why it's forced to ALL CAPS (Section 4.3)
  // rather than leaving the user to wonder. Grid remounts (via its key in App.tsx) on every
  // genuinely new or freshly-loaded project, so this naturally resets per taxonomy rather than
  // firing only once ever.
  const [showCapsNotice, setShowCapsNotice] = useState(false);
  const capsNoticeShownRef = useRef(false);
  // A one-time notice the first time a code character's case is silently auto-corrected to
  // match the taxonomy's Code Restriction (James's ask: typing continues smoothly either way).
  // Earlier versions of both this and the heading notice above suggested "turn Caps Lock on"
  // based on KeyboardEvent.getModifierState('CapsLock') — James reported that firing even with
  // Caps Lock genuinely on, and since both cells force/convert case regardless of the physical
  // key anyway, the suggestion was never load-bearing — dropped rather than chasing a browser
  // modifier-state quirk that can't be verified from here.
  const [showCodeCaseNotice, setShowCodeCaseNotice] = useState(false);
  const codeCaseNoticeShownRef = useRef(false);
  // Right-click toggle: when on, Down Arrow in a description cell always inserts a new row
  // immediately beneath the current one and focuses it (like Insert Row Below), rather than
  // only doing that at the very last row — James found the "necessary" right-click detour
  // tedious while adding a heading's children one at a time in column 2+.
  const [addRowOnDownArrow, setAddRowOnDownArrow] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);
  const [promoteDemoteChoice, setPromoteDemoteChoice] = useState<{
    direction: 'promote' | 'demote';
  } | null>(null);
  // A duplicate editable-suffix value found on blur (Section 3-adjacent): offers Accept (keep
  // it), Edit (jump back into the cell), or Cancel (revert to what it held before this edit).
  const [suffixDuplicateChoice, setSuffixDuplicateChoice] = useState<{
    rowId: string;
    index: number;
    previousValue: string;
  } | null>(null);
  // The value an editable suffix cell held just before the user started typing into it —
  // captured on focus, used to revert if a duplicate is found and the user chooses Cancel.
  const suffixEditOriginalRef = useRef<{ rowId: string; index: number; value: string } | null>(null);
  // "Move" mode (click a cell, choose Move, then click a target row): the set of row ids
  // being relocated, and — once a target row has been clicked — that target, awaiting an
  // above/below choice.
  const [moveMode, setMoveMode] = useState<{ rowIds: Set<string> } | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ rowId: string } | null>(null);
  // "Copy Rows" mode (Section 6.5-adjacent, item 9): like Move, but the selected rows and
  // their descendants stay put — a duplicate block is inserted at the chosen target instead.
  const [copyMode, setCopyMode] = useState<{ rowIds: Set<string> } | null>(null);
  const [copyTarget, setCopyTarget] = useState<{ rowId: string } | null>(null);
  // Item 10's Copy Codes / Paste Codes clipboard: a rectangular block of code values (one
  // array per column, top-to-bottom within each), pasted back in starting wherever the user
  // next right-clicks "Paste Codes" — a plain overtype, independent of row selection.
  const [codeClipboard, setCodeClipboard] = useState<{
    colValues: string[][];
    numRows: number;
    numCols: number;
  } | null>(null);
  // Right-clicking a delimiter cell (item 11) shows a tiny "Not editable" notice instead of
  // either doing nothing or leaking the browser's own native context menu through.
  const [delimNotice, setDelimNotice] = useState<{ x: number; y: number } | null>(null);

  // Import Block: right-clicking a code cell and choosing "Import Block" stashes that cell as
  // the anchor, then opens a hidden file picker — the rest of the flow (level-growth
  // confirmation, suffix-1 concatenate/right-justify choice, dropped-suffix notice) runs off
  // pendingImport, which carries everything the later steps need to finish the job.
  const importBlockFileInputRef = useRef<HTMLInputElement>(null);
  const importBlockAnchorRef = useRef<{ rowId: string; level: number } | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    block: TaxonomyBlock;
    anchorRowId: string;
    anchorLevel: number;
    requiredLevels: number;
    baseLevel: number;
  } | null>(null);
  const [addColumnsChoice, setAddColumnsChoice] = useState<{ addCount: number } | null>(null);
  // Suffix 1's value can come from a fresh value typed just for this import, or from the
  // source block's own per-row data — asked as three small sequential steps: which source,
  // then (only for "Enter Text") the text itself, then where it goes (Concatenate/Right
  // Justify) — rather than one crowded dialog trying to cover all of it at once.
  const [suffix1SourceChoice, setSuffix1SourceChoice] = useState(false);
  const [suffixTextEntryPending, setSuffixTextEntryPending] = useState(false);
  // The text typed for Suffix 1 when "Enter Text" is chosen — unused for "Use Existing Text".
  const [suffixTextValue, setSuffixTextValue] = useState('');
  const [suffixModePending, setSuffixModePending] = useState<{
    suffix1Source: 'enterText' | 'useExisting';
    suffix1Text: string;
  } | null>(null);
  const [droppingSuffixesNotice, setDroppingSuffixesNotice] = useState(false);

  const contextMenuRef = useRef<HTMLUListElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const capsNoticeDialogRef = useRef<HTMLDivElement>(null);
  const confirmDialogRef = useRef<HTMLDivElement>(null);
  const promoteDemoteDialogRef = useRef<HTMLDivElement>(null);
  const suffixDuplicateDialogRef = useRef<HTMLDivElement>(null);
  const moveDialogRef = useRef<HTMLDivElement>(null);
  const copyDialogRef = useRef<HTMLDivElement>(null);
  const addColumnsDialogRef = useRef<HTMLDivElement>(null);
  const suffix1SourceDialogRef = useRef<HTMLDivElement>(null);
  const suffixTextInputRef = useRef<HTMLInputElement>(null);
  const suffixModeDialogRef = useRef<HTMLDivElement>(null);
  const droppingSuffixesDialogRef = useRef<HTMLDivElement>(null);
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

  useLayoutEffect(() => {
    // Right-clicking a row near the bottom of a long grid opened the menu at the click
    // position with no regard for whether it would actually fit — with enough rows above it,
    // the menu ran off the bottom of the screen with no way to scroll to its lower items.
    // Runs before paint, so it corrects the position in place rather than flashing the
    // overflowing menu first and re-rendering a moment later.
    if (!contextMenu || !contextMenuRef.current) return;
    const el = contextMenuRef.current;
    const rect = el.getBoundingClientRect();
    const overflowY = rect.bottom - window.innerHeight;
    if (overflowY > 0) {
      el.style.top = `${Math.max(8, contextMenu.y - overflowY - 8)}px`;
    }
    const overflowX = rect.right - window.innerWidth;
    if (overflowX > 0) {
      el.style.left = `${Math.max(8, contextMenu.x - overflowX - 8)}px`;
    }
  }, [contextMenu]);

  useEffect(() => {
    if (showCapsNotice) capsNoticeDialogRef.current?.focus();
  }, [showCapsNotice]);

  useEffect(() => {
    if (confirmDialog) confirmDialogRef.current?.focus();
  }, [confirmDialog]);

  useEffect(() => {
    if (promoteDemoteChoice) promoteDemoteDialogRef.current?.focus();
  }, [promoteDemoteChoice]);

  useEffect(() => {
    if (suffixDuplicateChoice) suffixDuplicateDialogRef.current?.focus();
  }, [suffixDuplicateChoice]);

  useEffect(() => {
    if (moveTarget) moveDialogRef.current?.focus();
  }, [moveTarget]);

  useEffect(() => {
    if (copyTarget) copyDialogRef.current?.focus();
  }, [copyTarget]);

  useEffect(() => {
    if (addColumnsChoice) addColumnsDialogRef.current?.focus();
  }, [addColumnsChoice]);

  useEffect(() => {
    if (suffix1SourceChoice) suffix1SourceDialogRef.current?.focus();
  }, [suffix1SourceChoice]);

  useEffect(() => {
    // Focuses the text field itself, not the dialog container — unlike the app's other
    // OK/Cancel-only dialogs, this one has a real field to type into, so it needs actual
    // keyboard input to reach it rather than being trapped at the dialog level.
    if (suffixTextEntryPending) suffixTextInputRef.current?.focus();
  }, [suffixTextEntryPending]);

  useEffect(() => {
    if (suffixModePending) suffixModeDialogRef.current?.focus();
  }, [suffixModePending]);

  useEffect(() => {
    if (droppingSuffixesNotice) droppingSuffixesDialogRef.current?.focus();
  }, [droppingSuffixesNotice]);

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
      if (!isDraggingRef.current || moveMode || copyMode) return;
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
    if (!copyMode) return;
    const cancelOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCopyMode(null);
        setCopyTarget(null);
      }
    };
    window.addEventListener('keydown', cancelOnEscape);
    return () => window.removeEventListener('keydown', cancelOnEscape);
  }, [copyMode]);

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

  useEffect(() => {
    if (!delimNotice) return;
    const close = () => setDelimNotice(null);
    window.addEventListener('click', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', close);
    };
  }, [delimNotice]);

  // Opens the validation-error dialog, optionally arming a one-shot action that runs once the
  // dialog is dismissed (e.g. Check Ascending Order jumping the cursor straight to the first
  // offending cell). Every call sets (or clears) the follow-up explicitly, so an earlier
  // dialog's follow-up can never leak into an unrelated later one.
  function showValidationError(message: string, followUp?: () => void) {
    validationFollowUpRef.current = followUp ?? null;
    setValidationError(message);
  }

  function dismissValidationError() {
    const followUp = validationFollowUpRef.current;
    validationFollowUpRef.current = null;
    setValidationError(null);
    followUp?.();
  }

  // The rightmost description column used anywhere in the taxonomy. A code (real or "."
  // padding) can only exist at or to the left of this column — there's no level of the
  // hierarchy deeper than the deepest description anyone has actually written yet.
  function getMaxDescriptionColumn(): number {
    let max = -1;
    for (const row of rows) {
      const lvl = levelOf(row);
      if (lvl > max) max = lvl;
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

    // The rightmost column never cascades (each row holds its own distinct leaf identifier,
    // never inherited from a neighbour — see updateCode), so a smaller real value below it is
    // a genuine ascending-order violation there, not something a cascade would sweep away.
    const isRightmost = level === numLevels - 1;
    let lower: string | null = null;
    for (let i = editIndex + 1; i < rows.length; i++) {
      if (parentValue !== null && (rows[i].codes[level - 1] ?? '') !== parentValue) break;
      const v = rows[i].codes[level] ?? '';
      if (v === '' || (!isRightmost && v.charCodeAt(0) < char.charCodeAt(0))) continue; // will be swept up by the cascade
      lower = v;
      break;
    }

    return { upper, lower };
  }

  // Fills columns [fromLevel, toLevel] of the row at editIndex with the padding character, then
  // cascades that same padding down through each of those columns independently into every row
  // below within the same parent group, stopping at the first non-blank cell in each column —
  // identical mechanics whether triggered by the user typing the padding character directly, or
  // automatically once a leaf row's own real code is completed (Section 5: "the remaining Code
  // Columns on that row will auto populate with '.'"). toLevel is always the deepest description
  // column written anywhere in the taxonomy (the caller passes getMaxDescriptionColumn()) —
  // padding only ever spans the range of columns that actually correspond to a description
  // somewhere; there's no level of hierarchy deeper than that yet for it to mean anything.
  function padFromLevel(rowsIn: TaxonomyRow[], editIndex: number, fromLevel: number, toLevel: number): TaxonomyRow[] {
    const parentValue = fromLevel > 0 ? (rowsIn[editIndex].codes[fromLevel - 1] ?? '') : null;
    let end = rowsIn.length;
    for (let i = editIndex + 1; i < rowsIn.length; i++) {
      const rowParent = fromLevel > 0 ? (rowsIn[i].codes[fromLevel - 1] ?? '') : null;
      if (parentValue !== null && rowParent !== parentValue) {
        end = i;
        break;
      }
    }
    const updated = rowsIn.map((row, idx) => {
      if (idx !== editIndex) return { ...row, codes: [...row.codes] };
      const codes = row.codes.map((c, i) => (i >= fromLevel && i <= toLevel ? paddingChar : c));
      return { ...row, codes };
    });
    for (let c = fromLevel; c <= toLevel; c++) {
      for (let i = editIndex + 1; i < end; i++) {
        if ((updated[i].codes[c] ?? '') === '') {
          updated[i].codes[c] = paddingChar;
        } else {
          break;
        }
      }
    }
    return updated;
  }

  function updateCode(
    rowId: string,
    level: number,
    value: string,
    options?: { skipOrderCheck?: boolean; skipZeroWarning?: boolean },
  ) {
    if (value.length > 1) {
      showValidationError('Only one character permitted');
      return;
    }
    let char = value;
    const editIndex = rows.findIndex((r) => r.id === rowId);
    if (editIndex === -1) return;

    // Lock Taxonomy: a protected row's own code is off-limits — it may already be posted
    // against in the live ERP, and recoding it here has no way to reach or correct whatever
    // already used the old value there.
    if (locked && rows[editIndex].protected) {
      showValidationError('Change of existing codes will corrupt the long term integrity of the existing data and is therefore not allowed');
      return;
    }

    // A letter typed in the "wrong" case for this taxonomy's Code Restriction (e.g. lower case
    // with Alpha Upper Case Only active) is silently flipped to the case that IS allowed,
    // rather than rejected outright — typing continues smoothly regardless of Caps Lock state.
    // A one-time notice nudges the user to just turn Caps Lock on instead of relying on this.
    if (char !== '' && !isAllowedByCodeRestriction(char, codeRestriction)) {
      const flipped = char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase();
      if (flipped !== char && isAllowedByCodeRestriction(flipped, codeRestriction)) {
        char = flipped;
        if (!codeCaseNoticeShownRef.current) {
          codeCaseNoticeShownRef.current = true;
          setTimeout(() => setShowCodeCaseNotice(true), 0);
        }
      }
    }

    const oldValue = rows[editIndex].codes[level] ?? '';
    // Retyping the same character is a deliberate re-entry (e.g. re-cascading padding), not a
    // no-op — it still runs the full cascade/clear-right logic below.
    const isPadding = char === paddingChar;

    if (char !== '' && !isValidCodeChar(char)) {
      showValidationError('Invalid code. Valid codes are: ".", 0 to 9, A to Z, a to z');
      return;
    }

    // Item 1: a per-taxonomy Code Restriction narrows the charset above further, for any
    // real (non-padding) character — the padding character itself is always exempt.
    if (char !== '' && !isPadding && !isAllowedByCodeRestriction(char, codeRestriction)) {
      showValidationError(`Code Limited to "${codeRestriction}" — Please Correct Your Entry`);
      return;
    }

    // Codes must populate left to right — every column before this one must already hold a
    // value before this one can. The padding character is a filler that only ever belongs at
    // the end of a code string (Section 4.4) — it's never a valid "real" code to build on top
    // of, so a padding character sitting to the left doesn't satisfy this for a genuinely new
    // real code (only for more padding continuing the same run rightward). Not enforced while
    // the guided wizard is active: its own coding stage deliberately has the user enter each
    // row's own code before Fill Codes has carried the ancestor columns down, so a genuinely
    // blank ancestor cell at that point is expected, not a mistake.
    if (char !== '' && !guidance) {
      for (let i = 0; i < level; i++) {
        const leftValue = rows[editIndex].codes[i] ?? '';
        if (!leftValue || (!isPadding && leftValue === paddingChar)) {
          showValidationError('Codes must advance from left to right');
          return;
        }
      }
    }

    const parentValue = level > 0 ? (rows[editIndex].codes[level - 1] ?? '') : null;

    // No code — real or "." padding — can exist to the right of the deepest description
    // written anywhere in the taxonomy; there's no level of hierarchy deeper than that yet.
    const maxDescCol = getMaxDescriptionColumn();
    if (char !== '' && level > maxDescCol) {
      showValidationError('Enter Descriptions Before Entering Codes');
      return;
    }

    // The deepest code column has no column to its right to distinguish siblings under
    // different parents, so every row sharing this row's own immediate parent (the heading
    // range one column to the left — not just the immediately adjacent rows) must hold a
    // distinct value here. This runs BEFORE the softer, overridable ascending-order check
    // below — an exact duplicate here is a hard block with no override (an "Override" on the
    // order check would otherwise let two identical rightmost codes straight through, since
    // equal counts as "not greater" there too) — and, since the rightmost column never
    // cascades (below), it has to scan the whole sibling range itself rather than relying on
    // a cascade to have already kept things apart.
    if (char !== '' && !isPadding && level === numLevels - 1 && char !== oldValue) {
      const collides = rows.some((row, idx) => {
        if (idx === editIndex) return false;
        if (parentValue !== null && (row.codes[level - 1] ?? '') !== parentValue) return false;
        const v = row.codes[level] ?? '';
        return v !== '' && v !== paddingChar && v === char;
      });
      if (collides) {
        showValidationError(
          'Ending codes within a code block delimited by "." at start and end must be unique, please change one of these codes',
        );
        return;
      }
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
          onConfirm: () => updateCode(rowId, level, value, { ...options, skipOrderCheck: true }),
        });
        return;
      }
    }

    // "0" reads awkwardly in later analysis (easy to confuse with a genuine zero total, or
    // with the padding character on a taxonomy that pads with "."), so flag it — but only
    // when it isn't itself the configured padding character, in which case it's not a code
    // at all and this warning doesn't apply.
    if (char === '0' && !isPadding && char !== oldValue && !options?.skipZeroWarning) {
      setConfirmDialog({
        message: 'It is strongly recommended that you avoid using "0" as a valid code for analysis purposes.',
        confirmLabel: 'Override',
        onConfirm: () => updateCode(rowId, level, value, { ...options, skipZeroWarning: true }),
      });
      return;
    }

    // Entering a real value clears a real code sitting to the right — it was scoped to the
    // old value at this column and may no longer make sense — but leaves an existing padding
    // character alone: padding just means "no further hierarchy here", which stays true
    // regardless of what this column's own code changes to.
    function applyCode(row: TaxonomyRow): TaxonomyRow {
      const codes = row.codes.map((c, i) => {
        if (i === level) return char;
        if (i < level) return c;
        return c === paddingChar ? c : '';
      });
      return { ...row, codes };
    }

    if (isPadding) {
      onChange(padFromLevel(rows, editIndex, level, maxDescCol), `code:${level}:${rowId}`);
      return;
    }

    // The rightmost column holds each row's own distinct leaf identifier — never inherited
    // from a neighbour — so entering a real code there only ever touches the row being
    // edited; every other column keeps the existing sweep-down cascade.
    let updated: TaxonomyRow[];
    if (level === numLevels - 1) {
      updated = rows.map((row, idx) => (idx === editIndex ? applyCode(row) : row));
    } else {
      let cascadeActive = true;
      updated = rows.map((row, idx) => {
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
      });
    }

    // Completing a leaf row's own code (Section 5: "the remaining Code Columns on that row
    // will auto populate with '.'") — any row that just received this real value at exactly
    // its own significant level, and has no children, gets its remaining columns padded up to
    // the deepest description written anywhere (never further — there's no code delimiter
    // "-" or otherwise deeper hierarchy for padding to mean anything past that), exactly as
    // if the user had typed the padding character into the next column themselves.
    if (char !== '' && !isPadding) {
      for (let idx = editIndex; idx < updated.length; idx++) {
        const row = updated[idx];
        if (rows[idx] === row) continue; // untouched by this edit
        if (row.codes[level] !== char) continue;
        if (levelOf(row) !== level) continue;
        if (getDescendantEndIndex(idx) > idx + 1) continue; // has children — real codes still needed
        if (level + 1 > maxDescCol) continue; // nothing deeper in use anywhere — nothing to pad
        updated = padFromLevel(updated, idx, level + 1, maxDescCol);
      }
    }

    onChange(updated, `code:${level}:${rowId}`);
  }

  function updateDescription(rowId: string, level: number, rawValue: string) {
    const editIndex = rows.findIndex((r) => r.id === rowId);
    if (editIndex === -1) return;

    // Lock Taxonomy: a protected row's own description is off-limits for the same reason as
    // its code — it may already be shown against live transactions. Mark as Delete (not a
    // direct edit) is the sanctioned way to retire one.
    if (locked && rows[editIndex].protected) {
      showValidationError('Change of existing descriptions will corrupt the long term integrity of the existing data and is therefore not allowed');
      return;
    }

    // Column 1 entries are the top level of the hierarchy — virtually always structural
    // (Section 4.3) — so force ALL CAPS as the user types, matching the case toggle's own
    // convention rather than requiring a separate manual toggle for the common case.
    const value = level === 0 ? rawValue.toUpperCase() : rawValue;

    // A row has exactly one populated description column — the one matching its level
    // (Section 4.1). Typing into a second column while another already holds text would
    // leave the row with two simultaneous descriptions, which breaks that invariant, so it's
    // blocked outright; the existing entry must be cleared first.
    if (value.trim()) {
      const otherFilledLevel = rows[editIndex].descriptions.findIndex(
        (d, i) => i !== level && (d ?? '').trim(),
      );
      if (otherFilledLevel !== -1) {
        showValidationError('A row can only have one description — clear the existing entry first.');
        return;
      }
    }

    // A description can move left any number of columns, but rightward only one column
    // at a time — it can't skip a level of the hierarchy that was never established.
    const wasEmpty = !(rows[editIndex].descriptions[level] ?? '').trim();

    let prevDepth: number | null = null;
    let prevDepthIdx = -1;
    if (wasEmpty && value.trim()) {
      for (let i = editIndex - 1; i >= 0 && prevDepth === null; i--) {
        for (let j = rows[i].descriptions.length - 1; j >= 0; j--) {
          if ((rows[i].descriptions[j] ?? '').trim()) {
            prevDepth = j;
            prevDepthIdx = i;
            break;
          }
        }
      }
      if (prevDepth !== null && level > prevDepth + 1) {
        showValidationError('Descriptions must cascade no more than one column right');
        return;
      }
    }

    // A brand-new entry one level deeper than the nearest row above it turns that row into a
    // parent. If that row picked up trailing padding while it still looked like a leaf
    // (Section 5's auto-pad), that padding is now stale — it genuinely has a child, so those
    // columns need a real code, not blanket "no further hierarchy" padding.
    const newParentIdx = prevDepth !== null && level === prevDepth + 1 ? prevDepthIdx : -1;

    onChange(
      rows.map((row, idx) => {
        if (row.id === rowId) {
          return { ...row, descriptions: row.descriptions.map((d, i) => (i === level ? value : d)) };
        }
        if (idx === newParentIdx) {
          const codes = row.codes.map((c, i) => (i > prevDepth! && c === paddingChar ? '' : c));
          const codesChanged = codes.some((c, i) => c !== row.codes[i]);
          // Simple Taxonomy wizard convenience (guidance-only, not a general app behaviour —
          // Section 6.2 keeps case toggling manual everywhere else): a heading that just
          // gained its first child is structural now, so switch it to ALL CAPS automatically
          // rather than leaving that as a Toggle Case the user has to remember.
          if (guidance) {
            const descriptions = row.descriptions.map((d, i) => (i === prevDepth ? d.toUpperCase() : d));
            return { ...row, codes, descriptions };
          }
          return codesChanged ? { ...row, codes } : row;
        }
        return row;
      }),
      `desc:${level}:${rowId}`,
    );
  }

  // Lock Taxonomy: several bulk operations can alter a protected row just as directly as
  // typing into it can — overwriting/blanking its code (Delete Codes, Clear Codes and Start
  // Again, Paste Codes, Promote/Demote), rewriting its description's case (Toggle Case), or
  // moving it out of its recorded position relative to its siblings (Alpha Sort, Move) — which
  // can silently break the ascending-code-order invariant even though the code value itself
  // never changes. One shared guard, with the message tailored to what's actually at risk.
  const CORRUPT_CODES_MESSAGE =
    'Change of existing codes will corrupt the long term integrity of the existing data and is therefore not allowed';
  const CORRUPT_DESCRIPTIONS_MESSAGE =
    'Change of existing descriptions will corrupt the long term integrity of the existing data and is therefore not allowed';
  const CORRUPT_ORDER_MESSAGE =
    'Reordering an existing entry protected by Lock Taxonomy could break its recorded position relative to its siblings and is therefore not allowed';
  function blockIfAnyProtected(ids: Iterable<string>, message: string = CORRUPT_CODES_MESSAGE): boolean {
    if (!locked) return false;
    const idSet = ids instanceof Set ? ids : new Set(ids);
    if (!rows.some((r) => idSet.has(r.id) && r.protected)) return false;
    showValidationError(message);
    return true;
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
  // slip). Offers Accept (keep it), Edit (jump back in), or Cancel (revert to what it held
  // before this edit) — never silently blocks or changes the entry on its own.
  function checkSuffixDuplicate(rowId: string, index: number) {
    const value = (rows.find((r) => r.id === rowId)?.suffixValues[index] ?? '').trim();
    if (!value) return;
    const isDuplicate = rows.some((r) => r.id !== rowId && (r.suffixValues[index] ?? '').trim() === value);
    if (!isDuplicate) return;
    const original = suffixEditOriginalRef.current;
    const previousValue = original && original.rowId === rowId && original.index === index ? original.value : '';
    setSuffixDuplicateChoice({ rowId, index, previousValue });
  }

  // Enter/Up/Down move between rows in the same suffix column, matching the code/description
  // cells' own row-to-row navigation.
  function handleSuffixKeyDown(e: React.KeyboardEvent<HTMLInputElement>, index: number, rowIndex: number) {
    switch (e.key) {
      case 'Enter':
      case 'ArrowDown': {
        e.preventDefault();
        const targetRow = rows[rowIndex + 1];
        if (targetRow) document.getElementById(suffixInputId(index, targetRow.id))?.focus();
        return;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const targetRow = rows[rowIndex - 1];
        if (targetRow) document.getElementById(suffixInputId(index, targetRow.id))?.focus();
        return;
      }
      default:
        return;
    }
  }

  // Right-click "Duplicate to Selected Rows" on a suffix cell — copies that cell's own value
  // into every row currently selected in the same suffix column. Meant for a "constant"-style
  // suffix that actually varies in blocks down the list (e.g. one value per quarter): overtype
  // one cell, select the block it should apply to, and duplicate it across — rather than
  // requiring the same value to be retyped into every row by hand.
  function handleDuplicateSuffixToSelection() {
    if (!contextMenu || contextMenu.kind !== 'suffix' || !selection || selection.kind !== 'suffix') return;
    const { level: index, rowId: sourceRowId } = contextMenu;
    const sourceValue = rows.find((r) => r.id === sourceRowId)?.suffixValues[index] ?? '';
    onChange(
      rows.map((row) =>
        selection.rowIds.has(row.id)
          ? { ...row, suffixValues: row.suffixValues.map((v, i) => (i === index ? sourceValue : v)) }
          : row,
      ),
    );
    setSelection(null);
    setContextMenu(null);
  }

  function createRowInheritingFrom(previous?: TaxonomyRow): TaxonomyRow {
    const newRow = createEmptyRow(numLevels, settings.suffixes);
    if (previous) {
      const prevLevel = levelOf(previous);
      // Only inherit the ancestor portion of the previous row's codes — up to and including
      // its own level — not any trailing padding it happens to carry (e.g. as a leaf, per
      // Section 5's auto-pad). That padding reflected the previous row having no children of
      // its own at the time; a brand-new row shouldn't start pre-padded before it even has a
      // description, let alone before anyone knows whether it turns out to be that row's child.
      newRow.codes = previous.codes.map((c, i) => (prevLevel === -1 || i <= prevLevel ? c : ''));
    }
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

    // Lock Taxonomy: deleting a protected row (or a protected descendant caught up in the
    // same delete) would remove its code from history — the same integrity risk as editing
    // it. Mark as Delete is the sanctioned way to retire one instead.
    if (locked && rows.slice(idx, end).some((r) => r.protected)) {
      showValidationError(
        'This entry (or one of its children) is protected by Lock Taxonomy and cannot be deleted — use "Mark as Delete" on its description instead.',
      );
      return;
    }
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

  // Deletes every row in a multi-row selection at once (James's ask): "Delete Row" from the
  // right-click menu used to only ever remove the single row actually clicked, silently
  // ignoring the rest of an active drag/shift-click selection. Each selected row's own
  // descendant subtree comes along too, exactly like a single-row delete already does — the
  // confirm message says so whenever that pulls in more rows than were actually highlighted.
  function deleteMultipleRows(rowIds: Set<string>) {
    const selectedIndices = rows.map((r, i) => (rowIds.has(r.id) ? i : -1)).filter((i) => i !== -1);
    if (selectedIndices.length === 0) return;

    const toRemove = new Set<number>();
    for (const idx of selectedIndices) {
      const level = levelOf(rows[idx]);
      const end = level === -1 ? idx + 1 : getDescendantEndIndex(idx);
      for (let i = idx; i < end; i++) toRemove.add(i);
    }

    if (locked && [...toRemove].some((i) => rows[i].protected)) {
      showValidationError(
        'One or more of these entries (or their children) is protected by Lock Taxonomy and cannot be deleted — use "Mark as Delete" on its description instead.',
      );
      return;
    }

    const extraCount = toRemove.size - selectedIndices.length;
    const message =
      extraCount > 0
        ? `Delete ${selectedIndices.length} rows? Their children will be deleted too (${toRemove.size} rows in total).`
        : `Delete ${selectedIndices.length} rows?`;
    setConfirmDialog({
      message,
      onConfirm: () => {
        onChange(rows.filter((_, i) => !toRemove.has(i)));
        setSelection(null);
      },
    });
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
  // opened on; for a multi-row drag/shift-click selection, both Above and Below are relative
  // to the TOP row of the selected range, not wherever within it was right-clicked — James
  // found "Below" landing after the whole range's bottom meant a range starting at row 1 could
  // never get new rows placed immediately under row 1 itself.
  function handleInsertRow(position: 'above' | 'below') {
    if (!contextMenu) return;
    const count = pendingInsertCount();
    let idx: number;
    if (count > 1 && selection) {
      const selectedIndices = rows
        .map((r, i) => (selection.rowIds.has(r.id) ? i : -1))
        .filter((i) => i !== -1);
      idx = Math.min(...selectedIndices);
    } else {
      idx = rows.findIndex((r) => r.id === contextMenu.rowId);
    }
    if (idx === -1) return;
    const refLevel = Math.max(0, levelOf(rows[idx]));
    const insertAt = position === 'above' ? idx : idx + 1;

    // If the rows that would end up immediately either side of the new gap already have
    // ASCII-adjacent codes at this level (e.g. "1" then "2", nothing able to fit between them),
    // there's no obvious code left for the new row without recoding a neighbour too — worth
    // flagging before creating a row that starts out in exactly that spot.
    const above = insertAt > 0 ? rows[insertAt - 1] : undefined;
    const below = insertAt < rows.length ? rows[insertAt] : undefined;
    const aboveCode = above?.codes[refLevel] ?? '';
    const belowCode = below?.codes[refLevel] ?? '';
    const hasNeighboursBothWays = aboveCode !== '' && belowCode !== '';

    const doInsert = () => performInsertRow(insertAt, count, refLevel);

    // Lock Taxonomy: once locked, a new row can only go where a real code actually fits
    // between its two neighbours (e.g. "1"/"3" has room for "2"; "1"/"2" doesn't) — otherwise
    // it would force recoding an existing, possibly-protected neighbour, which locking exists
    // to prevent. Unlike the soft warning below, this is a hard block with no override.
    if (locked && hasNeighboursBothWays && !hasCodeGap(aboveCode, belowCode, codeRestriction, paddingChar)) {
      setContextMenu(null);
      showValidationError(
        `There is no available code between "${aboveCode}" and "${belowCode}" at this level — inserting a new entry here would require renumbering an existing entry while the taxonomy is locked, which is not allowed. Unlock the taxonomy first if this is genuinely necessary.`,
      );
      return;
    }

    const noGap = hasNeighboursBothWays && belowCode.charCodeAt(0) - aboveCode.charCodeAt(0) === 1;
    if (noGap) {
      setContextMenu(null);
      setConfirmDialog({
        message: 'There is no gap in the codes to insert this row',
        confirmLabel: 'Insert Anyway',
        onConfirm: doInsert,
      });
    } else {
      doInsert();
    }
  }

  function performInsertRow(insertAt: number, count: number, refLevel: number) {
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
    if (selection && selection.rowIds.has(rowId) && selection.rowIds.size > 1) {
      deleteMultipleRows(selection.rowIds);
      return;
    }
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
      if (row) {
        const typedChar = e.key;
        updateCode(row.id, level, typedChar);
        // In the rightmost column, move straight down to the next row after a successful
        // entry — it's filled one leaf code after another, so this matches the same rhythm
        // as typing down a description column. Only advances if the value actually took (not
        // rejected, and not left pending behind a confirm-override dialog).
        if (level === numLevels - 1) {
          requestAnimationFrame(() => {
            const input = document.getElementById(codeInputId(level, row.id)) as HTMLInputElement | null;
            if (input && input.value === typedChar) focusCell('code', level, rowIndex + 1);
          });
        }
      }
      return;
    }

    // Excel-style Ctrl+Up/Ctrl+Down: jump to the next row that actually has a value in this
    // same description column, skipping over the (usually many) blank ones in between, rather
    // than moving one row at a time.
    if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && kind === 'desc') {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      let i = rowIndex + dir;
      while (i >= 0 && i < rows.length && !(rows[i].descriptions[level] ?? '').trim()) {
        i += dir;
      }
      if (i >= 0 && i < rows.length) focusCell('desc', level, i);
      return;
    }

    switch (e.key) {
      case 'Enter': {
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
      case 'ArrowDown': {
        e.preventDefault();
        const isLastRow = rowIndex === rows.length - 1;
        // The "Add Row on Down Arrow" toggle inserts a new row right here regardless of
        // position, not just at the very bottom — the same insertion Enter already does at
        // the last row, just available everywhere while the toggle is on.
        if (kind === 'desc' && (isLastRow || addRowOnDownArrow)) {
          const newRow = createRowInheritingFrom(rows[rowIndex]);
          const insertAt = rowIndex + 1;
          onChange([...rows.slice(0, insertAt), newRow, ...rows.slice(insertAt)]);
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
        // Code cells (always exactly one character) exit to the adjacent cell unconditionally
        // — there's no meaningful text caret to move within a single character. Description
        // cells, though, behave like Excel: the arrow key moves the text caret within the
        // field while there's still somewhere for it to go, and only exits to the adjacent
        // cell once the caret is already sitting at that edge of the text (this is exactly
        // what makes F2 followed by Left actually resume editing, instead of immediately
        // hopping to the previous cell). Off the left edge of the description block (column
        // 1), wrap onto the rightmost code column of the same row rather than doing nothing.
        if (kind === 'desc') {
          const input = e.currentTarget;
          if (input.selectionStart !== 0 || input.selectionEnd !== 0) return;
        }
        e.preventDefault();
        if (kind === 'desc' && level === 0) {
          focusCell('code', numLevels - 1, rowIndex);
        } else {
          focusCell(kind, level - 1, rowIndex);
        }
        return;
      case 'ArrowRight':
        // Mirrors ArrowLeft above: only exits the cell once the caret is at the end of the
        // text. Off the right edge of the code block (its last column), wrap onto description
        // column 1 of the same row, mirroring the left-edge wrap above.
        if (kind === 'desc') {
          const input = e.currentTarget;
          const end = input.value.length;
          if (input.selectionStart !== end || input.selectionEnd !== end) return;
        }
        e.preventDefault();
        if (kind === 'code' && level === numLevels - 1) {
          focusCell('desc', 0, rowIndex);
        } else {
          focusCell(kind, level + 1, rowIndex);
        }
        return;
      case 'F2':
        // Excel-style: F2 puts the field into edit mode with the cursor at the end of its
        // existing text, rather than wherever the browser's own focus handling left it.
        if (kind === 'desc') {
          e.preventDefault();
          const input = e.currentTarget;
          const end = input.value.length;
          input.setSelectionRange(end, end);
        }
        return;
      case 'Delete':
        // Excel-style: Delete clears an entire cell's content outright, rather than removing
        // just the character to the right of the cursor.
        if (kind === 'desc') {
          e.preventDefault();
          const row = rows[rowIndex];
          if (row) updateDescription(row.id, level, '');
        }
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
        showValidationError('Cannot move an entry into itself or its own children.');
        return;
      }
      setMoveTarget({ rowId });
      return;
    }
    if (copyMode) {
      if (copyMode.rowIds.has(rowId)) {
        showValidationError('Choose a position outside the copied rows.');
        return;
      }
      setCopyTarget({ rowId });
      return;
    }
    if (e.shiftKey && selection && anchorRowId && anchorLevel !== null) {
      const ids = rows.map((r) => r.id);
      const anchorIdx = ids.indexOf(anchorRowId);
      const clickIdx = ids.indexOf(rowId);
      const [start, end] = anchorIdx < clickIdx ? [anchorIdx, clickIdx] : [clickIdx, anchorIdx];
      const rowIds = new Set(ids.slice(start, end + 1));
      // Shift-clicking into a *different* cell kind than the selection started in (e.g. from
      // a code cell across to a description cell, per item 3's "top-left code cell to
      // bottom-right description cell") switches into "every column highlights" mode for
      // these rows — sticky for the rest of this selection, even if a later shift-click in
      // the same gesture lands back on the original kind.
      if (selection.allColumns || kind !== selection.kind) {
        setSelection({ ...selection, rowIds, allColumns: true });
      } else if (kind === 'code') {
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
  // rectangular multi-column block. Dragging into a *different* cell kind than the drag
  // started in (e.g. from a code cell across to a description cell — item 3's "top-left code
  // cell to bottom-right description cell") switches into "every column highlights" mode for
  // these rows, same as the shift-click equivalent above — sticky for the rest of the drag.
  function extendDragSelection(kind: CellKind, rowId: string, level: number) {
    if (!selection || anchorRowId === null || anchorLevel === null) return;
    const ids = rows.map((r) => r.id);
    const anchorIdx = ids.indexOf(anchorRowId);
    const hoverIdx = ids.indexOf(rowId);
    if (anchorIdx === -1 || hoverIdx === -1) return;
    const [start, end] = anchorIdx < hoverIdx ? [anchorIdx, hoverIdx] : [hoverIdx, anchorIdx];
    const rowIds = new Set(ids.slice(start, end + 1));
    if (selection.allColumns || kind !== selection.kind) {
      setSelection({ ...selection, rowIds, allColumns: true });
    } else if (kind === 'code') {
      const [colStart, colEnd] = anchorLevel <= level ? [anchorLevel, level] : [level, anchorLevel];
      setSelection({ kind, level: colStart, levelEnd: colEnd, rowIds });
    } else {
      setSelection({ kind, level: anchorLevel, rowIds });
    }
  }

  function handleCellMouseEnter(kind: CellKind, rowId: string, level: number) {
    if (!isDraggingRef.current || moveMode || copyMode) return;
    extendDragSelection(kind, rowId, level);
  }

  function handleDelimiterContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setDelimNotice({ x: e.clientX, y: e.clientY });
  }

  function handleCellContextMenu(kind: CellKind, rowId: string, level: number, e: React.MouseEvent) {
    e.preventDefault();
    // Right-clicking a cell of the *same* kind as the current selection still needs to fall
    // within its highlighted column(s) to count as "in range" (so right-clicking outside a
    // deliberately narrow code-column block doesn't silently widen it). An "every column
    // highlights" selection (item 3's cross-kind row range) has no column bound to check
    // against, so row membership alone keeps it — every action still targets whichever column
    // was actually clicked, via contextMenu.level, not the selection's own.
    const inRange =
      selection &&
      selection.rowIds.has(rowId) &&
      (selection.allColumns ||
        (selection.kind === kind && level >= selection.level && level <= (selection.levelEnd ?? selection.level)));
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
    setContextMenu(null);
    if (blockIfAnyProtected(selection.rowIds, CORRUPT_DESCRIPTIONS_MESSAGE)) return;
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

  // Lock Taxonomy: the sanctioned way to retire a protected row, since it can no longer be
  // edited or deleted directly (Section-equivalent: preserves the historical code/description
  // instead of erasing it). Prefixes the description with "XXX " rather than replacing it, so
  // the original wording — and the row's place in the sequence — stays visible. Works even on
  // an unprotected row (harmless, just not required there); a description already marked is
  // left alone rather than getting a second "XXX ".
  function handleMarkAsDelete() {
    if (!contextMenu || contextMenu.kind !== 'desc' || !selection) return;
    const { level } = contextMenu;
    const prefix = 'XXX ';
    onChange(
      rows.map((row) =>
        selection.rowIds.has(row.id)
          ? {
              ...row,
              descriptions: row.descriptions.map((d, i) =>
                i === level && d && !d.startsWith(prefix) ? `${prefix}${d}` : d,
              ),
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
    if (blockIfAnyProtected(selection.rowIds)) return;
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

  // Right-click "Clear Codes and Start Again" — a deliberate reset of every code in the whole
  // taxonomy, not just the selected column/rows (unlike "Delete Codes" above), for when coding
  // has gone wrong enough that starting over is easier than fixing it cell by cell. Descriptions
  // and the hierarchy itself are untouched. Destructive across the entire grid, so it's always
  // gated behind an explicit confirmation, with no way to target just part of the taxonomy.
  function handleClearAllCodes() {
    if (!contextMenu || contextMenu.kind !== 'code') return;
    setContextMenu(null);
    if (blockIfAnyProtected(rows.map((r) => r.id))) return;
    setConfirmDialog({
      message: 'This will clear every code in the entire taxonomy. Continue?',
      confirmLabel: 'Confirm',
      onConfirm: () => {
        onChange(rows.map((row) => ({ ...row, codes: row.codes.map(() => '') })));
      },
    });
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
      showValidationError('No code above to replicate from.');
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

  // Right-click "Replicate Codes Below" — the mirror of Replicate Codes Above: takes the
  // value from the TOP row of the current selection itself (rather than the row above it)
  // and rolls it down through every blank cell beneath, stopping at the first cell in each
  // column that already holds something (a real code, or a "." padding character — either
  // way, a genuine boundary the replication shouldn't cross).
  function handleReplicateBelow() {
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
    let anySourceFound = false;
    let anyReplicated = false;
    for (let level = levelStart; level <= levelEnd; level++) {
      const sourceValue = rows[topIndex].codes[level] ?? '';
      if (!sourceValue) continue;
      anySourceFound = true;
      for (let idx = topIndex + 1; idx < updated.length; idx++) {
        if ((updated[idx].codes[level] ?? '') !== '') break;
        updated[idx].codes[level] = sourceValue;
        anyReplicated = true;
      }
    }
    if (!anySourceFound) {
      showValidationError('The selected cell is empty — nothing to replicate.');
      return;
    }
    if (!anyReplicated) {
      showValidationError('The cell(s) below already hold a value — nothing to replicate into.');
      return;
    }
    onChange(updated);
    setSelection(null);
    setContextMenu(null);
  }

  // Right-click "Export Block" (item 3) — an alternative to the toolbar's whole-table Create
  // Block, for exporting just a range: highlight from a top-left code cell down to a
  // bottom-right description cell (or any other multi-row selection) and export only that
  // contiguous run of rows. Available from either the code or description context menu,
  // whichever the selection happens to be in, since the exported block always carries each
  // row's full code path and description regardless of which cell kind was dragged over.
  function handleExportBlockMenuClick() {
    if (!contextMenu || !selection || selection.rowIds.size === 0) return;
    const selectedIndices = rows
      .map((r, i) => (selection.rowIds.has(r.id) ? i : -1))
      .filter((i) => i !== -1)
      .sort((a, b) => a - b);
    if (selectedIndices.length === 0) return;
    const start = selectedIndices[0];
    const end = selectedIndices[selectedIndices.length - 1] + 1;
    onExportBlock(rows.slice(start, end));
    setContextMenu(null);
  }

  // Right-click "Copy Codes" / "Paste Codes" (item 10) — copies the values of a selected code
  // block (one or more columns, one or more rows) into an in-memory clipboard, then pastes
  // them back in starting at wherever the user right-clicks next, overwriting downward and
  // rightward from that cell — a plain overtype, like Excel's own copy/paste, not a validated
  // entry (Replicate Above/Below and Delete Codes are bulk operations in the same spirit).
  function handleCopyCodesBlock() {
    if (!contextMenu || contextMenu.kind !== 'code' || !selection || selection.kind !== 'code') return;
    const levelStart = selection.level;
    const levelEnd = selection.levelEnd ?? selection.level;
    const selectedIndices = rows
      .map((r, i) => (selection.rowIds.has(r.id) ? i : -1))
      .filter((i) => i !== -1)
      .sort((a, b) => a - b);
    if (selectedIndices.length === 0) return;
    const colValues: string[][] = [];
    for (let level = levelStart; level <= levelEnd; level++) {
      colValues.push(selectedIndices.map((idx) => rows[idx].codes[level] ?? ''));
    }
    setCodeClipboard({ colValues, numRows: selectedIndices.length, numCols: levelEnd - levelStart + 1 });
    setSelection(null);
    setContextMenu(null);
  }

  function handlePasteCodesBlock() {
    if (!contextMenu || contextMenu.kind !== 'code' || !codeClipboard) return;
    const startIdx = rows.findIndex((r) => r.id === contextMenu.rowId);
    if (startIdx === -1) return;
    const startLevel = contextMenu.level;
    const pastedRowIds = rows.slice(startIdx, startIdx + codeClipboard.numRows).map((r) => r.id);
    if (blockIfAnyProtected(pastedRowIds)) return;
    const updated = rows.map((row) => ({ ...row, codes: [...row.codes] }));
    for (let c = 0; c < codeClipboard.numCols; c++) {
      const level = startLevel + c;
      if (level >= numLevels) break;
      for (let r = 0; r < codeClipboard.numRows; r++) {
        const idx = startIdx + r;
        if (idx >= updated.length) break;
        updated[idx].codes[level] = codeClipboard.colValues[c][r];
      }
    }
    onChange(updated);
    setContextMenu(null);
  }

  // Right-click a code cell → "Import Block": stashes that cell as the anchor for wherever the
  // block's own top row should land, then opens a hidden file picker. The rest of the flow
  // (handleBlockFileSelected → beginImport → continueImportAfterColumns → finalizeImport) runs
  // off pendingImport once a file is chosen.
  function handleImportBlockMenuClick() {
    if (!contextMenu || contextMenu.kind !== 'code') return;
    importBlockAnchorRef.current = { rowId: contextMenu.rowId, level: contextMenu.level };
    setContextMenu(null);
    importBlockFileInputRef.current?.click();
  }

  async function handleBlockFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const anchor = importBlockAnchorRef.current;
    if (!file || !anchor) return;
    try {
      const block = await parseBlockFile(file);
      beginImport(block, anchor.rowId, anchor.level);
    } catch (err) {
      showValidationError(err instanceof Error ? err.message : 'Could not load this block file.');
    }
  }

  // Works out whether the block needs more columns than the taxonomy currently has (the
  // block's own deepest entry, shifted right by the anchor's column) and, if so, asks before
  // growing the grid — the one step in this flow the user might genuinely want to abort on,
  // since it changes the shape of the whole table, not just the rows being inserted.
  function beginImport(block: TaxonomyBlock, anchorRowId: string, anchorLevel: number) {
    if (block.entries.length === 0) {
      showValidationError('This block has no entries to import.');
      return;
    }

    // Lock Taxonomy: Import Block inserts its rows right at the anchor, pushing the anchor
    // row (and everything below it) down — the same "wedge in between two existing
    // neighbours" as Insert Row, and the same hard gap-only rule applies while locked: the
    // anchor's own code and its previous sibling's code at this level must actually have room
    // for something between them, or this would force recoding an existing (likely protected)
    // neighbour.
    const anchorIndex = rows.findIndex((r) => r.id === anchorRowId);
    if (locked && anchorIndex > 0) {
      const aboveCode = rows[anchorIndex - 1].codes[anchorLevel] ?? '';
      const belowCode = rows[anchorIndex].codes[anchorLevel] ?? '';
      if (aboveCode !== '' && belowCode !== '' && !hasCodeGap(aboveCode, belowCode, codeRestriction, paddingChar)) {
        showValidationError(
          `There is no available code between "${aboveCode}" and "${belowCode}" at this level — importing a block here would require renumbering an existing entry while the taxonomy is locked, which is not allowed. Unlock the taxonomy first if this is genuinely necessary.`,
        );
        return;
      }
    }

    // Each entry's `codes` is the row's FULL ancestor path from the SOURCE taxonomy's own root
    // (buildBlock: `row.codes.slice(0, level + 1)`) — not a path relative to the block's own
    // shallowest entry. A block cut from deep inside a table (e.g. a level-2 heading and its
    // level-3 children) still carries 3- and 4-element `codes` arrays, even though the heading
    // itself is meant to land exactly on the anchor. Only the portion from that shallowest
    // entry downward belongs at the destination; the ancestor prefix above it is context from
    // the source table that means nothing here (prefixCodes below supplies the destination's
    // own ancestor context instead) and must be stripped before placing anything.
    const baseLevel = Math.min(...block.entries.map((entry) => entry.codes.length - 1));
    const maxBlockDepth = Math.max(...block.entries.map((entry) => entry.codes.length - 1 - baseLevel));
    const requiredLevels = anchorLevel + maxBlockDepth + 1;
    const pending = { block, anchorRowId, anchorLevel, requiredLevels, baseLevel };
    if (requiredLevels > numLevels) {
      setPendingImport(pending);
      setAddColumnsChoice({ addCount: requiredLevels - numLevels });
    } else {
      continueImportAfterColumns(pending);
    }
  }

  function continueImportAfterColumns(pending: NonNullable<typeof pendingImport>) {
    const maxSuffixCount = Math.max(0, ...pending.block.entries.map((entry) => entry.suffixValues.length));
    if (maxSuffixCount >= 1) {
      setPendingImport(pending);
      setSuffix1SourceChoice(true);
    } else {
      finalizeImport(pending, null, 'useExisting', '');
    }
  }

  // Builds the new rows, grows the grid's own columns if the earlier step called for it, and
  // hands the finished settings + rows to the caller in one shot (Section 4.4: delimiters and
  // padding are the target's own — this only ever carries over real code characters and text).
  //
  // Suffix 1's value is either a fresh value typed once for this whole import ("Enter Text" —
  // e.g. tagging this import with the Division or Location it's landing in, since a block built
  // from a "master" table typically has nothing instance-specific filled in yet), applied the
  // same way to every row, or each row's own value from the source block ("Use Existing Text").
  // Suffixes beyond the first always come straight from the source block's own per-row values.
  function finalizeImport(
    pending: NonNullable<typeof pendingImport>,
    suffix1Mode: 'concatenate' | 'rightJustify' | null,
    suffix1Source: 'enterText' | 'useExisting',
    suffix1Text: string,
  ) {
    const { block, anchorRowId, anchorLevel, requiredLevels, baseLevel } = pending;
    const newNumLevels = Math.max(numLevels, requiredLevels);
    const anchorIndex = rows.findIndex((r) => r.id === anchorRowId);
    if (anchorIndex === -1) {
      setPendingImport(null);
      return;
    }

    // Columns to the left of the anchor are inherited from the anchor row's own current codes
    // — the same "insert here, nested under this context" convention Add Row/Insert Row already
    // use — rather than invented or left for the user to fill in from scratch.
    const prefixCodes = rows[anchorIndex].codes.slice(0, anchorLevel);
    const targetSuffixCount = suffixes.length;
    let droppedSuffixes = false;

    const newRows: TaxonomyRow[] = block.entries.map((entry) => {
      const ownCodes = entry.codes.slice(baseLevel);
      const codes = Array(newNumLevels).fill('');
      for (let i = 0; i < anchorLevel; i++) codes[i] = prefixCodes[i] ?? '';
      for (let i = 0; i < ownCodes.length; i++) codes[anchorLevel + i] = ownCodes[i] ?? '';

      let description = entry.description;
      // Constant-mode suffixes the block doesn't cover fall back to their configured default —
      // the same seeding createEmptyRow already does for a brand-new row.
      const suffixValues = suffixes.map((s) => (s.mode === 'constant' ? s.constantValue : ''));

      const suffix1Value = suffix1Source === 'enterText' ? suffix1Text : (entry.suffixValues[0] ?? '');
      if (suffix1Mode === 'concatenate') {
        if (suffix1Value) description = `${description}-${suffix1Value}`;
      } else if (suffix1Mode === 'rightJustify') {
        if (targetSuffixCount >= 1) {
          suffixValues[0] = suffix1Value;
        } else if (suffix1Value) {
          droppedSuffixes = true;
        }
      }

      // Suffixes beyond the first still come straight from the source block's own per-row
      // values (Section spec: "the remaining suffixes should remain right justified").
      entry.suffixValues.forEach((value, i) => {
        if (i === 0) return;
        if (i < targetSuffixCount) {
          suffixValues[i] = value;
        } else if (value) {
          droppedSuffixes = true;
        }
      });

      const descriptions = Array(newNumLevels).fill('');
      descriptions[anchorLevel + ownCodes.length - 1] = description;
      return { id: crypto.randomUUID(), codes, descriptions, suffixValues };
    });

    // Every existing row grows to match, so the grid stays rectangular (Section 6.1: added
    // columns go to the right of everything already there).
    const pad = newNumLevels - numLevels;
    const updatedExisting = pad === 0 ? rows : growRowsToLevels(rows, newNumLevels);

    // Inserted right at the anchor position itself (pushing the anchor row and everything
    // below it down), not after it — more intuitive when the anchor is a blank row already
    // prepared for the import, which would otherwise be left sitting oddly above the block.
    const insertAt = anchorIndex;
    const finalRows = [...updatedExisting.slice(0, insertAt), ...newRows, ...updatedExisting.slice(insertAt)];
    const newSettings: TaxonomySettings = pad === 0 ? settings : { ...settings, numLevels: newNumLevels };

    onSettingsAndRowsChange(newSettings, finalRows);
    setPendingImport(null);
    setSelection(null);
    if (droppedSuffixes) setDroppingSuffixesNotice(true);
  }

  // Right-click "Add Column" (on either a code or a description cell) — the quick, one-off
  // counterpart to changing "Number of Code Columns" in Settings: adds exactly one more
  // Right-click "Help" (on any of the three menu kinds) — shows that menu's own guidance text
  // from public/help-text.csv, the same mechanism as the setup screens' field-level help icons.
  function handleGridMenuHelp(field: 'gridCodeMenuHelp' | 'gridDescMenuHelp' | 'gridSuffixMenuHelp') {
    setContextMenu(null);
    showValidationError(helpText[field]?.trim() || 'No help text has been added for this menu yet.');
  }

  // code/description column pair at the far right. Always safe (Section 6.1: new columns start
  // blank), so it's a plain Yes/No confirm rather than a data-loss warning.
  function handleAddColumnClick() {
    if (!contextMenu) return;
    setContextMenu(null);
    setConfirmDialog({
      message: 'Add a new code and description column at the far right?',
      confirmLabel: 'Yes',
      onConfirm: () => {
        onSettingsAndRowsChange(
          { ...settings, numLevels: numLevels + 1 },
          growRowsToLevels(rows, numLevels + 1),
        );
      },
    });
  }

  // Right-click "Delete Column" — the mirror of Add Column: removes the far-right code and
  // description column pair, but only when it's genuinely unused (both cells blank in every
  // row) — never trims real content, so this is a plain Yes/No confirm rather than a data-loss
  // warning.
  function handleDeleteColumnClick() {
    if (!contextMenu) return;
    setContextMenu(null);
    if (numLevels <= 1) {
      showValidationError('This is the last column — a taxonomy needs at least one.');
      return;
    }
    const lastLevel = numLevels - 1;
    const isBlank = rows.every(
      (row) => !(row.codes[lastLevel] ?? '') && !(row.descriptions[lastLevel] ?? '').trim(),
    );
    if (!isBlank) {
      showValidationError(`Column ${numLevels} still holds a code or description — clear it first.`);
      return;
    }
    setConfirmDialog({
      message: 'Delete the last code and description column?',
      confirmLabel: 'Yes',
      onConfirm: () => {
        const newNumLevels = numLevels - 1;
        const newRows = rows.map((row) => ({
          ...row,
          codes: row.codes.slice(0, newNumLevels),
          descriptions: row.descriptions.slice(0, newNumLevels),
        }));
        onSettingsAndRowsChange(
          { ...settings, numLevels: newNumLevels, delimiterPositions: delimiterPositions.filter((p) => p < newNumLevels) },
          newRows,
        );
      },
    });
  }

  // Right-click "Check Ascending Order" — an on-demand audit distinct from the hard rule
  // enforced as codes are typed (Section 4.4/6.7), since Override, promote/demote, Move, and
  // sort can all rearrange rows without necessarily re-checking every column afterward. On
  // column 1, checks the whole column top to bottom; anywhere else, checks only the currently
  // selected block in that column. Consecutive equal values are fine — only an actual decrease
  // is flagged. Blank cells are skipped, not treated as violations.
  function handleCheckAscendingOrder() {
    if (!contextMenu || contextMenu.kind !== 'code') return;
    const level = contextMenu.level;
    setContextMenu(null);
    let indices: number[];
    if (level === 0) {
      indices = rows.map((_, i) => i);
    } else if (
      selection &&
      selection.kind === 'code' &&
      level >= selection.level &&
      level <= (selection.levelEnd ?? selection.level)
    ) {
      indices = rows
        .map((r, i) => (selection.rowIds.has(r.id) ? i : -1))
        .filter((i) => i !== -1)
        .sort((a, b) => a - b);
    } else {
      showValidationError('Select a block of rows in this column first, then check its order.');
      return;
    }
    let prevValue: string | null = null;
    let prevRowNumber: number | null = null;
    for (const idx of indices) {
      const value = rows[idx].codes[level] ?? '';
      if (!value) continue;
      if (prevValue !== null && value.charCodeAt(0) < prevValue.charCodeAt(0)) {
        showValidationError(
          `Out of order: row ${idx + 1} ("${value}") comes after row ${prevRowNumber} ("${prevValue}").`,
          () => focusCell('code', level, idx),
        );
        return;
      }
      prevValue = value;
      prevRowNumber = idx + 1;
    }
    showValidationError('Codes are in ascending order — no issues found.');
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
      showValidationError(
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
        showValidationError(
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
            showValidationError('Descriptions must cascade no more than one column right');
            return;
          }
          break;
        }
        const newBottomLevel = levelOf(rows[end - 1]) + offset;
        if (end < rows.length) {
          const lvl = levelOf(rows[end]);
          if (lvl !== -1 && lvl > newBottomLevel + 1) {
            showValidationError('Descriptions must cascade no more than one column right');
            return;
          }
        }
      }
    }

    // Lock Taxonomy: promote/demote blanks every affected row's own code (Section 6.3) — the
    // same integrity risk as editing it directly, so a protected row (or a protected
    // descendant swept along with it) blocks the whole move.
    if (blockIfAnyProtected([...affected].map((i) => rows[i].id))) return;

    onChange(
      rows.map((row, i) => {
        if (!affected.has(i)) return row;
        const oldLevel = levelOf(row);
        const newLevel = oldLevel + offset;
        // Only the description moves; colour follows the column automatically since it's
        // never stored per-row. The code cell at the entry's new column is blanked — that's
        // the one whose value is no longer trustworthy at the new level and needs a fresh
        // code — and so is the one at its old column, since the entry no longer sits there;
        // leaving a stale value behind would make it look like an untouched ancestor code.
        // Every other code cell on the row (its actual ancestor path) is left alone
        // (Section 6.3).
        const descriptions = row.descriptions.map((d, idx) => {
          if (idx === newLevel) return row.descriptions[oldLevel];
          if (idx === oldLevel) return '';
          return d;
        });
        const codes = row.codes.map((c, idx) => (idx === newLevel || idx === oldLevel ? '' : c));
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
    setContextMenu(null);
    if (blockIfAnyProtected(rows.slice(topIndex, bottomIndex + 1).map((r) => r.id), CORRUPT_ORDER_MESSAGE)) return;
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
    setContextMenu(null);
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
    const movingIds = Array.from(affected).map((i) => rows[i].id);
    if (blockIfAnyProtected(movingIds, CORRUPT_ORDER_MESSAGE)) return;
    setMoveMode({ rowIds: new Set(movingIds) });
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

  // Right-click "Copy Rows" (item 9) — arms copy mode with the selected entry (or entries)
  // and all of their descendants, same block-selection rule as Move. Unlike Move, the
  // originals are left exactly where they are; the next plain click on any other row picks
  // where a duplicate of the whole block is inserted.
  function handleCopyStart() {
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
    setCopyMode({ rowIds: new Set(Array.from(affected).map((i) => rows[i].id)) });
    setSelection(null);
    setContextMenu(null);
  }

  // Inserts a fresh-id duplicate of the copied block directly above/below the target row,
  // preserving the copied rows' own internal order, descriptions, and codes — the originals
  // stay untouched at their existing position.
  function executeCopy(position: 'above' | 'below') {
    if (!copyMode || !copyTarget) return;
    const copyingIds = copyMode.rowIds;
    const originals = rows.filter((r) => copyingIds.has(r.id));
    const copies = originals.map((r) => ({
      ...r,
      id: crypto.randomUUID(),
      codes: [...r.codes],
      descriptions: [...r.descriptions],
      suffixValues: [...r.suffixValues],
    }));
    const targetIndex = rows.findIndex((r) => r.id === copyTarget.rowId);
    if (targetIndex === -1) {
      setCopyMode(null);
      setCopyTarget(null);
      return;
    }
    const insertAt = position === 'above' ? targetIndex : targetIndex + 1;
    onChange([...rows.slice(0, insertAt), ...copies, ...rows.slice(insertAt)]);
    setCopyMode(null);
    setCopyTarget(null);
  }

  return (
    <div className="grid-wrapper">
      <input
        ref={importBlockFileInputRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={handleBlockFileSelected}
      />
      {collapseFilter !== null && (
        <div className="collapse-banner">
          {collapseFilter.kind === 'level'
            ? `Showing entries down to column ${collapseFilter.level + 1} only.`
            : `Showing only rows padded with "${paddingChar}" in code column ${collapseFilter.level + 1}.`}
          <button type="button" onClick={() => setCollapseFilter(null)}>
            Show All
          </button>
        </div>
      )}
      <table className="taxonomy-grid">
        <thead>
          <tr>
            <th className="row-number-col" rowSpan={2}>
              &nbsp;
            </th>
            {!hideAllCodes && (
              <>
                <th colSpan={numLevels + delimiterPositions.length} className="section-heading">
                  Code
                </th>
                <th className="gap-col">&nbsp;</th>
              </>
            )}
            <th colSpan={numLevels + 1} className="section-heading">
              Description
            </th>
            <th className="row-actions-col">&nbsp;</th>
          </tr>
          <tr>
            {!hideAllCodes && (
              <>
                {levels.map((level) => (
                  <Fragment key={`code-h-${level}`}>
                    <th className="code-col" style={{ backgroundColor: getLevelColor(level) }}>
                      <div className="level-header">
                        <span>{level + 1}</span>
                        <button
                          type="button"
                          className={`collapse-caret${collapseFilter?.kind === 'codeDot' && collapseFilter.level === level ? ' collapse-caret-active' : ''}`}
                          onClick={() =>
                            setCollapseFilter(
                              collapseFilter?.kind === 'codeDot' && collapseFilter.level === level
                                ? null
                                : { kind: 'codeDot', level },
                            )
                          }
                          title={
                            collapseFilter?.kind === 'codeDot' && collapseFilter.level === level
                              ? 'Show all rows again'
                              : `Filter — show only rows padded with "${paddingChar}" in this column`
                          }
                        >
                          ▾
                        </button>
                      </div>
                    </th>
                    {delimiterPositions.includes(level + 1) && <th className="delim-col">&nbsp;</th>}
                  </Fragment>
                ))}
                <th className="gap-col">&nbsp;</th>
              </>
            )}
            {levels.map((level) => (
              <th
                key={`desc-h-${level}`}
                className="desc-col"
                style={{ backgroundColor: getLevelColor(level) }}
              >
                <div className="level-header">
                  <span>{level + 1}</span>
                  <button
                    type="button"
                    className={`collapse-caret${collapseFilter?.kind === 'level' && collapseFilter.level === level ? ' collapse-caret-active' : ''}`}
                    onClick={() =>
                      setCollapseFilter(
                        collapseFilter?.kind === 'level' && collapseFilter.level === level
                          ? null
                          : { kind: 'level', level },
                      )
                    }
                    title={
                      collapseFilter?.kind === 'level' && collapseFilter.level === level
                        ? 'Show all rows again'
                        : `Filter/Collapse — hide rows with descriptions beyond column ${level + 1}`
                    }
                  >
                    ▾
                  </button>
                </div>
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
          {rows.map((row, rowIndex) => {
            const isFilteredOut =
              collapseFilter?.kind === 'level'
                ? levelOf(row) > collapseFilter.level
                : collapseFilter?.kind === 'codeDot'
                  ? (row.codes[collapseFilter.level] ?? '') !== paddingChar
                  : false;
            const rowClasses = [
              moveMode?.rowIds.has(row.id) ? 'row-moving' : copyMode?.rowIds.has(row.id) ? 'row-copying' : null,
              isFilteredOut ? 'row-collapsed' : null,
              row.protected ? 'row-protected' : null,
            ]
              .filter(Boolean)
              .join(' ');
            return (
            <tr
              key={row.id}
              className={rowClasses || undefined}
            >
              <td className="row-number-col">{rowIndex + 1}</td>
              {!hideAllCodes && (
                <>
                  {levels.map((level) => {
                    const isCodeSelected =
                      !!selection &&
                      selection.rowIds.has(row.id) &&
                      (selection.allColumns ||
                        (selection.kind === 'code' &&
                          level >= selection.level &&
                          level <= (selection.levelEnd ?? selection.level)));
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
                        {delimiterPositions.includes(level + 1) && (
                          <td className="delim-col" onContextMenu={handleDelimiterContextMenu}>
                            {codeDelimiterChar}
                          </td>
                        )}
                      </Fragment>
                    );
                  })}
                  <td className="gap-col">&nbsp;</td>
                </>
              )}
              {levels.map((level) => {
                const isSelected =
                  !!selection &&
                  selection.rowIds.has(row.id) &&
                  (selection.allColumns || (selection.kind === 'desc' && selection.level === level));
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
                      // Column 1 is forced to ALL CAPS as you type (Section 4.3) — hinting the
                      // same at the virtual-keyboard level, so a mobile/tablet keyboard visibly
                      // shows itself shifted into caps for this field, like a locked Caps Lock.
                      autoCapitalize={level === 0 ? 'characters' : undefined}
                      value={row.descriptions[level] ?? ''}
                      onChange={(e) => updateDescription(row.id, level, e.target.value)}
                      onKeyDown={(e) => handleCellKeyDown(e, 'desc', level, rowIndex)}
                      onBlur={
                        rowIndex === 0 && level === 0
                          ? () => {
                              // Shown once leaving the cell, not on the first keystroke — a
                              // popup grabbing focus mid-word would swallow the rest of what's
                              // being typed. Deferred a tick past the blur itself: blur fires as
                              // part of whatever click moved focus away (e.g. "+ Add Row"), and
                              // showing the overlay within that same synchronous dispatch can
                              // cover the very element being clicked before its own click
                              // finishes — swallowing that click instead of acting on it.
                              if (!capsNoticeShownRef.current && (row.descriptions[0] ?? '').trim()) {
                                capsNoticeShownRef.current = true;
                                setTimeout(() => setShowCapsNotice(true), 0);
                              }
                            }
                          : undefined
                      }
                    />
                  </td>
                );
              })}
              <td className="overflow-col" style={{ width: `${overflowChars}ch` }} />
              {suffixes.map((suffix, index) => {
                const isSuffixSelected =
                  selection?.kind === 'suffix' && selection.level === index && selection.rowIds.has(row.id);
                return (
                  <Fragment key={`suffix-${row.id}-${index}`}>
                    <td className="delim-col" onContextMenu={handleDelimiterContextMenu}>
                      {suffix.delimiter || '-'}
                    </td>
                    <td
                      className={`suffix-col${isSuffixSelected ? ' desc-col-selected' : ''}`}
                      data-cell-kind="suffix"
                      data-row-id={row.id}
                      data-level={index}
                      onMouseDown={(e) => handleCellMouseDown('suffix', row.id, index, e)}
                      onMouseEnter={() => handleCellMouseEnter('suffix', row.id, index)}
                      onContextMenu={(e) => handleCellContextMenu('suffix', row.id, index, e)}
                    >
                      <input
                        id={suffixInputId(index, row.id)}
                        className="suffix-cell"
                        type="text"
                        maxLength={suffix.width}
                        value={row.suffixValues[index] ?? ''}
                        onFocus={() => {
                          suffixEditOriginalRef.current = { rowId: row.id, index, value: row.suffixValues[index] ?? '' };
                        }}
                        onChange={(e) => updateSuffix(row.id, index, e.target.value)}
                        onBlur={() => checkSuffixDuplicate(row.id, index)}
                        onKeyDown={(e) => handleSuffixKeyDown(e, index, rowIndex)}
                      />
                    </td>
                  </Fragment>
                );
              })}
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
            );
          })}
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

      {copyMode && (
        <p className="move-mode-banner">
          Click a row to copy the selected {copyMode.rowIds.size} row
          {copyMode.rowIds.size > 1 ? 's' : ''} there — Escape to cancel.
        </p>
      )}

      {delimNotice && (
        <ul
          className="context-menu"
          style={{ top: delimNotice.y, left: delimNotice.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <li className="context-menu-disabled">Not editable</li>
        </ul>
      )}

      {contextMenu && (
        <ul
          ref={contextMenuRef}
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.kind === 'desc' && (
            <>
              <li onClick={handleToggleCase}>Toggle Case</li>
              <li onClick={handleMarkAsDelete}>Mark as Delete</li>
              <li onClick={handleAlphaSort}>Alpha Sort</li>
              <li onClick={() => requestPromoteDemote('promote')}>Promote</li>
              <li onClick={() => requestPromoteDemote('demote')}>Demote</li>
              <li onClick={handleMoveStart}>Move</li>
              <li onClick={handleCopyStart}>Copy Rows</li>
              <li onClick={() => handleGridMenuHelp('gridDescMenuHelp')}>Help</li>
            </>
          )}
          {contextMenu.kind === 'code' && (
            <>
              <li onClick={handleDeleteCodes}>Delete Codes</li>
              <li onClick={handleReplicateAbove}>Replicate Codes Above</li>
              <li onClick={handleReplicateBelow}>Replicate Codes Below</li>
              <li onClick={handleCheckAscendingOrder}>Check Ascending Order</li>
              <li onClick={handleCopyCodesBlock}>Copy Codes</li>
              {codeClipboard && <li onClick={handlePasteCodesBlock}>Paste Codes</li>}
              <li onClick={handleImportBlockMenuClick}>Import Block</li>
              <li onClick={handleClearAllCodes}>Clear Codes and Start Again</li>
              <li onClick={() => handleGridMenuHelp('gridCodeMenuHelp')}>Help</li>
            </>
          )}
          {contextMenu.kind === 'suffix' && (
            <>
              <li onClick={handleDuplicateSuffixToSelection}>Duplicate to Selected Rows</li>
              <li onClick={() => handleGridMenuHelp('gridSuffixMenuHelp')}>Help</li>
            </>
          )}
          {contextMenu.kind !== 'suffix' && <li onClick={handleAddColumnClick}>Add Column</li>}
          {contextMenu.kind !== 'suffix' && <li onClick={handleDeleteColumnClick}>Delete Column</li>}
          {contextMenu.kind !== 'suffix' && selection && selection.rowIds.size > 0 && (
            <li onClick={handleExportBlockMenuClick}>Export Block</li>
          )}
          <li
            className="context-menu-separator"
            onClick={() => {
              setAddRowOnDownArrow((v) => !v);
              setContextMenu(null);
            }}
          >
            {addRowOnDownArrow ? '✓ ' : ''}Add Row on Down Arrow
          </li>
          <li onClick={() => handleInsertRow('above')}>
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

      {suffixDuplicateChoice && (
        <div className="validation-overlay" onClick={() => setSuffixDuplicateChoice(null)}>
          <div
            ref={suffixDuplicateDialogRef}
            className="validation-dialog"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <p>Duplicate Entry</p>
            <div className="confirm-dialog-actions">
              <button
                type="button"
                onClick={() => {
                  updateSuffix(suffixDuplicateChoice.rowId, suffixDuplicateChoice.index, suffixDuplicateChoice.previousValue);
                  setSuffixDuplicateChoice(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const { rowId, index } = suffixDuplicateChoice;
                  setSuffixDuplicateChoice(null);
                  const input = document.getElementById(suffixInputId(index, rowId)) as HTMLInputElement | null;
                  input?.focus();
                  input?.select();
                }}
              >
                Edit
              </button>
              <button type="button" onClick={() => setSuffixDuplicateChoice(null)}>
                Accept
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

      {copyTarget && (
        <div
          className="validation-overlay"
          onClick={() => {
            setCopyTarget(null);
            setCopyMode(null);
          }}
        >
          <div
            ref={copyDialogRef}
            className="validation-dialog"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <p>Insert the copied row(s) above or below this row?</p>
            <div className="confirm-dialog-actions">
              <button
                type="button"
                onClick={() => {
                  setCopyTarget(null);
                  setCopyMode(null);
                }}
              >
                Cancel
              </button>
              <button type="button" onClick={() => executeCopy('above')}>
                Insert Above
              </button>
              <button type="button" onClick={() => executeCopy('below')}>
                Insert Below
              </button>
            </div>
          </div>
        </div>
      )}

      {validationError && (
        <div className="validation-overlay" onClick={dismissValidationError}>
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
            <button type="button" onClick={dismissValidationError}>
              OK
            </button>
          </div>
        </div>
      )}

      {showCapsNotice && (
        <div className="validation-overlay" onClick={() => setShowCapsNotice(false)}>
          <div
            ref={capsNoticeDialogRef}
            className="validation-dialog"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <p>All headings should be capitalized.</p>
            <button type="button" onClick={() => setShowCapsNotice(false)}>
              OK
            </button>
          </div>
        </div>
      )}

      {showCodeCaseNotice && (
        <div className="validation-overlay" onClick={() => setShowCodeCaseNotice(false)}>
          <div className="validation-dialog" onClick={(e) => e.stopPropagation()}>
            <p>Codes typed in the wrong case are automatically converted to match this taxonomy's Code Restriction.</p>
            <button type="button" onClick={() => setShowCodeCaseNotice(false)}>
              OK
            </button>
          </div>
        </div>
      )}

      {addColumnsChoice && (
        <div
          className="validation-overlay"
          onClick={() => {
            setAddColumnsChoice(null);
            setPendingImport(null);
          }}
        >
          <div
            ref={addColumnsDialogRef}
            className="validation-dialog"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <p>
              This will add {addColumnsChoice.addCount} column{addColumnsChoice.addCount === 1 ? '' : 's'}
            </p>
            <div className="confirm-dialog-actions">
              <button
                type="button"
                onClick={() => {
                  setAddColumnsChoice(null);
                  setPendingImport(null);
                }}
              >
                Abort
              </button>
              <button
                type="button"
                onClick={() => {
                  const pending = pendingImport;
                  setAddColumnsChoice(null);
                  if (pending) continueImportAfterColumns(pending);
                }}
              >
                Add Columns
              </button>
            </div>
          </div>
        </div>
      )}

      {suffix1SourceChoice && (
        <div
          className="validation-overlay"
          onClick={() => {
            setSuffix1SourceChoice(false);
            setPendingImport(null);
          }}
        >
          <div
            ref={suffix1SourceDialogRef}
            className="validation-dialog"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <p>Enter Text for Suffix 1 or Use Existing Text?</p>
            <div className="confirm-dialog-actions">
              <button
                type="button"
                onClick={() => {
                  setSuffix1SourceChoice(false);
                  setPendingImport(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setSuffix1SourceChoice(false);
                  setSuffixTextValue('');
                  setSuffixTextEntryPending(true);
                }}
              >
                Enter Text
              </button>
              <button
                type="button"
                onClick={() => {
                  setSuffix1SourceChoice(false);
                  setSuffixModePending({ suffix1Source: 'useExisting', suffix1Text: '' });
                }}
              >
                Use Existing Text
              </button>
            </div>
          </div>
        </div>
      )}

      {suffixTextEntryPending && (
        <div
          className="validation-overlay"
          onClick={() => {
            setSuffixTextEntryPending(false);
            setPendingImport(null);
          }}
        >
          <div className="validation-dialog" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <p>Enter Text for Suffix 1{suffixes[0] ? ` (up to ${suffixes[0].width} characters)` : ''}</p>
            <input
              ref={suffixTextInputRef}
              type="text"
              value={suffixTextValue}
              maxLength={suffixes[0]?.width}
              onChange={(e) => setSuffixTextValue(e.target.value)}
              onKeyDown={(e) => {
                // Stops here rather than reaching a dialog-level trap (this field needs to
                // accept ordinary typing) — Enter still submits, matching the default action
                // of the first button in most native dialogs.
                e.stopPropagation();
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setSuffixTextEntryPending(false);
                  setSuffixModePending({ suffix1Source: 'enterText', suffix1Text: suffixTextValue });
                }
              }}
            />
            <div className="confirm-dialog-actions">
              <button
                type="button"
                onClick={() => {
                  setSuffixTextEntryPending(false);
                  setPendingImport(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setSuffixTextEntryPending(false);
                  setSuffixModePending({ suffix1Source: 'enterText', suffix1Text: suffixTextValue });
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {suffixModePending && (
        <div
          className="validation-overlay"
          onClick={() => {
            setSuffixModePending(null);
            setPendingImport(null);
          }}
        >
          <div
            ref={suffixModeDialogRef}
            className="validation-dialog"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <p>Concatenate Suffix 1 or Right Justify?</p>
            <div className="confirm-dialog-actions">
              <button
                type="button"
                onClick={() => {
                  setSuffixModePending(null);
                  setPendingImport(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const pending = pendingImport;
                  const { suffix1Source, suffix1Text } = suffixModePending;
                  setSuffixModePending(null);
                  if (pending) finalizeImport(pending, 'concatenate', suffix1Source, suffix1Text);
                }}
              >
                Concatenate
              </button>
              <button
                type="button"
                onClick={() => {
                  const pending = pendingImport;
                  const { suffix1Source, suffix1Text } = suffixModePending;
                  setSuffixModePending(null);
                  if (pending) finalizeImport(pending, 'rightJustify', suffix1Source, suffix1Text);
                }}
              >
                Right Justify
              </button>
            </div>
          </div>
        </div>
      )}

      {droppingSuffixesNotice && (
        <div className="validation-overlay" onClick={() => setDroppingSuffixesNotice(false)}>
          <div
            ref={droppingSuffixesDialogRef}
            className="validation-dialog"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <p>Dropping Excess Suffixes</p>
            <button type="button" onClick={() => setDroppingSuffixesNotice(false)}>
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
