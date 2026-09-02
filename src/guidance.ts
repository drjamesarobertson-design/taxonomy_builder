// The Simple Taxonomy guided wizard's supporting logic (App.tsx/GuidanceBanner.tsx own the UI
// and stage transitions themselves) — counting headings/items for the 5-to-9 soft warning, and
// suggesting a mnemonic code per row at the coding stage. James explicitly asked for real
// auto-suggested codes here ("please ignore previous constraints, we are now pushing the
// boundaries to create an increasingly intelligent application") — a deliberate, scoped
// exception to CLAUDE.md Section 9.6's general "no automatic code generation", confined to
// this wizard's coding stage. Suggestions are pre-filled directly into the code cells but
// remain ordinary, fully-editable cells from that point on — normal overtype, normal
// validation, nothing special about them once written.

import type { CodeRestriction, TaxonomyRow } from './types';
import { isAllowedByCodeRestriction } from './codeValidation';

function levelOf(row: TaxonomyRow): number {
  for (let i = row.descriptions.length - 1; i >= 0; i--) {
    if ((row.descriptions[i] ?? '').trim()) return i;
  }
  return -1;
}

/** How many level-0 rows (major headings) have a description so far. */
export function countHeadings(rows: TaxonomyRow[]): number {
  return rows.filter((r) => levelOf(r) === 0).length;
}

/** One count per heading, in order — how many level-1 children immediately follow it. A
 * heading with 0 children deliberately isn't "too few" (Simple Taxonomy explicitly allows
 * some headings to stay flat while others expand), so callers should only flag counts that
 * are non-zero and outside 5-9, not zero counts themselves. */
export function countChildrenPerHeading(rows: TaxonomyRow[]): number[] {
  const counts: number[] = [];
  let current = -1;
  for (const row of rows) {
    const level = levelOf(row);
    if (level === 0) {
      counts.push(0);
      current = counts.length - 1;
    } else if (level === 1 && current !== -1) {
      counts[current]++;
    }
  }
  return counts;
}

/** The deepest description level actually populated anywhere — how many code columns the
 * coding stage needs to reveal (this level + 1). */
export function maxLevelUsed(rows: TaxonomyRow[]): number {
  return rows.reduce((max, row) => Math.max(max, levelOf(row)), 0);
}

function isConsonant(upperChar: string): boolean {
  return /^[A-Z]$/.test(upperChar) && !'AEIOU'.includes(upperChar);
}

function wordsOf(description: string): string[] {
  return description.split(/\s+/).filter((w) => w.length > 0);
}

// Section 5, step 6's catch-all convention ("Other [category name]"/"Miscellaneous"), matched
// against just the row's own leading word so "Other Damages" and "Miscellaneous" both count but
// an unrelated description that merely mentions the word later in the sentence doesn't.
export function isOtherOrMiscellaneousLabel(description: string): boolean {
  return /^(other|miscellaneous)\b/i.test(description.trim());
}

function immediateParentIndex(rows: TaxonomyRow[], idx: number): number {
  const level = levelOf(rows[idx]);
  for (let i = idx - 1; i >= 0; i--) {
    const l = levelOf(rows[i]);
    if (l !== -1 && l < level) return i;
  }
  return -1;
}

/** Row indices grouped by sibling set — rows sharing the same level and the same immediate
 * parent ROW (not parent code, see computeSharedPrefixLengths below), in top-to-bottom order
 * within each group. Shared by the prefix-stripping and "Other should be last" checks so both
 * agree on exactly what counts as one sibling group. */
function groupSiblingIndices(rows: TaxonomyRow[]): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  rows.forEach((row, idx) => {
    const level = levelOf(row);
    if (level === -1) return;
    const key = `${level}:${immediateParentIndex(rows, idx)}`;
    const group = groups.get(key);
    if (group) group.push(idx);
    else groups.set(key, [idx]);
  });
  return groups;
}

/** True when `rowId` reads as an "Other"/"Miscellaneous" catch-all (Section 5, step 6) but
 * isn't the last entry among its own siblings — CLAUDE.md expects the catch-all to sit (and be
 * coded) last, so entering one earlier in a segment is worth a soft nudge before it, or a
 * sibling typed after it, locks in a code order that can't be fixed by Suggest Codes alone. */
