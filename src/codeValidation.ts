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
 * their own numbering) must strictly ascend — an exact duplicate is just as much a violation of
 * "strictly ascend" as a genuine decrease, and James's own real files have turned up real
 * examples (two headings both coded the same value under one parent) that a `value < prev.value`
 * check alone silently let straight through. `paddingChar` values are exempt entirely — many
 * siblings legitimately share the same padding in a trailing column, which is correct, not a
 * duplicate. Returns the first violation found, or null. */
export function findAscendingOrderViolation(
  rows: TaxonomyRow[],
  paddingChar: string,
): { rowIndex: number; level: number; value: string; prevRowIndex: number; prevValue: string } | null {
  const numLevels = rows.reduce((max, row) => Math.max(max, row.codes.length), 0);
  for (let level = 0; level < numLevels; level++) {
    const lastByParent = new Map<number | null, { value: string; rowIndex: number }>();
    for (let i = 0; i < rows.length; i++) {
      if (levelOf(rows[i]) !== level) continue;
      const parent = level > 0 ? immediateParentIndex(rows, i) : null;
      const value = rows[i].codes[level] ?? '';
      if (!value || value === paddingChar) continue;
      const prev = lastByParent.get(parent);
      if (prev && value <= prev.value) {
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
  /** What the panel's primary action button does for this issue:
   * - 'code' / 'desc' — focus that cell for the user to fix by hand ("Clear Error").
   * - 'auto' — apply a whole-taxonomy fix immediately (padTrailingCodes for padding-symmetry) —
   *   the grid refuses to let a code character be typed into a column beyond a row's own level
   *   ("Enter Descriptions Before Entering Codes"), so this genuinely can't be fixed by jumping
   *   to a cell and typing. Still highlights the row's own description cell (App.tsx's
   *   jumpToAuditIssue re-derives its actual level, since this issue's own `level` is the first
   *   offending trailing column, not the row's level) so there's at least a visible "this is the
   *   row" — James's report: with no highlight at all here, there was no way to tell which row a
   *   padding message was even about.
   * - 'toggleCase' — a childless ALL CAPS heading almost always just needs Toggle Case (it's a
   *   leaf, not a heading someone forgot to build out) — James's report: repeatedly clicking
   *   Resume Audit without first doing this by hand (right-click -> Toggle Case) understandably
   *   read as "the fix isn't registering", when nothing had actually changed yet. One button
   *   ("Fix and Resume Audit") does both. Still a cell to jump to/highlight, same as 'auto' now —
   *   the fix itself just doesn't require manual typing.
   * - 'otherNotLast' / 'oversized' / 'outlier' — Tranche 2's soft, override-able checks (Section
   *   6.7: "inform, never block"). Each jumps to the relevant cell like 'desc' does, but its
   *   resolution is "Accept" (dismiss this specific warning for the rest of this audit run,
   *   without requiring an actual fix) rather than a mandatory "Clear Error" — 'oversized' and
   *   'outlier' additionally offer an assisted "Split"/"Edit" action that's really just the same
   *   jump-and-let-the-user-decide as 'desc', per James's own confirmation ("just jump to that
   *   area, like Clear Error"). Unlike the hard kinds above, Skip has no role here — the choice
   *   is between acting on it (jump, then judge for yourself) and Accepting it outright. */
  kind: 'code' | 'desc' | 'auto' | 'toggleCase' | 'otherNotLast' | 'oversized' | 'outlier';
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

/** Groups row indices by immediate sibling set — same level, same immediate parent — in row
 * order. Feeds the three Tranche 2 checks below, which all reason about "this entry's place
 * among its siblings" rather than about the row in isolation. */
function siblingGroups(rows: TaxonomyRow[]): number[][] {
  const groups = new Map<string, number[]>();
  for (let i = 0; i < rows.length; i++) {
    const level = levelOf(rows[i]);
    if (level === -1) continue;
    const key = `${level}:${immediateParentIndex(rows, i)}`;
    const g = groups.get(key);
    if (g) g.push(i);
    else groups.set(key, [i]);
  }
  return [...groups.values()];
}

/** Section 5, step 6: "the last entry at that level should be 'Other [category name]'" — the
 * open-ended catch-all belongs at the end of its group, sequenced after everything it might
 * otherwise be mistaken to duplicate. Flags any sibling whose description starts with the word
 * "Other" but isn't the last member of its own group. Soft warning (James: "give a warning if
 * Other is NOT at the end of a series") — no assisted action, just Accept once seen. */
export function findOtherNotLastIssues(rows: TaxonomyRow[]): number[] {
  const result: number[] = [];
  for (const group of siblingGroups(rows)) {
    if (group.length < 2) continue;
    const lastIdx = group[group.length - 1];
    for (const i of group) {
      if (i === lastIdx) continue;
      const level = levelOf(rows[i]);
      const text = (rows[i].descriptions[level] ?? '').trim();
      if (/^other\b/i.test(text)) result.push(i);
    }
  }
  return result;
}

/** Section 3: "between five and nine sub-items" at every level. Lock/the item-count warning
 * already flag this as entries are typed (GuidanceBanner); this is the same rule re-checked at
 * Audit time, group by group, for anything that slipped through — e.g. imported wholesale via
 * Import CSV, where nothing was ever typed one row at a time to trigger the live warning. James:
 * "give a warning if more than nine in a series" — attaches to the first row of the oversized
 * group, since that's the natural place to jump to before deciding how to split it. */
export function findOversizedGroups(rows: TaxonomyRow[]): Array<{ rowIndex: number; count: number }> {
  const result: Array<{ rowIndex: number; count: number }> = [];
  for (const group of siblingGroups(rows)) {
    if (group.length > 9) result.push({ rowIndex: group[0], count: group.length });
  }
  return result;
}

/** James: "give a warning if a series is one or more columns right of all the rest of the
 * list" — one branch of the taxonomy reaching noticeably deeper than every other branch, so its
 * codes end up longer than they need to be relative to the rest of the table. Compares each
 * top-level (level 0) branch's own deepest reach against every other branch's; flags the branch
 * only when it is the SINGLE deepest one with a clear margin over the next deepest — a level
 * shared by two or more branches isn't "far right of all the rest," it's just how deep this
 * taxonomy generally goes. Attaches to the deepest row actually found in that branch, the
 * concrete cell "Edit" jumps to. Returns at most one result (the most extreme branch) — a first
 * pass at this check; only meaningful with at least two top-level branches to compare. */
export function findFarRightOutlierBranch(
  rows: TaxonomyRow[],
): { deepestRowIndex: number; depth: number } | null {
  const branchStarts: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (levelOf(rows[i]) === 0) branchStarts.push(i);
  }
  if (branchStarts.length < 2) return null;

  const branches = branchStarts.map((start, idx) => {
    const end = idx + 1 < branchStarts.length ? branchStarts[idx + 1] : rows.length;
    let depth = 0;
    let deepestRowIndex = start;
    for (let i = start; i < end; i++) {
      const level = levelOf(rows[i]);
      if (level > depth) {
        depth = level;
        deepestRowIndex = i;
      }
    }
    return { depth, deepestRowIndex };
  });

  let maxIdx = 0;
  for (let i = 1; i < branches.length; i++) {
    if (branches[i].depth > branches[maxIdx].depth) maxIdx = i;
  }
  const secondDepth = Math.max(...branches.filter((_, i) => i !== maxIdx).map((b) => b.depth));
  if (branches[maxIdx].depth > secondDepth) {
    return { deepestRowIndex: branches[maxIdx].deepestRowIndex, depth: branches[maxIdx].depth };
  }
  return null;
}

/** The full Audit Taxonomy walkthrough's issue list — Tranche 1 of James's spec (blank
 * description, blank/incomplete code, ascending-order violation, childless ALL CAPS heading,
 * hierarchy skip, padding symmetry) plus Tranche 2's three soft, assisted-action checks above
 * ("Other" placement, oversized sibling groups, far-right outlier branches). */
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
      kind: 'toggleCase',
      message:
        'This ALL CAPS heading has no children — usually a posting-level entry left in the wrong case. "Fix and Resume Audit" switches it to Proper Case, or Skip to add its breakdown instead.',
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

  const violation = findAscendingOrderViolation(rows, paddingChar);
  if (violation) {
    issues.push({
      rowId: rows[violation.rowIndex].id,
      level: violation.level,
      kind: 'code',
      message:
        violation.value === violation.prevValue
          ? `This code ("${violation.value}") duplicates row ${violation.prevRowIndex + 1}'s code in this column — codes must be unique among siblings.`
          : `This code ("${violation.value}") is out of ascending order after row ${violation.prevRowIndex + 1} ("${violation.prevValue}") in this column.`,
    });
  }

  const otherNotLast = findOtherNotLastIssues(rows);
  for (const i of otherNotLast) {
    issues.push({
      rowId: rows[i].id,
      level: levelOf(rows[i]),
      kind: 'otherNotLast',
      message:
        'This "Other" entry isn\'t the last one in its group. By convention it belongs at the end, as the open-ended catch-all for whatever the rest of the group doesn\'t already cover.',
    });
  }

  const oversizedGroups = findOversizedGroups(rows);
  for (const { rowIndex, count } of oversizedGroups) {
    issues.push({
      rowId: rows[rowIndex].id,
      level: levelOf(rows[rowIndex]),
      kind: 'oversized',
      message: `This group has ${count} entries — more than the recommended five to nine. Consider splitting it into two or more sub-categories.`,
    });
  }

  const outlierBranch = findFarRightOutlierBranch(rows);
  if (outlierBranch) {
    issues.push({
      rowId: rows[outlierBranch.deepestRowIndex].id,
      level: outlierBranch.depth,
      kind: 'outlier',
      message:
        'This branch runs one or more columns deeper than every other branch in the taxonomy. Explore whether it can be restructured to shorten its codes by a column or two.',
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
