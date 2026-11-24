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

// The dropdown James originally asked for named every code type up front so it wouldn't need
// rebuilding later, even though only the first was actually implemented at the time
// (IMPLEMENTED_AUTO_CODE_TYPES below) — selecting anything else surfaced a plain "not built yet"
// message instead of silently doing the wrong thing. The restriction-aware character-pool work
// since (codePoolFor, this file) now makes every one of these produce correct codes, so all five
// are enabled — nothing left here to build before unlocking them.
export const AUTO_CODE_TYPES = [
  'Alpha Numeric with Upper Case Alpha Only',
  'Numeric Only',
  'Alpha Numeric with All Alpha',
  'Alpha Upper Case Only',
  'Alpha Both Cases Only',
] as const;
export type AutoCodeType = (typeof AUTO_CODE_TYPES)[number];

export const IMPLEMENTED_AUTO_CODE_TYPES: readonly AutoCodeType[] = AUTO_CODE_TYPES;

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

// James's report (2026-11-23): Fill Missing Codes under "Alpha Upper Case Only" (and the other
// alpha-exclusive restrictions) still handed out digits — "1", "3", "5" — even though
// isAllowedByCodeRestriction (codeValidation.ts) has never allowed a digit under those
// restrictions. Root cause: every gap-coded fill in this file always drew straight from
// CODE_SLOTS, the one fixed digits-then-uppercase pool, with no regard for the taxonomy's own
// Code Restriction setting. This builds the actual pool of characters a fill is allowed to use,
// so the restriction is respected by construction rather than relying on a later validation pass
// to catch what should never have been offered in the first place.
//
// Lower-case letters ("Alpha Numeric with All Alpha" and "Alpha Both Cases Only" both allow them
// on top of what's listed here) are deliberately left out of auto-generation for now — typing one
// by hand still works, this only governs what the Fill Missing Codes / Auto Code engines
// themselves hand out — pending the separate upper/lower-case design question James raised
// alongside this fix.
function codePoolFor(codeRestriction: CodeRestriction): string[] {
  const digits = CODE_SLOTS.slice(0, 9);
  const upper = CODE_SLOTS.slice(9);
  switch (codeRestriction) {
    case 'Numeric Only':
      return digits;
    case 'Alpha Upper Case Only':
    case 'Alpha Both Cases Only':
      return upper;
    case 'Alpha Numeric with Upper Case Alpha Only':
    case 'Alpha Numeric with All Alpha':
      return CODE_SLOTS;
  }
}

// James's ask (2026-11-23), confirmed after flagging the conflict with the original rule this
// replaced (below): Numeric Only's own adaptive spread should always stretch to use the FULL
// range actually available to it, landing the first ordinary sibling on slot 0 and the last on
// `ceilingIndex` whenever there are 2 or more — his own example, 7 ordinary siblings with 9
// digits available, should land on "1" and "9" with two gaps distributed somewhere in between,
// not collapse to plain consecutive "1".."7" and leave "8"/"9" completely unused just because a
// constant step rounds down to 1. Evenly distributes `count` items across slot indices
// [0, ceilingIndex] — the classic "N points spaced across a line" rounding — so leftover capacity
// becomes gaps between siblings instead of unused slots at the tail. The caller works out
// `ceilingIndex` (assignGroupCodes, below): the small in-range ceiling (8 or 9 digits, depending
// on whether a trailing Other/Miscellaneous needs its own reserved slot past it) when the group
// fits there, or the full alphanumeric pool's own last index otherwise — in that overflow case,
// stretching all the way to the pool's own end is also what lets a trailing Other/Miscellaneous
// land on "Z" rather than merely "whatever came after wherever the ordinary spread happened to
// reach", since the ordinary spread now always reaches exactly one slot short of it by construction.
//
// Retired rule this replaces: a genuine constant step (`floor(availableSlots / count)`), chosen
// specifically so two siblings landed on "1" and "5" rather than stretching to "1" and "8" — the
// two extremes of the whole range, with no room left on either side. Revisited and reversed once
// James saw the new rule's own consequence (a plain run of "1".."7" with two slots never used at
// all) and preferred the full-range spread instead, even for a small group.
function spreadSlots(count: number, ceilingIndex: number): string[] {
  if (count <= 0) return [];
  if (count === 1) return [CODE_SLOTS[0]];
  return Array.from({ length: count }, (_, i) => CODE_SLOTS[Math.round((i * ceilingIndex) / (count - 1))]);
}