export function isOtherEntryNotLast(rows: TaxonomyRow[], rowId: string): boolean {
  const idx = rows.findIndex((r) => r.id === rowId);
  if (idx === -1) return false;
  const level = levelOf(rows[idx]);
  if (level === -1 || !isOtherOrMiscellaneousLabel(rows[idx].descriptions[level] ?? '')) return false;
  const parent = immediateParentIndex(rows, idx);
  for (let i = idx + 1; i < rows.length; i++) {
    const l = levelOf(rows[i]);
    if (l === -1) continue;
    if (l < level) return false; // exited this segment entirely — no later sibling exists
    if (l === level) return immediateParentIndex(rows, i) === parent;
  }
  return false;
}

/** Every row in `rowId`'s own sibling group that's an Other/Miscellaneous entry not sitting
 * last — not just `rowId` itself. Blurring a cell only tells the caller that ONE row changed,
 * but a later sibling being typed is exactly what turns an earlier "Other" entry into a
 * violation without that earlier cell ever being touched again, so callers should re-check the
 * whole group on every blur within it, not just the row that fired the event. */
export function findOtherNotLastInGroup(rows: TaxonomyRow[], rowId: string): string[] {
  const idx = rows.findIndex((r) => r.id === rowId);
  if (idx === -1) return [];
  const level = levelOf(rows[idx]);
  if (level === -1) return [];
  const parent = immediateParentIndex(rows, idx);
  const siblingIds = rows.filter((_, i) => levelOf(rows[i]) === level && immediateParentIndex(rows, i) === parent).map((r) => r.id);
  return siblingIds.filter((id) => isOtherEntryNotLast(rows, id));
}

// Small, deliberately short list — grammatical connectors that carry no distinguishing meaning
// of their own (James's round-2 phrase: "NOT by, and, etcetera"). Removed from a row's word
// list entirely before the word-1/2/3 rule runs, rather than merely skipped-with-fallback —
// otherwise "Order Cancelled BY Consumer" would offer up "B" as a real candidate, which not
// only isn't meaningful but can land earlier in the alphabet than an already-used sibling code
// and break ascending order for no good reason. Not exhaustive by design — extend it if a real
// taxonomy needs more.
const CONNECTOR_WORDS = new Set([
  'by', 'and', 'or', 'of', 'the', 'a', 'an', 'to', 'in', 'on', 'for', 'with', 'from', 'as', 'at',
]);

// James's round-4 restatement, tried in this exact order against a row's own description
// (after stripWordsSharedByWholeGroup below has already dropped any leading words every
// sibling starts with — his own repro: with the leading words still in, the first child under
// "ORDER CANCELLED" picks "O" from "Order", which "pushes the available codes lower down to
// the end of the alphabet" for every later sibling, since every one of them starts with the
// same two words):
//   1. First letter of word 1.
//   2. First letter of word 2, if there is one.
//   3. First letter of word 3, if there is one.
//   4. First consonant within word 1.
//   5. Second consonant within word 1.
//   6. First consonant within word 2, if there is one.
//   7. Second consonant within word 2.
//   8. First consonant within word 3, if there is one.
//   9. Second consonant within word 3.
// If none of those nine produces a letter that's both allowed and not already used by an
// earlier sibling, the row is left blank (findRowsNeedingManualCode flags it) rather than
// falling back to an arbitrary charset letter with no connection to the description.
// A word's own first letter is tried separately (steps 1-3, below) before its consonants (steps
// 4+), so the consonant search starts one character in — retrying the same letter twice would
// just repeat the same failure.
function consonantsAfterFirst(word: string): string[] {
  return [...word.slice(1)].filter((c) => isConsonant(c.toUpperCase()));
}

/** The 9-step candidate order itself (steps 1-3 then 4-9 above), as raw, not-yet-cased letters —
 * exposed separately from suggestUnusedCode so the alphabet-band check below can search the same
 * ordered list under an extra constraint, without duplicating James's rule a second time. */
function orderedCandidateLetters(words: string[]): string[] {
  const candidates: string[] = [];
  for (let i = 0; i < 3; i++) {
    if (words[i]) candidates.push(words[i][0]);
  }
  for (let i = 0; i < 3; i++) {
    if (!words[i]) continue;
    for (const consonant of consonantsAfterFirst(words[i]).slice(0, 2)) candidates.push(consonant);
  }
  return candidates;
}

