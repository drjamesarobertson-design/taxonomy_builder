// Code character rules, per CLAUDE.md Section 4.4 / 6.7 (hard rule): within any column,
// codes must sort in ascending ASCII order top to bottom. Only '.', 0-9, a-z, A-Z are valid.

import type { CodeRestriction, TaxonomyRow } from './types';
import { isAllCaps } from './caseUtils';

// A row's level is the position of its deepest populated description column (Section 4.1);
// -1 means the row has no description at all yet.
function levelOf(row: TaxonomyRow): number {
  for (let i = row.descriptions.length - 1; i >= 0; i--) {
    if ((row.descriptions[i] ?? '').trim()) return i;
  }
  return -1;
}

// Before Save/Export, check every row that has a description for a blank code cell within its
// own "valid range" — column 1 up through the column matching its own level (its full ancestor
// path plus its own code). A cell out here left empty (as opposed to a genuine "." padding
// character, which counts as filled) usually means a code was simply forgotten partway through
// data entry, so this is worth flagging before the file goes out the door.
export function hasBlankCodeGaps(rows: TaxonomyRow[]): boolean {
  return rows.some((row) => {
    const level = levelOf(row);
    if (level === -1) return false;
    for (let i = 0; i <= level; i++) {
      if (!(row.codes[i] ?? '')) return true;
    }
    return false;
  });
}

// Taxonomy integrity checks — used by Audit Taxonomy (below), which Lock Taxonomy now runs
// through rather than checking separately (James's ask): guaranteeing long-term integrity for
// data an ERP may already be posting against.

function immediateParentIndex(rows: TaxonomyRow[], idx: number): number {
  const level = levelOf(rows[idx]);
  for (let i = idx - 1; i >= 0; i--) {
    const l = levelOf(rows[i]);
    if (l !== -1 && l < level) return i;
  }
  return -1;
}

/** The hard ascending-order rule (Section 4.4/6.7) is enforced continuously as codes are
 * typed, but its own "Override" escape hatch (a deliberate mid-restructure exception — Grid.tsx)
 * means a taxonomy can still end up with a genuine violation in it. Re-audits the whole thing
 * one last time before Lock makes it permanent: within each level, siblings sharing the same
 * immediate parent (not the whole column — a later heading's children legitimately restart
 * their own numbering) must strictly ascend. Returns the first violation found, or null. */
export function findAscendingOrderViolation(
  rows: TaxonomyRow[],
): { rowIndex: number; level: number; value: string; prevRowIndex: number; prevValue: string } | null {
  const numLevels = rows.reduce((max, row) => Math.max(max, row.codes.length), 0);
  for (let level = 0; level < numLevels; level++) {
    const lastByParent = new Map<number | null, { value: string; rowIndex: number }>();
    for (let i = 0; i < rows.length; i++) {
      if (levelOf(rows[i]) !== level) continue;
      const parent = level > 0 ? immediateParentIndex(rows, i) : null;
      const value = rows[i].codes[level] ?? '';
      if (!value) continue;
      const prev = lastByParent.get(parent);
      if (prev && value < prev.value) {
        return { rowIndex: i, level, value, prevRowIndex: prev.rowIndex, prevValue: prev.value };
      }
      lastByParent.set(parent, { value, rowIndex: i });
    }
  }
  return null;
}

/** Section 4.3's own case convention doubles as a structural marker: an ALL CAPS entry is
 * supposed to have children (it's never itself a posting-level item), while Proper Case marks
 * an actual leaf. A heading left in ALL CAPS with nothing deeper underneath it is exactly the
 * "every description has a child sequence all the way to the posting level" gap James asked
 * Lock to catch — it reads as structural but the hierarchy under it was never finished. Skipped
 * entirely for a Proper-Case-throughout taxonomy (James's Simple Taxonomy option, Settings) —
 * there's no ALL CAPS/Proper Case distinction to check against in that mode. Returns the 0-based
 * row indices found. */
export function findChildlessHeadings(rows: TaxonomyRow[], properCaseOnly: boolean): number[] {
  if (properCaseOnly) return [];
  const result: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const level = levelOf(rows[i]);
    if (level === -1) continue;
    const text = rows[i].descriptions[level] ?? '';
    if (!isAllCaps(text)) continue;
    let hasChild = false;
    for (let j = i + 1; j < rows.length; j++) {
      const l = levelOf(rows[j]);
      if (l === -1) continue;
      hasChild = l > level;
      break;
    }
    if (!hasChild) result.push(i);
  }
  return result;
}

// Audit Taxonomy (James's ask, "Audit Taxonomy — Proposed Specification"): Lock Taxonomy no
// longer runs its own separate check (findLockIntegrityIssues, above this comment in earlier
// versions of this file, is gone — replaced entirely by this). One issue per distinct problem,
// each carrying exactly which row/cell it's about so the walkthrough (App.tsx) has somewhere
// concrete to jump to, in top-to-bottom row order (James: "systematic top to bottom is good").