// The ceiling index spreadSlots should stretch ordinary siblings across: the small in-range
// ceiling (digits 1-8 or 1-9, depending on whether a trailing Other/Miscellaneous needs its own
// reserved slot just past it) when `count` fits there, or the full pool's own last index
// otherwise (again leaving the pool's actual last slot free for Other when one exists) — see
// spreadSlots' own comment for why stretching all the way to that ceiling is what lets a trailing
// Other/Miscellaneous land on "Z" in the overflow case, not just "wherever ordinary happened to
// reach".
function numericCeilingIndex(count: number, hasOther: boolean): number {
  const smallCapacity = hasOther ? 8 : 9;
  return count <= smallCapacity ? smallCapacity - 1 : CODE_SLOTS.length - (hasOther ? 2 : 1);
}

// James's ask: for Alpha and Alpha Numeric Code Restrictions, Auto Code's gap should be a fixed,
// user-configured step (1 or 2 — TaxonomySettings.autoCodeGapIncrement) rather than spreadSlots'
// adaptive floor(8 / count), which gives a different gap for almost every group size. A fixed
// step of 2 continues straight past "9" into letters exactly as CODE_SLOTS already orders them
// ("1, 3, 5, 7, 9, B, D, ..." — his own example), rather than collapsing to consecutive digits
// once a group's count would no longer fit a gap within 1-8. Numeric Only keeps spreadSlots'
// adaptive rule instead (isFixedGapRestriction, below) — with only nine digits available there's
// no room for a fixed step to still cover a typical group.
// James's ask (2026-11-23): Auto Code should keep its configured default gap, but limit it
// automatically whenever the full gap genuinely wouldn't fit the slot pool (CODE_SLOTS, 36
// characters) for a given group's size — rather than silently running off the end of CODE_SLOTS
// and handing later siblings no code at all (`undefined`), which is what a plain `i * gapIncrement`
// index does once (count - 1) * gapIncrement reaches 36. Clamps to the largest step that still
// lets every sibling land on a real slot; never below 1 (sequential always fits).
function maxFixedGapFor(count: number, pool: string[]): number {
  if (count <= 1) return Number.MAX_SAFE_INTEGER;
  return Math.max(1, Math.floor((pool.length - 1) / (count - 1)));
}

function spreadSlotsFixed(count: number, gapIncrement: number, pool: string[]): string[] {
  if (count <= 0) return [];
  const gap = Math.min(gapIncrement, maxFixedGapFor(count, pool));
  return Array.from({ length: count }, (_, i) => pool[i * gap]);
}

function isFixedGapRestriction(codeRestriction: CodeRestriction): boolean {
  return codeRestriction !== 'Numeric Only';
}

// The largest step a single blank run can take without reaching its ceiling neighbour — shared
// between practicalGapOptions' dry run (below) and fillOrderedGaps' real one, so the two can never
// disagree about what "fits". `room` is however many free slots sit strictly between the floor and
// ceiling; a run only reaches here once `room >= runLength` is already known true (plain sequential
// fits), so this is always >= 1.
function maxGapForRun(room: number, runLength: number): number {
  return Math.max(1, Math.floor(room / runLength));
}

// James's ask (2026-11-23): "Fill Missing Codes" should offer an interactive choice of gap —
// Sequential, Skip 1, Skip 2, … — filtered to only the steps that will actually fit, before
// filling a column. Originally scoped to "greenfield" sibling groups only (assignGroupCodes,
// above — nothing coded yet); James's own follow-up test showed a "patch" group (fillOrderedGaps
// — some codes already exist, e.g. filling blanks between an existing "B" and "Z") can have just
// as much real room for a gap, and reading it as "fills sequential, does not offer to gap code"
// was a fair reading of what shipped first. Both kinds of group are considered now: a lone
// greenfield member, or a blank run only one slot wide, never has a real choice regardless (any
// gap gives the same single result), so those still don't count towards there being something to
// ask about. A level can hold several sibling groups at once (one per parent); since
// fillMissingCodesAtLevel applies one chosen gap to the whole column in one pass, the practical
// ceiling is the SMALLEST of every affected group's/run's own fit — a gap that doesn't fit even
// one of them would break it — also capped at 9 ("Skip 8") purely to keep the list a sane length;
// real taxonomy groups are far smaller than the slot pool allows.
// Numeric Only never gets this prompt (isFixedGapRestriction) — see spreadSlotsFixed's own
// sibling, spreadSlots, which already has its own adaptive rule for that restriction alone.
// Returns [] when the prompt isn't warranted at all (call site should just fill directly, same as
// before this existed); any array of length < 2 should be treated as "no real choice", too.
interface GapFitState {
  maxGap: number;
  anyGapChoiceRelevant: boolean;
}