// 0-based position within A-Z (case-insensitive), for the alphabet-band check below. Only
// meaningful for an actual letter — callers must check first.
function alphaIndex(ch: string): number {
  return ch.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
}

// `maxAlphaIndex`, when given, additionally rejects any candidate whose alphabet position falls
// after it — used only by findAlphabetBandSuggestions below to search the very same ordered
// candidate list under that extra ceiling; the ordinary call (suggestMnemonicCodes) never passes
// it, so its own behaviour is unchanged.
function suggestUnusedCode(
  words: string[],
  used: Set<string>,
  restriction: CodeRestriction,
  maxAlphaIndex?: number,
): string | null {
  const upperCase = restriction !== 'Alpha Both Cases Only' && restriction !== 'Alpha Numeric with All Alpha';
  const tryChar = (raw: string): string | null => {
    const char = upperCase ? raw.toUpperCase() : raw;
    if (used.has(char) || !isAllowedByCodeRestriction(char, restriction)) return null;
    if (maxAlphaIndex !== undefined && /^[A-Za-z]$/.test(char) && alphaIndex(char) > maxAlphaIndex) return null;
    return char;
  };
  for (const candidate of orderedCandidateLetters(words)) {
    const attempt = tryChar(candidate);
    if (attempt) return attempt;
  }
  return null;
}

const ALL_CODE_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('');

// James's ask: an "Other"/"Miscellaneous" catch-all should get the LAST character its Code
// Restriction allows ("Z", "z", or "9" depending on setting) rather than a mnemonic letter drawn
// from its own wording — Section 5, step 6's "conventionally coded last". Tried in descending
// ASCII order so a rare collision (two catch-alls at the same level, or the letter already taken
// by an ordinary sibling) still finds the next-best "as late as possible" option instead of
// failing outright.
function suggestOtherOrMiscellaneousCode(used: Set<string>, restriction: CodeRestriction): string | null {
  const descending = ALL_CODE_CHARS.filter((c) => isAllowedByCodeRestriction(c, restriction)).sort(
    (a, b) => b.charCodeAt(0) - a.charCodeAt(0),
  );
  for (const c of descending) {
    if (!used.has(c)) return c;
  }
  return null;
}

// James's round-4 report: "First Column code picks Order even though O pushes the available
// codes lower down to the end of the alphabet ... which does not work" — every child under one
// heading starting with the same word(s) (typically because it's the heading's own wording
// repeated verbatim) means using that word's letter for ANY of them, even the very first,
// wastes it for zero distinguishing benefit and forces every later sibling further down the
// alphabet chasing consonants. Finds, for each sibling group (rows sharing the same immediate
// parent ROW — not parent CODE, which is usually still blank at this point, before Fill Codes
// has run), how many of their OWN leading words are identical (case-insensitively) across
// EVERY member of the group, so suggestUnusedCode can skip them for all siblings alike, not
// just the ones where a collision happens to force a fallback. Always leaves at least one word
// per row, even if that means the "shared" prefix isn't quite as long as it could be for some.
function computeSharedPrefixLengths(rows: TaxonomyRow[]): Map<string, number> {
  const groups = groupSiblingIndices(rows);

  const result = new Map<string, number>();
  for (const indices of groups.values()) {
    if (indices.length < 2) continue;
    const group = indices.map((i) => rows[i]);
    const wordLists = group.map((r) => wordsOf(r.descriptions[levelOf(r)] ?? ''));
    const minLen = Math.min(...wordLists.map((w) => w.length));
    let shared = 0;
    while (
      shared < minLen &&
      wordLists.every((w) => w[shared].toLowerCase() === wordLists[0][shared].toLowerCase())
    ) {
      shared++;
    }
    const cappedShared = Math.min(shared, minLen - 1);
    if (cappedShared > 0) {
      for (const row of group) result.set(row.id, cappedShared);
    }
  }
  return result;
}

/** Rows whose description (at their own level) suggestMnemonicCodes left without a code — step
 * 5 of James's rule ("prompt the user to enter a code") once every word/consonant option is
 * exhausted. Callers use this right after suggestMnemonicCodes to flag exactly those rows for
 * manual entry, rather than silently leaving them blank with nothing said. */
