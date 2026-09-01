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
import { isAllowedByCodeRestriction, restrictionCharset } from './codeValidation';

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

// Picks the first not-yet-used, restriction-allowed letter out of a description's own
// characters — the actual "mnemonic" part (Land -> L, Buildings -> B). Falls back to the next
// unused character in the whole restricted charset (still deterministic and visible to the
// user, just no longer literally drawn from the word) when nothing in the description itself
// is usable — e.g. it starts with a symbol, or every one of its letters already went to an
// earlier sibling.
function suggestUnusedCode(description: string, used: Set<string>, restriction: CodeRestriction): string | null {
  const upperCase = restriction !== 'Alpha Both Cases Only' && restriction !== 'Alpha Numeric with All Alpha';
  for (const rawChar of description) {
    const char = upperCase ? rawChar.toUpperCase() : rawChar;
    if (!used.has(char) && isAllowedByCodeRestriction(char, restriction)) return char;
  }
  for (const char of restrictionCharset(restriction)) {
    if (!used.has(char)) return char;
  }
  return null;
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
  const usedAtLevel: Set<string>[] = Array.from({ length: maxLevel + 1 }, () => new Set<string>());
  let prevLevel = -1;
  return rows.map((row) => {
    const level = levelOf(row);
    if (level === -1) return row;
    // A shallower (or equal) level than the last row means a new sibling group has started at
    // this level and every deeper one — those used-sets no longer apply to what comes next.
    if (level <= prevLevel) {
      for (let l = level; l <= maxLevel; l++) usedAtLevel[l].clear();
    }
    prevLevel = level;

    const existing = row.codes[level] ?? '';
    if (existing) {
      usedAtLevel[level].add(existing);
      return row;
    }
    const suggestion = suggestUnusedCode(row.descriptions[level] ?? '', usedAtLevel[level], restriction);
    if (!suggestion) return row;
    usedAtLevel[level].add(suggestion);
    return { ...row, codes: row.codes.map((c, i) => (i === level ? suggestion : c)) };
  });
}