// The actual per-level scan, factored out so the column-scoped Fill Missing Codes prompt
// (practicalGapOptions) and the whole-taxonomy Auto Code prompt (practicalGapOptionsForAutoCode,
// below) can never disagree about what counts as a real choice at one level — the only difference
// between them is how many levels get folded into one `state`.
function scanLevelForGapFit(rows: TaxonomyRow[], level: number, pool: string[], state: GapFitState): void {
  const groups = groupSiblingIndices(rows, level);
  for (const indices of groups.values()) {
    if (!indices.some((i) => rows[i].codes[level])) {
      // Greenfield.
      if (indices.length < 2) continue;
      state.anyGapChoiceRelevant = true;
      state.maxGap = Math.min(state.maxGap, maxFixedGapFor(indices.length, pool));
      continue;
    }
    // Patch — a dry run of fillOrderedGaps' own walk (no mutation), just to find each blank run's
    // room against its real neighbours. Advances floorSlot by each run's OWN best fit, which can
    // differ slightly from the single gap the column ends up using once every run shares it — an
    // acceptable approximation for an advisory list, since fillOrderedGaps itself re-derives and
    // self-clamps the real fit per run regardless of what this suggested here.
    let floorSlot = -1;
    let i = 0;
    while (i < indices.length) {
      const existing = rows[indices[i]].codes[level];
      if (existing) {
        const slot = pool.indexOf(existing);
        if (slot > floorSlot) floorSlot = slot;
        i++;
        continue;
      }
      let j = i;
      while (j < indices.length && !rows[indices[j]].codes[level]) j++;
      const runLength = j - i;
      const hasCeiling = j < indices.length;
      const ceilingSlot = hasCeiling ? pool.indexOf(rows[indices[j]].codes[level]) : pool.length;
      const room = ceilingSlot - floorSlot - 1;
      if (room >= runLength) {
        const fit = maxGapForRun(room, runLength);
        if (runLength >= 2 && fit >= 2) {
          state.anyGapChoiceRelevant = true;
          state.maxGap = Math.min(state.maxGap, fit);
        }
        floorSlot += runLength * fit;
      }
      i = j;
    }
  }
}

export function practicalGapOptions(rows: TaxonomyRow[], level: number, codeRestriction: CodeRestriction): number[] {
  if (!isFixedGapRestriction(codeRestriction)) return [];
  const state: GapFitState = { maxGap: 9, anyGapChoiceRelevant: false };
  scanLevelForGapFit(rows, level, codePoolFor(codeRestriction), state);
  if (!state.anyGapChoiceRelevant) return [];
  return Array.from({ length: state.maxGap }, (_, i) => i + 1);
}