export function findRowsNeedingManualCode(rows: TaxonomyRow[]): { rowId: string; level: number }[] {
  return rows
    .map((row) => {
      const level = levelOf(row);
      if (level === -1) return null;
      return (row.codes[level] ?? '') === '' ? { rowId: row.id, level } : null;
    })
    .filter((r): r is { rowId: string; level: number } => r !== null);
}

// Suggests a code for every row from level 0 through `maxLevel` that doesn't already have one,
// one sibling group at a time (siblings share a parent, so their suggested codes only need to
// avoid colliding with each other, not with unrelated branches). A row that already holds a
// real code is left untouched — this only fills in blanks, it never overwrites a manually
// entered value. Best-effort on ascending order: works out cleanly when descriptions are
// already alpha-sorted (which the wizard prompts for at every earlier stage anyway); "Check
// Ascending Order" (existing right-click action) is the way to spot and fix the rare case
// where it doesn't.
export function suggestMnemonicCodes(rows: TaxonomyRow[], maxLevel: number, restriction: CodeRestriction): TaxonomyRow[] {
  const sharedPrefixLengths = computeSharedPrefixLengths(rows);
  const usedAtLevel: Set<string>[] = Array.from({ length: maxLevel + 1 }, () => new Set<string>());
  let prevLevel = -1;
  return rows.map((row) => {
    const level = levelOf(row);
    if (level === -1) return row;
    // A strictly shallower level than the last row means every level DEEPER than this one has
    // just exited its parent's subtree — those used-sets no longer apply to whatever comes
    // next (a different parent's children are free to reuse the same letters). This row's own
    // level, though, is never cleared here: two siblings at the very same level (a run of
    // children under one heading, or two headings in a row) must keep sharing one used-set for
    // the whole time they're being visited, or duplicate suggestions slip straight through —
    // which is exactly the bug this fixes (clearing on "<=" instead of "<", and starting the
    // clear AT this level instead of one past it, wiped that tracking on every single sibling).
    if (level < prevLevel) {
      for (let l = level + 1; l <= maxLevel; l++) usedAtLevel[l].clear();
    }
    prevLevel = level;

    const existing = row.codes[level] ?? '';
    if (existing) {
      usedAtLevel[level].add(existing);
      return row;
    }
    const description = row.descriptions[level] ?? '';
    // An "Other"/"Miscellaneous" catch-all skips the word/consonant rule entirely — its own
    // wording has no bearing on where it should sort, and trying to mine a mnemonic letter out
    // of "Other" or "Miscellaneous" is exactly what was leaving these rows blank (both words
    // exhaust their two-consonant allowance quickly and collide often, since "Other ..." entries
    // recur across many segments of the same taxonomy).
    const suggestion = isOtherOrMiscellaneousLabel(description)
      ? suggestOtherOrMiscellaneousCode(usedAtLevel[level], restriction)
      : suggestUnusedCode(
          wordsOf(description)
            .slice(sharedPrefixLengths.get(row.id) ?? 0)
            .filter((w) => !CONNECTOR_WORDS.has(w.toLowerCase())),
          usedAtLevel[level],
          restriction,
        );
    if (!suggestion) return row;
    usedAtLevel[level].add(suggestion);
    return { ...row, codes: row.codes.map((c, i) => (i === level ? suggestion : c)) };
  });
}

// James's rule of thumb: "the first mnemonic code should be in the first third of the alphabet
// depending on number of column 1 categories" — generalised to dividing the 26 letters into
// `total` equal bands, one per top-level heading, and giving heading `position` (0-based) the
// band running up through its own share: heading 0 of 3 keeps to roughly the first third
// (A..H/I), heading 1 to the first two-thirds, and so on — so an early heading's default pick
// never eats into the range later headings will need. With only one heading there's nothing to
// protect, hence the Math.max(position, ...) floor rather than letting a huge `total` collapse
// the band to nothing.
function idealMaxAlphaIndexForHeading(position: number, total: number): number {
  return Math.max(position, Math.ceil(((position + 1) * 26) / total) - 1);
}

/** After suggestMnemonicCodes has run, the level-0 (heading) rows whose suggested code reaches
 * further into the alphabet than James's "first third" guidance allows for their position among
 * the taxonomy's other headings — his own repro: "ORDER CANCELLED" is the first heading and gets
 * "O", which "pushes the available codes lower down to the end of the alphabet ... which does
 * not work." Each entry names the earlier, in-band alternative (drawn from the very same
 * word/consonant candidate order, just under the extra ceiling) so the caller can offer a Y/N
 * swap rather than silently overriding what Suggest Codes already produced. Skipped entirely for
 * an "Other"/"Miscellaneous" heading — that one is SUPPOSED to sit at the far end. */
