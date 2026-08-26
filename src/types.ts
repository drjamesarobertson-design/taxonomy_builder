// Data model for a taxonomy project, per CLAUDE.md Section 4 (data model) and Section 8 (persistence).

export interface TaxonomySettings {
  /** Number of hierarchy levels (code columns / description columns). Default 8. */
  numLevels: number;
  /** How many code columns appear before the single fixed delimiter column. Default 3. */
  delimiterAfter: number;
  /** Character used to pad unused code positions. Default '.'. */
  paddingChar: string;
  /** Maximum ERP description field length, captured at taxonomy creation (Section 6.7). */
  maxDescriptionLength: number;
}

export interface TaxonomyRow {
  id: string;
  /** One entry per level; each entry is a single character or ''. */
  codes: string[];
  /** One entry per level; only the column matching the row's deepest level is expected to hold text. */
  descriptions: string[];
}

export interface TaxonomyProject {
  /** Project file format version, for forward compatibility. */
  version: 1;
  title: string;
  tableName: string;
  purpose: string;
  settings: TaxonomySettings;
  rows: TaxonomyRow[];
}

export const DEFAULT_SETTINGS: TaxonomySettings = {
  numLevels: 8,
  delimiterAfter: 3,
  paddingChar: '.',
  maxDescriptionLength: 40,
};

export function createEmptyRow(numLevels: number): TaxonomyRow {
  return {
    id: crypto.randomUUID(),
    codes: Array(numLevels).fill(''),
    descriptions: Array(numLevels).fill(''),
  };
}

export function createProject(
  title: string,
  tableName: string,
  purpose: string,
  maxDescriptionLength: number,
): TaxonomyProject {
  return {
    version: 1,
    title,
    tableName,
    purpose,
    settings: { ...DEFAULT_SETTINGS, maxDescriptionLength },
    rows: [],
  };
}
