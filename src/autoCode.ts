// General-purpose "Auto Code" (James's ask): assigns real codes to an entire taxonomy that has
// none yet — deliberately independent of the Simple Taxonomy wizard's own mnemonic Suggest Codes
// (guidance.ts), which is letter-derived from each description and only ever runs inside that
// wizard. This is a plain numeric-first, gap-coded scheme available at any time, on any
// taxonomy — built for a taxonomy imported directly (e.g. via Import CSV) with no codes at all.
//
// James's rule, restated across three rounds of clarification: within any sibling group (rows
// sharing the same immediate parent — a fresh "start at 1" every group, never a running total
// down the whole column), spread codes evenly across 1-8, reserving "9" for a possible
// Other/Miscellaneous entry in the same group even when none is present yet — only once a group
// genuinely has 9 or more ordinary members does "9" (and, past that, letters) get used, since at
// that point it can't be avoided. "0" is never used. An actual Other/Miscellaneous sibling
// (Section 5, step 6's catch-all — see guidance.ts's isOtherOrMiscellaneousLabel) always sits at
// the very end of its own group's range, coded "9" whenever the rest of the group fits in 1-8
// (the next available slot past that if it doesn't), regardless of which row in the group it
// happens to be — this mirrors the wizard's own Suggest Codes precedent (an Other/Miscellaneous
// entry gets the last character its Code Restriction allows, not a mnemonic letter). The SAME
// rule applies at every level (his own correction — no separate, tighter rule for the deepest
// column). Once every row's own-level code is assigned, each ancestor's code is carried down
// through its descendants' blank ancestor columns, and every column deeper than a row's own
// level is padded — exactly the wizard's existing Fill Codes / Pad Codes steps, reused here
// rather than reimplemented, run automatically as part of the one action.

import type { CodeRestriction, TaxonomyRow } from './types';
import { fillCodesDown, isOtherOrMiscellaneousLabel, maxLevelUsed, padCodes } from './guidance';

// The dropdown James asked for names every code type up front so it doesn't need rebuilding
// later, even though only the first is actually implemented right now (IMPLEMENTED_AUTO_CODE_TYPES
// below) — selecting anything else surfaces a plain "not built yet" message instead of silently
// doing the wrong thing.
export const AUTO_CODE_TYPES = [
  'Alpha Numeric with Upper Case Alpha Only',
  'Numeric Only',
  'Alpha Numeric with All Alpha',
  'Alpha Upper Case Only',
  'Alpha Both Cases Only',
] as const;
export type AutoCodeType = (typeof AUTO_CODE_TYPES)[number];

export const IMPLEMENTED_AUTO_CODE_TYPES: readonly AutoCodeType[] = ['Alpha Numeric with Upper Case Alpha Only'];

function levelOf(row: TaxonomyRow): number {
  for (let i = row.descriptions.length - 1; i >= 0; i--) {
    if ((row.descriptions[i] ?? '').trim()) return i;
  }
  return -1;
}

function immediateParentIndex(rows: TaxonomyRow[], idx: number): number {
  const level = levelOf(rows[idx]);
  for (let i = idx - 1; i >= 0; i--) {
    const l = levelOf(rows[i]);
    if (l !== -1 && l < level) return i;
  }
  return -1;
}

// Rows whose OWN level is exactly `level`, grouped by immediate parent — the same row-structure
// grouping used elsewhere in this app (guidance.ts's mnemonic suggestion, Grid.tsx's rightmost-
// column checks) for exactly the same reason: ancestor codes are typically still blank at this
// point, so grouping by a parent's code value would be unreliable.
function groupSiblingIndices(rows: TaxonomyRow[], level: number): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  rows.forEach((row, idx) => {
    if (levelOf(row) !== level) return;
    const key = String(immediateParentIndex(rows, idx));
    const group = groups.get(key);
    if (group) group.push(idx);
    else groups.set(key, [idx]);
  });
  return groups;
}

