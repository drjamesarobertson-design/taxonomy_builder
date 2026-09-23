// Case convention helpers, per CLAUDE.md Section 4.3 and the Toggle Case action (6.2).

import { toProperCasePreservingAbbreviations } from './abbreviations';

export function isAllCaps(text: string): boolean {
  return text.length > 0 && text === text.toUpperCase() && text !== text.toLowerCase();
}

export function toProperCase(text: string): string {
  return text.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

// James's report: right-click "Toggle Case" on an ALL-CAPS entry containing "ERP" turned it
// into "Erp" — this went through the plain toProperCase above, which has no notion of
// abbreviations at all (that's Format Descriptions' own job, formatDescriptions.ts). Toggle
// Case is a single quick action rather than a batch run, so it doesn't prompt for unknown
// words the way Format Descriptions does — it just recognises whatever's already known (the
// seed list plus this taxonomy's own saved customAbbreviations) and leaves anything else to
// ordinary Proper Case, same as before.
export function toggleCase(text: string, customAbbreviations: readonly string[] = []): string {
  if (!text) return text;
  return isAllCaps(text) ? toProperCasePreservingAbbreviations(text, customAbbreviations) : text.toUpperCase();
}