export function findAlphabetBandSuggestions(
  rows: TaxonomyRow[],
  restriction: CodeRestriction,
): { rowId: string; defaultCode: string; suggestedCode: string }[] {
  const headingIndices = rows.map((_, i) => i).filter((i) => levelOf(rows[i]) === 0);
  const total = headingIndices.length;
  if (total < 2) return [];
  const sharedPrefixLengths = computeSharedPrefixLengths(rows);
  const allHeadingCodes = new Set(headingIndices.map((i) => rows[i].codes[0] ?? '').filter(Boolean));

  const results: { rowId: string; defaultCode: string; suggestedCode: string }[] = [];
  headingIndices.forEach((rowIdx, position) => {
    const row = rows[rowIdx];
    const description = row.descriptions[0] ?? '';
    const defaultCode = row.codes[0] ?? '';
    if (!defaultCode || !/^[A-Za-z]$/.test(defaultCode) || isOtherOrMiscellaneousLabel(description)) return;
    const maxAlphaIndex = idealMaxAlphaIndexForHeading(position, total);
    if (alphaIndex(defaultCode) <= maxAlphaIndex) return;

    const words = wordsOf(description)
      .slice(sharedPrefixLengths.get(row.id) ?? 0)
      .filter((w) => !CONNECTOR_WORDS.has(w.toLowerCase()));
    const usedExcludingSelf = new Set(allHeadingCodes);
    usedExcludingSelf.delete(defaultCode);
    const alternative = suggestUnusedCode(words, usedExcludingSelf, restriction, maxAlphaIndex);
    if (alternative && alternative !== defaultCode) {
      results.push({ rowId: row.id, defaultCode, suggestedCode: alternative });
    }
  });
  return results;
}

// "Fill Codes" (James's round-2 feedback): the mnemonic suggestion above only ever sets a
// row's OWN column — a heading's code never got carried down through its children's shallower
// columns the way the rest of the app already expects (Section 4.1's own worked example repeats
// the ancestor path on every descendant row). This mirrors the existing, already-verified
// right-click "Replicate Codes Below" — the nearest row above supplies a column's value, which
// then rolls down through blanks until superseded — except run automatically top to bottom, and
// keyed off each row's own level (not a scan-order guess) so it only ever touches genuine
// ancestor columns (index < the row's own level). It never touches a row's own column, and never
// touches a column deeper than the row's own level — that's Pad Codes' job, not this one's, and
// blindly cascading into it would leak an unrelated deeper branch's code into a shallower row
// that never went that far.
export function fillCodesDown(rows: TaxonomyRow[]): TaxonomyRow[] {
  const ancestorCodes: string[] = [];
  return rows.map((row) => {
    const level = levelOf(row);
    if (level === -1) return row;
    const codes = row.codes.map((c, i) => (i < level && !c ? (ancestorCodes[i] ?? c) : c));
    ancestorCodes[level] = codes[level] ?? '';
    ancestorCodes.length = level + 1;
    return { ...row, codes };
  });
}

// "Pad Codes" (James's round-2 feedback): every column deeper than a row's own level simply
// doesn't apply to that row (it doesn't go that deep) and should carry the padding character,
// same as the padding already used everywhere else in the app (Section 4.4) — not be left blank,
// and not inherit some other branch's code the way a blind fill-down would. Only fills genuinely
// blank cells; never overwrites a real code or an existing padding character.
export function padCodes(rows: TaxonomyRow[], paddingChar: string): TaxonomyRow[] {
  return rows.map((row) => {
    const level = levelOf(row);
    if (level === -1) return row;
    const codes = row.codes.map((c, i) => (i > level && !c ? paddingChar : c));
    return { ...row, codes };
  });
}

// James's round-2 feedback, items 2 and 6: after Suggest Codes, check every level's sibling
// groups (rows sharing the same immediate parent code, one column to the left) for a code
// that's either a flat-out duplicate of an earlier sibling, or not in strictly ascending order
// against it — both a defensive safety net (the mnemonic suggestion above should no longer
// produce either on its own, now that its own duplicate-avoidance bug is fixed) and the real
// backstop for codes a user typed in manually before Suggest Codes ever ran.