// Digits 1-9 (0 excluded), then capital letters — the ordered set of single-character "slots"
// this scheme draws from, for both the everyday case (<=9 siblings) and the rare overflow case.
const CODE_SLOTS = '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Evenly spreads `count` ORDINARY (non-Other) siblings across the first 8 slots ("1".."8") using
// a genuine, constant step ("gap coding" — CLAUDE.md Section 4.4's "1, 3, 5..."), not a stretch
// that always reaches both ends of the range regardless of how few siblings there are — James's
// report: two entries came out "1" and "8" (the two extremes of the whole range) instead of
// leaving even, insertable room on both sides, e.g. "1" and "5". The step is
// `floor(8 / count)`, starting at slot 0 ("1") — for count = 2 that's a step of 4, giving "1"
// and "5"; for count = 8 (filling every ordinary slot) the step collapses to 1, giving
// consecutive "1".."8", since a real gap can no longer fit for all of them at once ("juggling
// the gap down" as the group actually needs it, not a fixed step regardless of count). "9"
// (index 8) is deliberately left out of this spread — reserved for a possible Other/
// Miscellaneous sibling in the same group, see assignLevelCodes below — which the maths above
// guarantees room for as long as count stays at 8 or fewer.
//
// Past 8 ordinary siblings — a rare case, well past the taxonomy's own 5-9 guidance — 8 slots
// can no longer hold them all, so the spread continues into the full alphanumeric pool instead,
// still reaching for a genuine gap rather than collapsing straight to bare consecutive digits
// and letters: it starts from a step of 2 and juggles that down by one at a time, only as far as
// actually needed, until every sibling lands on a distinct, in-range slot.
function spreadSlots(count: number, availableSlots = 8): string[] {
  if (count <= 0) return [];
  if (count === 1) return [CODE_SLOTS[0]];
  if (count <= availableSlots) {
    const gap = Math.max(1, Math.floor(availableSlots / count));
    return Array.from({ length: count }, (_, i) => CODE_SLOTS[i * gap]);
  }
  let gap = 2;
  while (gap > 1 && (count - 1) * gap + 1 >= CODE_SLOTS.length) gap--;
  return Array.from({ length: count }, (_, i) => CODE_SLOTS[i * gap]);
}

// James's ask: for Alpha and Alpha Numeric Code Restrictions, Auto Code's gap should be a fixed,
// user-configured step (1 or 2 — TaxonomySettings.autoCodeGapIncrement) rather than spreadSlots'
// adaptive floor(8 / count), which gives a different gap for almost every group size. A fixed
// step of 2 continues straight past "9" into letters exactly as CODE_SLOTS already orders them
// ("1, 3, 5, 7, 9, B, D, ..." — his own example), rather than collapsing to consecutive digits
// once a group's count would no longer fit a gap within 1-8. Numeric Only keeps spreadSlots'
// adaptive rule instead (isFixedGapRestriction, below) — with only nine digits available there's
// no room for a fixed step to still cover a typical group.
function spreadSlotsFixed(count: number, gapIncrement: number): string[] {
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, i) => CODE_SLOTS[i * gapIncrement]);
}

function isFixedGapRestriction(codeRestriction: CodeRestriction): boolean {
  return codeRestriction !== 'Numeric Only';
}

