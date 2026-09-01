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