// James's ask (2026-11-23): Auto Code's own dialog should show (and let him override) the gap it's
// about to use, the same way Fill Missing Codes already does — rather than silently applying
// whatever Settings' Auto Code Gap Increment happens to hold. Auto Code sweeps every level in one
// pass, so the practical ceiling here is the smallest fit found anywhere in the WHOLE taxonomy —
// a gap that breaks even one group somewhere would break Auto Code's single pass over everything.
export function practicalGapOptionsForAutoCode(rows: TaxonomyRow[], codeRestriction: CodeRestriction): number[] {
  if (!isFixedGapRestriction(codeRestriction)) {
    // Numeric Only itself has no fixed-gap concept for its everyday, in-range case (that keeps
    // its own adaptive full-stretch rule, assignGroupCodes) — but James's report (2026-11-24): an
    // approved overflow into letters was always stretching across the full range regardless of
    // the configured gap, with no way to see or change it beforehand. Offered whenever at least
    // one group in the taxonomy genuinely overflows, using each such group's own ordinary count
    // (the same "smallest fit anywhere" ceiling the fixed-gap restrictions already use above).
    const overflowGroups = findNumericOverflowGroups(rows);
    if (overflowGroups.length === 0) return [];
    const maxGap = Math.min(9, ...overflowGroups.map((g) => maxFixedGapFor(g.ordinaryCount, CODE_SLOTS)));
    return Array.from({ length: maxGap }, (_, i) => i + 1);
  }
  const pool = codePoolFor(codeRestriction);
  const maxLevel = maxLevelUsed(rows);
  const state: GapFitState = { maxGap: 9, anyGapChoiceRelevant: false };
  for (let level = 0; level <= maxLevel; level++) {
    scanLevelForGapFit(rows, level, pool, state);
  }
  if (!state.anyGapChoiceRelevant) return [];
  return Array.from({ length: state.maxGap }, (_, i) => i + 1);
}

// James's report (2026-11-23): the gap-choice dialog's examples, built from codePoolFor's one
// pool, showed "1, 3, 5, …" even under a restriction that allows letters too — accurate for a
// GREENFIELD fill (which really does start from the pool's own first character), but misleading
// for a PATCH fill continuing on from an existing letter anchor (his own test: filling after "D"
// actually produced "F, H, J, …", not digits at all). Rather than trying to predict which of the
// two a given fill will turn out to be, this returns BOTH a numeric and a letter example whenever
// the restriction allows both — exactly the dual notation James's own original spec asked for
// ("1, 3, 5, … or a, c, e, …") — so the dialog is honest regardless of which branch runs.
export interface GapExampleParts {
  numeric: string | null;
  alpha: string;
}

