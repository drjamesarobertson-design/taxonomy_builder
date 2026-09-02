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
function suggestUnusedCode(words: string[], used: Set<string>, restriction: CodeRestriction): string | null {
  const upperCase = restriction !== 'Alpha Both Cases Only' && restriction !== 'Alpha Numeric with All Alpha';
  const tryChar = (raw: string): string | null => {
    const char = upperCase ? raw.toUpperCase() : raw;
    return !used.has(char) && isAllowedByCodeRestriction(char, restriction) ? char : null;
  };
  // A word's own first letter is tried separately (steps 1-3) before its consonants (steps
  // 4+), so the consonant search starts one character in — retrying the same letter twice
  // would just repeat the same failure.
  const consonantsAfterFirst = (word: string): string[] => [...word.slice(1)].filter((c) => isConsonant(c.toUpperCase()));

  for (let i = 0; i < 3; i++) {
    if (!words[i]) continue;
    const attempt = tryChar(words[i][0]);
    if (attempt) return attempt;
  }
  for (let i = 0; i < 3; i++) {
    if (!words[i]) continue;
    for (const consonant of consonantsAfterFirst(words[i]).slice(0, 2)) {
      const attempt = tryChar(consonant);
      if (attempt) return attempt;
    }
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
  function immediateParentIndex(idx: number): number {
    const level = levelOf(rows[idx]);
    for (let i = idx - 1; i >= 0; i--) {
      const l = levelOf(rows[i]);
      if (l !== -1 && l < level) return i;
    }
    return -1;
  }

  const groups = new Map<string, TaxonomyRow[]>();
  rows.forEach((row, idx) => {
    const level = levelOf(row);
    if (level === -1) return;
    const key = `${level}:${immediateParentIndex(idx)}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  });

  const result = new Map<string, number>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
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
    const words = wordsOf(row.descriptions[level] ?? '')
      .slice(sharedPrefixLengths.get(row.id) ?? 0)
      .filter((w) => !CONNECTOR_WORDS.has(w.toLowerCase()));
    const suggestion = suggestUnusedCode(words, usedAtLevel[level], restriction);
    if (!suggestion) return row;
    usedAtLevel[level].add(suggestion);
    return { ...row, codes: row.codes.map((c, i) => (i === level ? suggestion : c)) };
  });
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