export interface AuditIssue {
  rowId: string;
  /** Which column to jump to — the row's own deepest level for a description-side issue, or
   * the first offending column for a code-side issue. Meaningless for 'auto'. */
  level: number;
  /** What "Clear Error" does for this issue: focus a code or description cell for the user to
   * fix by hand, or — 'auto' — apply a whole-taxonomy fix immediately (padCodes for the
   * padding-symmetry check below). The grid itself refuses to let a code character be typed
   * into a column beyond a row's own level ("Enter Descriptions Before Entering Codes"), so a
   * padding gap genuinely can't be fixed by jumping to the cell and typing — padCodes (already
   * how Fill Codes/Pad Codes elsewhere in this app handle exactly this) is the only way. */
  kind: 'code' | 'desc' | 'auto';
  message: string;
}

/** A row's own code, checked across its "valid range" (column 0 through its own level) —
 * distinguishes a genuinely empty code (no columns filled at all) from an incomplete one (some
 * filled, some not) per James's ask, since the two read as different problems to a user fixing
 * them. Returns null when the row's code is already complete. */
function codeCompletion(row: TaxonomyRow, level: number): { firstBlank: number; isEmpty: boolean } | null {
  let filledCount = 0;
  let firstBlank = -1;
  for (let i = 0; i <= level; i++) {
    if (row.codes[i]) filledCount++;
    else if (firstBlank === -1) firstBlank = i;
  }
  if (firstBlank === -1) return null;
  return { firstBlank, isEmpty: filledCount === 0 };
}

/** James's ask: "the hierarchy of descriptions cascades down top left to bottom right, one
 * column increment at a time — if this progression is broken this must be fixed." A row's level
 * should never be more than one deeper than the nearest preceding row that's shallower than it
 * (its effective parent) — jumping straight from a level-1 heading to a level-4 entry, with
 * nothing at levels 2-3 for that branch, is exactly the kind of gap Lock is meant to catch.
 * Includes the taxonomy's very first entries starting below level 0 with nothing shallower
 * above them at all (parent level treated as -1 in that case). */
export function findHierarchySkips(rows: TaxonomyRow[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const level = levelOf(rows[i]);
    if (level <= 0) continue;
    const parentIdx = immediateParentIndex(rows, i);
    const parentLevel = parentIdx === -1 ? -1 : levelOf(rows[parentIdx]);
    if (level - parentLevel > 1) result.push(i);
  }
  return result;
}

/** James's ask: "the codes must have corresponding trailing periods, there must be perfect
 * symmetry" — Section 4.4's padding convention. Every code column beyond a row's own level
 * should carry the taxonomy's padding character, never be left genuinely blank (or, just as
 * wrong, carry a stray real code past where this row's own hierarchy actually reaches).
 * Returns the first offending column per row. */
export function findPaddingSymmetryIssues(
  rows: TaxonomyRow[],
  paddingChar: string,
): Array<{ rowIndex: number; level: number; column: number }> {
  const result: Array<{ rowIndex: number; level: number; column: number }> = [];
  for (let i = 0; i < rows.length; i++) {
    const level = levelOf(rows[i]);
    if (level === -1) continue;
    for (let col = level + 1; col < rows[i].codes.length; col++) {
      if ((rows[i].codes[col] ?? '') !== paddingChar) {
        result.push({ rowIndex: i, level, column: col });
        break;
      }
    }
  }
  return result;
}

/** The full Audit Taxonomy walkthrough's issue list — Tranche 1 of James's spec: the checks
 * Lock Taxonomy used to run (blank description, blank/incomplete code, ascending-order
 * violation, childless ALL CAPS heading), plus the two new structural checks above. Tranche 2
 * (the "Other" placement, oversized/undersized sibling groups, far-right outliers, description
 * length) is deliberately not here yet — a separate round, per James's own "two tranches"
 * agreement, since each of those carries its own assisted action (Split, Edit) rather than
 * just a jump-to-cell fix. */
