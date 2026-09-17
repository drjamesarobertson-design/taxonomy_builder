// Code character rules, per CLAUDE.md Section 4.4 / 6.7 (hard rule): within any column,
// codes must sort in ascending ASCII order top to bottom. Only '.', 0-9, a-z, A-Z are valid.

import type { CodeRestriction, TaxonomyRow } from './types';

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

// Lock Taxonomy integrity check (James's ask — locking with no codes at all, or an incomplete
// structure, defeats the whole point of Lock: guaranteeing long-term integrity for data an ERP
// may already be posting against). Three checks, each returning a plain description of what it
// found so the caller can list every problem at once rather than making the user fix one,
// re-click Lock, and discover the next.

/** Rows with no description at any level — a genuinely empty placeholder row, most often left
 * over from an Insert Row that was never followed through on. */
export function findEmptyRows(rows: TaxonomyRow[]): number[] {
  return rows.map((row, i) => (levelOf(row) === -1 ? i : -1)).filter((i) => i !== -1);
}

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

/** Everything Lock Taxonomy should refuse to proceed past — plain-English, one entry per
 * distinct problem found, so a single click surfaces the whole list rather than one at a time. */
export function findLockIntegrityIssues(rows: TaxonomyRow[]): string[] {
  const issues: string[] = [];
  if (rows.length === 0) {
    issues.push('This taxonomy has no rows yet.');
    return issues;
  }
  const emptyRows = findEmptyRows(rows);
  if (emptyRows.length > 0) {
    issues.push(
      `Row${emptyRows.length === 1 ? '' : 's'} ${emptyRows.map((i) => i + 1).join(', ')} ${
        emptyRows.length === 1 ? 'has' : 'have'
      } no description yet.`,
    );
  }
  if (hasBlankCodeGaps(rows)) {
    issues.push('One or more rows have a description but are missing a code.');
  }
  const violation = findAscendingOrderViolation(rows);
  if (violation) {
    issues.push(
      `Row ${violation.rowIndex + 1} ("${violation.value}") is out of ascending order after row ${
        violation.prevRowIndex + 1
      } ("${violation.prevValue}") in column ${violation.level + 1}.`,
    );
  }
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