export function gapExampleParts(codeRestriction: CodeRestriction, gapIncrement: number): GapExampleParts {
  const digits = CODE_SLOTS.slice(0, 9);
  const upper = CODE_SLOTS.slice(9);
  const exampleFrom = (pool: string[]) =>
    [0, gapIncrement, 2 * gapIncrement].map((i) => pool[i] ?? '…').join(', ');
  // Numeric Only itself has no fixed gap for its everyday (in-range) case — but this is only ever
  // called when a gap choice IS being offered, which for Numeric Only only happens for an approved
  // overflow (practicalGapOptionsForAutoCode), and that overflow genuinely starts from "1" through
  // the digits before spilling into letters, the same shape as the two Alpha Numeric restrictions.
  const hasDigits =
    codeRestriction === 'Alpha Numeric with Upper Case Alpha Only' ||
    codeRestriction === 'Alpha Numeric with All Alpha' ||
    codeRestriction === 'Numeric Only';
  return {
    numeric: hasDigits ? exampleFrom(digits) : null,
    alpha: exampleFrom(upper),
  };
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
  if (indices.some((i) => rows[i].codes[level])) return fillOrderedGaps(rows, indices, level, codeRestriction, gapIncrement);

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
  const pool = useFixedGap ? codePoolFor(codeRestriction) : CODE_SLOTS;

  const otherTrails =
    ordinaryIndices.length === 0 || otherIndices.every((oi) => oi > ordinaryIndices[ordinaryIndices.length - 1]);

  if (!otherTrails) {
    // Fallback: every sibling, in row order, sharing one spread — no reserved slot, since a
    // reservation only makes sense when nothing ordinary follows it (hasOther: false below).
    // James's report (2026-11-24): an approved Numeric Only overflow (more members than the nine
    // digits can hold) was always stretching across the FULL alphanumeric range regardless of the
    // taxonomy's own configured gap — e.g. landing on "1, 5, 9, D, I…" when Settings' own gap
    // increment would give "1, 3, 5, 7, 9, B, D…". Only the overflowing case switches to the
    // fixed-gap spread every other restriction's own overflow already uses; a group that still
    // fits the plain digit range keeps the full stretch James separately confirmed he wants there.
    const useFixedSpread = useFixedGap || indices.length > 9;
    const slots = useFixedSpread
      ? spreadSlotsFixed(indices.length, gapIncrement, pool)
      : spreadSlots(indices.length, numericCeilingIndex(indices.length, false));
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

  // James's report (2026-11-23): under Numeric Only, a plain group of exactly 9 ordinary
  // siblings (no Other/Miscellaneous in it at all) spilled into letters — spreadSlots always
  // defaulted to 8 "available" slots, reserving a 9th for an Other entry that, in a group with
  // none, was never actually needed. Nine digits (1-9) genuinely fit nine ordinary siblings with
  // no Other to make room for; only reserve the 9th when there's a real Other row to put there.
  //
  // James's follow-up report (2026-11-24): once a group genuinely overflows past that (more
  // ordinary members than the digits can hold), it should respect the configured gap like every
  // other restriction's overflow already does, not keep stretching across the full range
  // regardless — see the matching fix and comment in the !otherTrails branch above.
  const maxOrdinaryBeforeOverflow = otherIndices.length > 0 ? 8 : 9;
  const useFixedSpread = useFixedGap || ordinaryIndices.length > maxOrdinaryBeforeOverflow;
  const slots = useFixedSpread
    ? spreadSlotsFixed(ordinaryIndices.length, gapIncrement, pool)
    : spreadSlots(ordinaryIndices.length, numericCeilingIndex(ordinaryIndices.length, otherIndices.length > 0));
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

  // "9" (index 8) whenever the ordinary siblings fit within 1-8 (or, under a pure-letter
  // restriction with no digits, the pool's own 9th character — the same "one slot past a 1-8
  // spread" rule, just generalised to whatever pool is actually in play); otherwise the next slot
  // past however far they actually reached — found from the spread's own last slot rather than
  // assumed from `ordinaryIndices.length`, since a gap greater than 1 (the overflow case,
  // count > 8) can reach a higher index than the sibling count alone would suggest.
  const highestOrdinarySlotIndex = slots.length > 0 ? pool.indexOf(slots[slots.length - 1]) : -1;
  let otherSlotIndex = Math.max(8, highestOrdinarySlotIndex + 1);
  for (const idx of otherIndices) {
    const row = result[idx];
    if (row.codes[level]) continue;
    while (otherSlotIndex < pool.length && used.has(pool[otherSlotIndex])) otherSlotIndex++;
    const code = pool[otherSlotIndex];
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

/** One sibling group Auto Code has found it cannot represent under "Numeric Only" alone — more
 * ordinary members than the nine digits (minus one, if the group also has an Other/Miscellaneous
 * entry to reserve a slot for — see assignGroupCodes' own fix for the exact rule) can hold.
 * `key` is a stable identity for this exact group, for the Auto Code dialog to remember which
 * overflows it's already been told how to handle without re-deriving them by structural equality. */
export interface NumericOverflowGroup {
  key: string;
  level: number;
  /** Every ancestor's own description, top (shallowest) to bottom (immediate parent) — James's
   * report: a plain "under 'COSTS'" was ambiguous the moment "Costs" turns up as a heading in more
   * than one branch of the same taxonomy (a common pattern), and Find's own "first match only"
   * made it worse. The full path disambiguates without the user needing to go searching at all. */
  ancestorPath: string[];
  ordinaryCount: number;
  maxAllowed: number;
  hasOther: boolean;
  /** The group's own first row — James's ask: drop the cursor there and scroll it into view the
   * moment the overflow prompt appears, rather than leaving him to go hunting for it himself. */
  firstRowId: string;
  /** The grid's own 1-based row number for firstRowId (rowIndex + 1, exactly what the grid's own
   * row-number column shows) — James's report: even the full ancestor breadcrumb can't disambiguate
   * two headings that happen to share the exact same name and nesting (e.g. two unrelated branches
   * each genuinely titled just "Costs"). The row number is the one thing that's never ambiguous. */
  rowNumber: number;
}

// James's ask (2026-11-23), items 2 and 4 together: before Auto Code writes anything under
// "Numeric Only", check the WHOLE taxonomy for a group that genuinely can't fit — more ordinary
// members than nine digits can represent — and hand each one to the caller to ask about, rather
// than letting spreadSlots silently spill into letters the moment it happens (its own existing,
// and still correct, behaviour for an approved overflow — this function only decides whether that
// should be allowed to happen without asking first). Returns every overflowing group, in the same
// top-to-bottom order Auto Code itself would reach them, so the caller can always act on the
// first one it hasn't already approved.
// Every ancestor's own description, shallowest first — walks immediateParentIndex repeatedly.
function ancestorPathFor(rows: TaxonomyRow[], idx: number): string[] {
  const path: string[] = [];
  let i = immediateParentIndex(rows, idx);
  while (i !== -1) {
    path.unshift(rows[i].descriptions[levelOf(rows[i])] || '(unnamed heading)');
    i = immediateParentIndex(rows, i);
  }
  return path;
}

export function findNumericOverflowGroups(rows: TaxonomyRow[]): NumericOverflowGroup[] {
  const maxLevel = maxLevelUsed(rows);
  const result: NumericOverflowGroup[] = [];
  for (let level = 0; level <= maxLevel; level++) {
    const groups = groupSiblingIndices(rows, level);
    for (const indices of groups.values()) {
      if (indices.some((i) => rows[i].codes[level])) continue; // patch group: never overflows, it never spreads from scratch
      const otherCount = indices.filter((i) => isOtherOrMiscellaneousLabel(rows[i].descriptions[level] ?? '')).length;
      const ordinaryCount = indices.length - otherCount;
      const maxAllowed = otherCount > 0 ? 8 : 9;
      if (ordinaryCount <= maxAllowed) continue;
      result.push({
        key: `${level}:${rows[indices[0]].id}`,
        level,
        ancestorPath: ancestorPathFor(rows, indices[0]),
        ordinaryCount,
        maxAllowed,
        hasOther: otherCount > 0,
        firstRowId: rows[indices[0]].id,
        rowNumber: indices[0] + 1,
      });
    }
  }
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
function fillOrderedGaps(
  rows: TaxonomyRow[],
  indices: number[],
  level: number,
  codeRestriction: CodeRestriction,
  gapIncrement: number,
): TaxonomyRow[] {
  // James's report (2026-11-23): patching a gap between two already-coded siblings (e.g. "A" and
  // "D") could still hand out a digit for a pure-alpha restriction — CODE_SLOTS.indexOf always
  // finds an existing letter's real position regardless of restriction, so that part was already
  // safe, but a blank run with NOTHING coded yet before it (floorSlot still -1) filled starting
  // from CODE_SLOTS' own slot 0 ("1"), not the restriction's own first allowed character. Walking
  // the restriction's own pool throughout keeps every NEWLY assigned character inside it.
  const pool = isFixedGapRestriction(codeRestriction) ? codePoolFor(codeRestriction) : CODE_SLOTS;
  // Numeric Only never offers a gap choice (practicalGapOptions, isFixedGapRestriction) — the
  // settings default still arrives here unchanged, so it's forced back to plain sequential rather
  // than silently picking up a gap nothing ever asked for or confirmed fits nine digits.
  const effectiveGap = isFixedGapRestriction(codeRestriction) ? gapIncrement : 1;
  let result = rows;
  let floorSlot = -1;
  let i = 0;
  while (i < indices.length) {
    const existing = result[indices[i]].codes[level];
    if (existing) {
      const slot = pool.indexOf(existing);
      if (slot > floorSlot) floorSlot = slot;
      i++;
      continue;
    }
    let j = i;
    while (j < indices.length && !result[indices[j]].codes[level]) j++;
    const runLength = j - i;
    const hasCeiling = j < indices.length;
    const ceilingSlot = hasCeiling ? pool.indexOf(result[indices[j]].codes[level]) : pool.length;
    const room = ceilingSlot - floorSlot - 1;
    if (room >= runLength) {
      // James's report (2026-11-23): a gap between two real codes with genuine spare room (e.g.
      // "B" and "Z", eight blanks between them) always filled plain-consecutive, with no way to
      // leave room for later insertions the way a greenfield spread already could — self-clamped
      // to whatever this one run can actually fit, same safety-net pattern as spreadSlotsFixed and
      // Auto Code's own adaptive limiting, so the one gap chosen for the whole column never breaks
      // a tighter run elsewhere in the same group.
      const gap = Math.min(effectiveGap, maxGapForRun(room, runLength));
      for (let k = 0; k < runLength; k++) {
        const slot = floorSlot + (k + 1) * gap;
        result = replaceCode(result, indices[i + k], level, pool[slot]);
      }
      floorSlot += runLength * gap;
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
