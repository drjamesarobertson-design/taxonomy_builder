// Case convention helpers, per CLAUDE.md Section 4.3 and the Toggle Case action (6.2).

export function isAllCaps(text: string): boolean {
  return text.length > 0 && text === text.toUpperCase() && text !== text.toLowerCase();
}

export function toProperCase(text: string): string {
  return text.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

export function toggleCase(text: string): string {
  if (!text) return text;
  return isAllCaps(text) ? toProperCase(text) : text.toUpperCase();
}