// Assigns codes to every row whose own code at `level` is still blank, one sibling group at a
// time. Two genuinely different situations share this one entry point:
//
// - Greenfield — nothing in the group has a real code yet (Auto Code's own primary case: a
//   taxonomy imported or built with no codes at all). Spreads every ordinary sibling evenly
//   across 1-8 ("gap coding" — CLAUDE.md Section 4.4's "1, 3, 5..."), reserving "9" for a
//   possible Other/Miscellaneous entry even when none is present yet — see the block below for
//   the full rule, including when that reservation doesn't apply.
// - Patch — the group already has at least one real code in it ("Fill Missing Codes"'s own
//   stated everyday case: "a manual entry, Insert Row, Promote or Demote has left a FEW rows'
//   own-level code blank, mid-taxonomy, while the REST of the column is already coded"). The
//   greenfield spread above is computed purely from each blank's POSITION and the group's total
//   COUNT, with no regard for what a nearby row already holds — James's real file turned up
//   exactly the resulting bug: a row he'd just coded "4" handed its newly-inserted, still-blank
//   followers values with no relation to it, sometimes even LOWER than "4", an outright
//   ascending-order violation. fillOrderedGaps (below) instead walks the group in row order and
//   fills each run of consecutive blanks as a plain continuation directly after the nearest
//   coded row above it, never past a following coded row without room to fit — see its own
//   comment for the full rule. No Other/Miscellaneous reservation in this branch: once any real
//   code exists in the group, an Other/Miscellaneous row already has (or will get, in its own
//   row-order turn) a real value like any other, so no special-casing is needed.
//
// Factored out of assignLevelCodes so the Audit walkthrough (fillRestOfGroup, below) can run
// this same rule against just ONE sibling group, not sweep the whole column, when the user has
// only just typed a code for one row in it.
function assignGroupCodes(
  rows: TaxonomyRow[],
  indices: number[],
  level: number,
  codeRestriction: CodeRestriction,
  gapIncrement: number,
): TaxonomyRow[] {
  if (indices.some((i) => rows[i].codes[level])) return fillOrderedGaps(rows, indices, level);

  // Greenfield spread — see the block comment above. A row that already holds a real code can
  // never reach here (the check above routes any such group to fillOrderedGaps instead), but
  // `used`/the per-row `if (row.codes[level]) continue;` guards are kept exactly as they were so
  // this branch's own logic doesn't need to assume that.
  const result = [...rows];
  const otherIndices = indices.filter((i) => isOtherOrMiscellaneousLabel(result[i].descriptions[level] ?? ''));
  const otherIndexSet = new Set(otherIndices);
  const ordinaryIndices = indices.filter((i) => !otherIndexSet.has(i));
  const used = new Set(indices.map((i) => result[i].codes[level]).filter((c) => c));
  const useFixedGap = isFixedGapRestriction(codeRestriction);

  const otherTrails =
    ordinaryIndices.length === 0 || otherIndices.every((oi) => oi > ordinaryIndices[ordinaryIndices.length - 1]);

  if (!otherTrails) {
    // Fallback: every sibling, in row order, sharing one spread — no reserved slot, since a
    // reservation only makes sense when nothing ordinary follows it.
    const slots = useFixedGap ? spreadSlotsFixed(indices.length, gapIncrement) : spreadSlots(indices.length);
    let slotPos = 0;
    for (const idx of indices) {
      const row = result[idx];
      if (row.codes[level]) continue;
      while (slotPos < slots.length && used.has(slots[slotPos])) slotPos++;
      const code = slots[slotPos];
      if (!code) continue;
      used.add(code);
      slotPos++;
      result[idx] = { ...row, codes: row.codes.map((c, i) => (i === level ? code : c)) };
    }
    return result;
  }

  const slots = useFixedGap ? spreadSlotsFixed(ordinaryIndices.length, gapIncrement) : spreadSlots(ordinaryIndices.length);
  let slotPos = 0;
  for (const idx of ordinaryIndices) {
    const row = result[idx];
    if (row.codes[level]) continue;
    while (slotPos < slots.length && used.has(slots[slotPos])) slotPos++;
    const code = slots[slotPos];
    if (!code) continue;
    used.add(code);
    slotPos++;
    result[idx] = { ...row, codes: row.codes.map((c, i) => (i === level ? code : c)) };
  }

  // "9" (index 8) whenever the ordinary siblings fit within 1-8; otherwise the next slot past
  // however far they actually reached — found from the spread's own last slot rather than
  // assumed from `ordinaryIndices.length`, since a gap greater than 1 (the overflow case,
  // count > 8) can reach a higher index than the sibling count alone would suggest.
  const highestOrdinarySlotIndex = slots.length > 0 ? CODE_SLOTS.indexOf(slots[slots.length - 1]) : -1;
  let otherSlotIndex = Math.max(8, highestOrdinarySlotIndex + 1);
  for (const idx of otherIndices) {
    const row = result[idx];
    if (row.codes[level]) continue;
    while (otherSlotIndex < CODE_SLOTS.length && used.has(CODE_SLOTS[otherSlotIndex])) otherSlotIndex++;
    const code = CODE_SLOTS[otherSlotIndex];
    if (!code) continue;
    used.add(code);
    otherSlotIndex++;
    result[idx] = { ...row, codes: row.codes.map((c, i) => (i === level ? code : c)) };
  }
  return result;
}

// One call to assignGroupCodes (above — greenfield spread or order-respecting patch, whichever
// this group actually needs) per sibling group in the column.
function assignLevelCodes(
  rows: TaxonomyRow[],
  level: number,
  codeRestriction: CodeRestriction,
  gapIncrement: number,
): TaxonomyRow[] {
  const groups = groupSiblingIndices(rows, level);
  let result = rows;
  for (const indices of groups.values()) {
    result = assignGroupCodes(result, indices, level, codeRestriction, gapIncrement);
  }
  return result;
}

/** The only implemented Auto Code scheme so far — see the file-level comment for the full rule.
 * Only ever fills genuinely blank codes; a taxonomy with some codes already entered keeps them
 * exactly as they are. `gapIncrement` (1 or 2) only applies when `codeRestriction` isn't
 * "Numeric Only" — see isFixedGapRestriction. */
export function autoCodeAlphaNumeric(
  rows: TaxonomyRow[],
  paddingChar: string,
  codeRestriction: CodeRestriction,
  gapIncrement: number,
): TaxonomyRow[] {
  const maxLevel = maxLevelUsed(rows);
  let result = rows;
  for (let level = 0; level <= maxLevel; level++) {
    result = assignLevelCodes(result, level, codeRestriction, gapIncrement);
  }
  result = fillCodesDown(result);
  result = padCodes(result, paddingChar);
  return result;
}

