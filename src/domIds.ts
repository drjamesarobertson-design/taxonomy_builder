// DOM element ids for grid cells — shared between Grid.tsx (which renders them) and
// GuidanceBanner.tsx (which occasionally needs to focus one directly, e.g. dropping the
// cursor onto a duplicate code the coding stage just found). Kept in their own module rather
// than exported from Grid.tsx so that file can stay component-only (fast-refresh friendly).
export const codeInputId = (level: number, rowId: string) => `code-${level}-${rowId}`;
export const descInputId = (level: number, rowId: string) => `desc-${level}-${rowId}`;
