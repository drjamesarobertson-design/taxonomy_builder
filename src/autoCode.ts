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

import type { TaxonomyRow } from './types';
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

// Assigns gap-spaced codes to every row whose own code at `level` is still blank, one sibling
// group at a time. A row that already holds a real code (typed in manually before Auto Code was
// run) is left untouched, and its value is excluded from the slots handed to its still-blank
// siblings so nothing collides with it. Any Other/Miscellaneous sibling in the group is coded
// separately from — and after — its ordinary siblings, always landing on the last slot the
// group actually needs ("9" whenever the rest fits in 1-8), regardless of where in the group
// that row happens to sit.
function assignLevelCodes(rows: TaxonomyRow[], level: number): TaxonomyRow[] {
  const groups = groupSiblingIndices(rows, level);
  const result = [...rows];
  for (const indices of groups.values()) {
    const otherIndices = indices.filter((i) => isOtherOrMiscellaneousLabel(result[i].descriptions[level] ?? ''));
    const otherIndexSet = new Set(otherIndices);
    const ordinaryIndices = indices.filter((i) => !otherIndexSet.has(i));
    const used = new Set(indices.map((i) => result[i].codes[level]).filter((c) => c));

    const slots = spreadSlots(ordinaryIndices.length);
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
  }
  return result;
}

/** The only implemented Auto Code scheme so far — see the file-level comment for the full rule.
 * Only ever fills genuinely blank codes; a taxonomy with some codes already entered keeps them
 * exactly as they are. */
export function autoCodeAlphaNumeric(rows: TaxonomyRow[], paddingChar: string): TaxonomyRow[] {
  const maxLevel = maxLevelUsed(rows);
  let result = rows;
  for (let level = 0; level <= maxLevel; level++) {
    result = assignLevelCodes(result, level);
  }
  result = fillCodesDown(result);
  result = padCodes(result, paddingChar);
  return result;
}
