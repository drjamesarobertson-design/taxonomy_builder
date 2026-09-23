// "Format Descriptions" (James's ask): converting scrappy input to Proper Case shouldn't mangle
// a recognisable abbreviation into "Erp" or "Coa" — this is the library of terms that keep their
// own exact casing wherever they appear, plus the matching/scanning logic Format Descriptions
// uses to apply it and to find anything it doesn't recognise yet.

// A starter set of common ERP/business/accounting abbreviations — not exhaustive (James asked
// whether a standard online library exists for this; there isn't one authoritative source built
// for exactly this purpose, so this seed list draws on general business-abbreviation usage) and
// deliberately short, since the real library is meant to grow from James's own "keep this in
// caps?" answers (TaxonomySettings.customAbbreviations) as he actually uses the tool.
export const DEFAULT_ABBREVIATIONS: readonly string[] = [
  'ERP', 'CoA', 'GL', 'PO', 'HR', 'IT', 'CRM', 'KPI', 'ROI', 'VAT', 'GST', 'PAYE',
  'YTD', 'MTD', 'QTD', 'FY', 'GAAP', 'IFRS', 'EBITDA', 'EBIT', 'COGS', 'WIP', 'FX',
  'AP', 'AR', 'FIFO', 'LIFO', 'SKU', 'B2B', 'B2C', 'CEO', 'CFO', 'COO', 'CTO',
  'USD', 'EUR', 'GBP', 'ZAR', 'AUD', 'NZD',
];

/** Case-insensitive word match against a list of registered abbreviations, returning the
 * registered entry's own exact casing (e.g. "CoA") — or null if the word isn't registered. */
function matchAbbreviation(word: string, abbreviations: readonly string[]): string | null {
  const lower = word.toLowerCase();
  return abbreviations.find((a) => a.toLowerCase() === lower) ?? null;
}

/** Same conversion as caseUtils.toProperCase, except a word matching a registered abbreviation
 * (seed list + this taxonomy's own custom list) is written back in its registered casing
 * instead of being Proper-Cased like an ordinary word. */
export function toProperCasePreservingAbbreviations(text: string, customAbbreviations: readonly string[]): string {
  const all = [...DEFAULT_ABBREVIATIONS, ...customAbbreviations];
  return text.replace(/\p{L}[\p{L}\p{N}'’]*/gu, (word) => {
    const known = matchAbbreviation(word, all);
    if (known) return known;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

/** Every distinct ALL-CAPS word (2+ letters, so a lone "A"/"I" doesn't count) in `text` that
 * ISN'T already a registered abbreviation — Format Descriptions' "prompt when not sure" list,
 * one entry per distinct word actually encountered. */
export function findUnknownAllCapsWords(text: string, customAbbreviations: readonly string[]): string[] {
  const all = [...DEFAULT_ABBREVIATIONS, ...customAbbreviations];
  const found = new Set<string>();
  for (const match of text.matchAll(/\b\p{L}[\p{L}\p{N}'’]*\b/gu)) {
    const word = match[0];
    if (word.length < 2) continue;
    if (!isAllCapsWord(word)) continue;
    if (matchAbbreviation(word, all)) continue;
    found.add(word);
  }
  return [...found];
}

function isAllCapsWord(word: string): boolean {
  return word === word.toUpperCase() && word !== word.toLowerCase();
}