export function findAuditIssues(
  rows: TaxonomyRow[],
  properCaseOnly: boolean,
  paddingChar: string,
): AuditIssue[] {
  const issues: AuditIssue[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const level = levelOf(row);
    if (level === -1) {
      issues.push({ rowId: row.id, level: 0, kind: 'desc', message: 'This row has no description yet.' });
      continue;
    }
    const completion = codeCompletion(row, level);
    if (completion) {
      issues.push({
        rowId: row.id,
        level: completion.firstBlank,
        kind: 'code',
        message: completion.isEmpty
          ? 'This row has a description but no code yet.'
          : 'This row has an incomplete code — not every column up to its own level is filled in.',
      });
    }
  }

  const childlessHeadings = findChildlessHeadings(rows, properCaseOnly);
  for (const i of childlessHeadings) {
    issues.push({
      rowId: rows[i].id,
      level: levelOf(rows[i]),
      kind: 'desc',
      message:
        'This heading is left in ALL CAPS (structural) but has no child entries underneath — either add its breakdown or change it to Proper Case if it\'s really a posting-level entry.',
    });
  }

  const hierarchySkips = findHierarchySkips(rows);
  for (const i of hierarchySkips) {
    issues.push({
      rowId: rows[i].id,
      level: levelOf(rows[i]),
      kind: 'desc',
      message:
        "This entry's level skips one or more columns deeper than its nearest heading above it — the hierarchy should cascade down one level at a time.",
    });
  }

  const paddingIssues = findPaddingSymmetryIssues(rows, paddingChar);
  for (const { rowIndex, column } of paddingIssues) {
    issues.push({
      rowId: rows[rowIndex].id,
      level: column,
      kind: 'auto',
      message: `This row's code isn't padded correctly — every column beyond its own level should carry "${paddingChar}", not be left blank. Fixed automatically — the grid doesn't allow typing a code past a row's own level by hand.`,
    });
  }

  const violation = findAscendingOrderViolation(rows);
  if (violation) {
    issues.push({
      rowId: rows[violation.rowIndex].id,
      level: violation.level,
      kind: 'code',
      message: `This code ("${violation.value}") is out of ascending order after row ${violation.prevRowIndex + 1} ("${violation.prevValue}") in this column.`,
    });
  }

  // Row order (James: "systematic top to bottom is good, as you propose") — re-sort by each
  // issue's row position now that every check above has been folded in, since they were
  // appended check-by-check rather than row-by-row.
  const indexOfRow = new Map(rows.map((r, i) => [r.id, i]));
  issues.sort((a, b) => (indexOfRow.get(a.rowId) ?? 0) - (indexOfRow.get(b.rowId) ?? 0));
  return issues;
}

export const CODE_CHARSET = [
  '.',
  ...'0123456789'.split(''),
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
];

export function isValidCodeChar(ch: string): boolean {
  return CODE_CHARSET.includes(ch);
}

export function validCodesInRange(upper: string | null, lower: string | null): string[] {
  return CODE_CHARSET.filter((c) => {
    if (upper !== null && c.charCodeAt(0) <= upper.charCodeAt(0)) return false;
    if (lower !== null && c.charCodeAt(0) >= lower.charCodeAt(0)) return false;
    return true;
  });
}

// Item 1: narrower, per-taxonomy restrictions on real code characters, on top of the fixed
// global charset above. Checked only for a genuinely new, non-padding character — the padding
// character itself always stays valid regardless of restriction (it marks "no further
// hierarchy here", not a code value).
export function isAllowedByCodeRestriction(ch: string, restriction: CodeRestriction): boolean {
  switch (restriction) {
    case 'Numeric Only':
      return /^[0-9]$/.test(ch);
    case 'Alpha Numeric with All Alpha':
      return /^[0-9A-Za-z]$/.test(ch);
    case 'Alpha Numeric with Upper Case Alpha Only':
      return /^[0-9A-Z]$/.test(ch);
    case 'Alpha Upper Case Only':
      return /^[A-Z]$/.test(ch);
    case 'Alpha Both Cases Only':
      return /^[A-Za-z]$/.test(ch);
  }
}

// Lock Taxonomy: while locked, a new row can only be inserted between two existing siblings
// if a real, usable code actually fits between their two values — otherwise inserting there
// would force recoding an existing (protected) neighbour, which is exactly what locking is
// meant to prevent. Uses the taxonomy's own active Code Restriction, so e.g. "1"/"2" has no
// gap, but "1"/"3" does (a "2" fits), and the same logic holds across the digit/letter
// boundary (e.g. "9"/"A" has no gap in the fixed charset, "9"/"B" does). The padding character
// itself is never a usable gap-filler — it isn't a real code.
export function hasCodeGap(upper: string, lower: string, restriction: CodeRestriction, paddingChar: string): boolean {
  return validCodesInRange(upper, lower).some((c) => c !== paddingChar && isAllowedByCodeRestriction(c, restriction));
}

/** Compresses a sorted list of single characters into "X" / "X-Y" runs for display. */
export function formatCharRanges(chars: string[]): string {
  if (chars.length === 0) return '(none)';
  const ranges: string[] = [];
  let start = chars[0];
  let prev = chars[0];
  for (let i = 1; i <= chars.length; i++) {
    const c = chars[i];
    if (c && c.charCodeAt(0) === prev.charCodeAt(0) + 1) {
      prev = c;
      continue;
    }
    ranges.push(start === prev ? start : `${start}-${prev}`);
    if (c) {
      start = c;
      prev = c;
    }
  }
  return ranges.join(', ');
}
