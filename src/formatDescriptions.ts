// "Format Descriptions" (James's ask): a whole-taxonomy button for cleaning up scrappy input —
// entered without consistent capitalisation — into the taxonomy's own ALL CAPS (structural,
// Section 4.3) / Proper Case (posting-level) convention, without mangling recognised
// abbreviations (abbreviations.ts) in the process. Offers three scopes, since a user midway
// through data entry may only want one half fixed at a time.

import type { TaxonomyRow } from './types';
import { toProperCasePreservingAbbreviations, findUnknownAllCapsWords } from './abbreviations';

export const FORMAT_MODES = [
  'Capitalise only headings',
  'Proper case posting level descriptions',
  'Capitalise and Proper Case All',
] as const;
export type FormatMode = (typeof FORMAT_MODES)[number];

function levelOf(row: TaxonomyRow): number {
  for (let i = row.descriptions.length - 1; i >= 0; i--) {
    if ((row.descriptions[i] ?? '').trim()) return i;
  }
  return -1;
}

// A row "has children" exactly when the row immediately following it is deeper — mirrors
// Grid.tsx's own getDescendantEndIndex(idx) > idx + 1 check, restated here since this module
// (like autoCode.ts) works on a plain TaxonomyRow[] outside the grid component.
function rowHasChildren(rows: TaxonomyRow[], idx: number): boolean {
  if (idx + 1 >= rows.length) return false;
  const level = levelOf(rows[idx]);
  return levelOf(rows[idx + 1]) > level;
}

function affectsHeadings(mode: FormatMode): boolean {
  return mode === 'Capitalise only headings' || mode === 'Capitalise and Proper Case All';
}

function affectsLeaves(mode: FormatMode): boolean {
  return mode === 'Proper case posting level descriptions' || mode === 'Capitalise and Proper Case All';
}

/** Every distinct unknown ALL-CAPS word across whichever rows the chosen mode will actually
 * touch — headings are always just plain-uppercased (no abbreviation casing to preserve), so
 * only rows Format Descriptions will Proper-Case (leaves) need this "prompt when unsure" pass.
 * `scopeRowIds`, when given, restricts this to "Format Selected Range" — undefined means every
 * row, matching "Format Entire Worksheet". */
export function collectUnknownAbbreviationWords(
  rows: TaxonomyRow[],
  mode: FormatMode,
  customAbbreviations: readonly string[],
  scopeRowIds?: ReadonlySet<string>,
): string[] {
  if (!affectsLeaves(mode)) return [];
  const found = new Set<string>();
  rows.forEach((row, idx) => {
    if (scopeRowIds && !scopeRowIds.has(row.id)) return;
    const level = levelOf(row);
    if (level === -1 || rowHasChildren(rows, idx)) return;
    for (const word of findUnknownAllCapsWords(row.descriptions[level] ?? '', customAbbreviations)) {
      found.add(word);
    }
  });
  return [...found];
}

/** Applies the chosen formatting mode to every row's own description column (the one matching
 * its level — the only one ever populated, Section 4.1). `customAbbreviations` should already
 * include anything the user accepted via the "keep this in caps?" prompt for this run.
 * `scopeRowIds`, when given, restricts the rewrite to just those rows ("Format Selected
 * Range") — undefined touches every row ("Format Entire Worksheet"). */
export function applyFormatDescriptions(
  rows: TaxonomyRow[],
  mode: FormatMode,
  customAbbreviations: readonly string[],
  scopeRowIds?: ReadonlySet<string>,
): TaxonomyRow[] {
  return rows.map((row, idx) => {
    if (scopeRowIds && !scopeRowIds.has(row.id)) return row;
    const level = levelOf(row);
    if (level === -1) return row;
    const text = row.descriptions[level] ?? '';
    if (!text) return row;
    const heading = rowHasChildren(rows, idx);
    let newText = text;
    if (heading && affectsHeadings(mode)) {
      newText = text.toUpperCase();
    } else if (!heading && affectsLeaves(mode)) {
      newText = toProperCasePreservingAbbreviations(text, customAbbreviations);
    }
    if (newText === text) return row;
    const descriptions = row.descriptions.slice();
    descriptions[level] = newText;
    return { ...row, descriptions };
  });
}
