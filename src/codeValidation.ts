// Code character rules, per CLAUDE.md Section 4.4 / 6.7 (hard rule): within any column,
// codes must sort in ascending ASCII order top to bottom. Only '.', 0-9, a-z, A-Z are valid.

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