/** James's ask: a right-click "Fill Missing Codes" on a single code column, for the everyday
 * case Auto Code (above) was really built for but is awkward to reach for — a manual entry,
 * Insert Row, Promote or Demote has left a few rows' own-level code blank, mid-taxonomy, while
 * the rest of the column is already coded. Same three-step pipeline as Auto Code, just scoped
 * to the one column that was actually right-clicked rather than sweeping every level: generate
 * a gap-coded sequence for this column's blank cells only (assignLevelCodes already fills
 * around whatever codes already exist in each sibling group, not just at the group's own end),
 * then carry ancestor codes down and pad the trailing columns for the whole taxonomy — both of
 * those are already safe/idempotent, touching only genuinely blank cells, so running them
 * unscoped here doesn't risk anything outside the column that was actually asked for. */
export function fillMissingCodesAtLevel(
  rows: TaxonomyRow[],
  level: number,
  paddingChar: string,
  codeRestriction: CodeRestriction,
  gapIncrement: number,
): TaxonomyRow[] {
  let result = assignLevelCodes(rows, level, codeRestriction, gapIncrement);
  result = fillCodesDown(result);
  result = padCodes(result, paddingChar);
  return result;
}

function replaceCode(rows: TaxonomyRow[], idx: number, level: number, code: string): TaxonomyRow[] {
  const row = rows[idx];
  const next = [...rows];
  next[idx] = { ...row, codes: row.codes.map((c, i) => (i === level ? code : c)) };
  return next;
}

/** assignGroupCodes' "patch" branch (see its own comment for when this runs instead of the
 * greenfield spread): walks the group in row order and fills each run of consecutive blanks with
 * a plain, consecutive continuation directly after the nearest coded row above it (James's own
 * example: a row just coded "4" should hand its blank followers "5", "6", "7") — never
 * independently of what's already there, and never past a following already-coded row: a run
 * with a real code both before AND after it only gets filled if there's actually room for one
 * character per blank between them (two already-adjacent codes like "4"/"5" leave none at all,
 * and forcing something in there would just as surely break ascending order the other way) —
 * left untouched otherwise, falling back to the ordinary one-row-at-a-time Audit walkthrough (or,
 * for "Fill Missing Codes", to being coded by hand) for it. */
function fillOrderedGaps(rows: TaxonomyRow[], indices: number[], level: number): TaxonomyRow[] {
  let result = rows;
  let floorSlot = -1;
  let i = 0;
  while (i < indices.length) {
    const existing = result[indices[i]].codes[level];
    if (existing) {
      const slot = CODE_SLOTS.indexOf(existing);
      if (slot > floorSlot) floorSlot = slot;
      i++;
      continue;
    }
    let j = i;
    while (j < indices.length && !result[indices[j]].codes[level]) j++;
    const runLength = j - i;
    const hasCeiling = j < indices.length;
    const ceilingSlot = hasCeiling ? CODE_SLOTS.indexOf(result[indices[j]].codes[level]) : CODE_SLOTS.length;
    const room = ceilingSlot - floorSlot - 1;
    if (room >= runLength) {
      for (let k = 0; k < runLength; k++) {
        const slot = floorSlot + 1 + k;
        result = replaceCode(result, indices[i + k], level, CODE_SLOTS[slot]);
      }
      floorSlot += runLength;
    }
    // else: not enough room for even one character per blank between the two real codes on
    // either side — leave this run exactly as it is.
    i = j;
  }
  return result;
}

/** James's ask, straight out of the Audit walkthrough on his real Function_Master file: a whole
 * run of siblings (a "series") with no code at all yet at this level — Audit can only ever flag
 * one row at a time, so fixing the row it happens to be pointing at still left every other
 * member of that exact group to its own separate trip through the walkthrough. The one value
 * just typed for THIS row is enough to code the rest of its own immediate sibling group right
 * away — assignGroupCodes always takes its "patch" branch here (the row just typed into
 * guarantees the group has at least one real code in it), scoped to only THIS row's group, since
 * a value entered for one row says nothing about an unrelated group elsewhere in the same
 * column. Returns `rows` unchanged (same reference) when nothing else in the group is blank, OR
 * when every blank run turned out to have no room to fill safely, so a caller can cheaply tell
 * "nothing to re-render" from "group filled" by reference equality. */
export function fillRestOfGroup(
  rows: TaxonomyRow[],
  rowId: string,
  level: number,
  paddingChar: string,
  codeRestriction: CodeRestriction,
  gapIncrement: number,
): TaxonomyRow[] {
  const rowIndex = rows.findIndex((r) => r.id === rowId);
  if (rowIndex === -1) return rows;
  const groups = groupSiblingIndices(rows, level);
  const indices = [...groups.values()].find((g) => g.includes(rowIndex));
  if (!indices || !indices.some((i) => i !== rowIndex && !rows[i].codes[level])) return rows;
  const filled = assignGroupCodes(rows, indices, level, codeRestriction, gapIncrement);
  if (filled === rows) return rows;
  let result = fillCodesDown(filled);
  result = padCodes(result, paddingChar);
  return result;
}