/** The first row (in top-to-bottom scan order) whose own code repeats an earlier sibling's,
 * for "drop the cursor there" — or null if every level's sibling groups are duplicate-free. */
export function findDuplicateCode(rows: TaxonomyRow[], maxLevel: number): { rowId: string; level: number } | null {
  for (let level = 0; level <= maxLevel; level++) {
    const seenByParent = new Map<string, Set<string>>();
    for (const row of rows) {
      if (levelOf(row) !== level) continue;
      const parentValue = level > 0 ? (row.codes[level - 1] ?? '') : '';
      const code = row.codes[level] ?? '';
      if (!code) continue;
      let seen = seenByParent.get(parentValue);
      if (!seen) {
        seen = new Set();
        seenByParent.set(parentValue, seen);
      }
      if (seen.has(code)) return { rowId: row.id, level };
      seen.add(code);
    }
  }
  return null;
}

/** Whether any level's sibling groups have a code that isn't strictly greater than the sibling
 * immediately before it (duplicates count as "not ascending" too, but findDuplicateCode is the
 * more specific, actionable check for those — this is the broader ascending-order sweep). */
export function hasOutOfOrderCodes(rows: TaxonomyRow[], maxLevel: number): boolean {
  for (let level = 0; level <= maxLevel; level++) {
    let prevParent: string | null = null;
    let prevCode = '';
    let sawAny = false;
    for (const row of rows) {
      if (levelOf(row) !== level) continue;
      const parentValue = level > 0 ? (row.codes[level - 1] ?? '') : '';
      const code = row.codes[level] ?? '';
      if (!code) continue;
      if (!sawAny || parentValue !== prevParent) {
        prevParent = parentValue;
        prevCode = code;
        sawAny = true;
        continue;
      }
      if (code <= prevCode) return true;
      prevCode = code;
    }
  }
  return false;
}

// How far a contiguous block starting at `startIndex` (a row at exactly `level`, plus every
// descendant beneath it) reaches — mirrors Grid.tsx's own getDescendantEndIndex, reimplemented
// here since guidance.ts has no access to Grid's internals.
function blockEnd(rows: TaxonomyRow[], startIndex: number, level: number): number {
  let end = startIndex + 1;
  while (end < rows.length) {
    const l = levelOf(rows[end]);
    if (l === -1 || l <= level) break;
    end++;
  }
  return end;
}

/** Sorts every sibling group at `level` (rows sharing the same immediate parent) by their own
 * code, ascending — each sibling's full descendant subtree moves with it, exactly like the
 * existing Alpha Sort's "carry children along" rule, just keyed by code instead of description
 * text. Sibling groups under different parents are never reordered relative to each other. */
function sortByCodeAtLevel(rows: TaxonomyRow[], level: number): TaxonomyRow[] {
  const result: TaxonomyRow[] = [];
  let i = 0;
  while (i < rows.length) {
    if (levelOf(rows[i]) !== level) {
      result.push(rows[i]);
      i++;
      continue;
    }
    const parentValue = level > 0 ? (rows[i].codes[level - 1] ?? '') : '';
    const blocks: TaxonomyRow[][] = [];
    while (i < rows.length && levelOf(rows[i]) === level) {
      const rowParent = level > 0 ? (rows[i].codes[level - 1] ?? '') : '';
      if (rowParent !== parentValue) break;
      const end = blockEnd(rows, i, level);
      blocks.push(rows.slice(i, end));
      i = end;
    }
    const sorted = [...blocks].sort((a, b) => {
      const ca = a[0].codes[level] ?? '';
      const cb = b[0].codes[level] ?? '';
      return ca < cb ? -1 : ca > cb ? 1 : 0;
    });
    for (const block of sorted) result.push(...block);
  }
  return result;
}

/** The "Sort" side of item 2's "not in increasing order — sort or accept" prompt: brings every
 * level's sibling groups into ascending order by code, shallowest level first (so a heading
 * reorder carries its whole subtree along before that subtree's own children get sorted). */
export function sortAllCodesAscending(rows: TaxonomyRow[], maxLevel: number): TaxonomyRow[] {
  let result = rows;
  for (let level = 0; level <= maxLevel; level++) {
    result = sortByCodeAtLevel(result, level);
  }
  return result;
}
