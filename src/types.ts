// Data model for a taxonomy project, per CLAUDE.md Section 4 (data model) and Section 8 (persistence).

/** Internal cap on how many code/description levels a taxonomy can have. */
export const MAX_LEVELS = 15;

export interface SuffixField {
  /** Max characters this suffix column can hold (1 to 8). */
  width: number;
  /** Single-character delimiter shown immediately before this suffix column. Default '-'. */
  delimiter: string;
  /** 'constant': one value, set here, applies to every row and isn't edited in the grid.
   *  'editable': each row holds its own value, edited directly in the grid like a description. */
  mode: 'constant' | 'editable';
  /** Only meaningful when mode === 'constant' — the value shown (and exported) for every row. */
  constantValue: string;
}

export interface TaxonomySettings {
  /** Number of hierarchy levels (code columns / description columns). Default 8, max 15. */
  numLevels: number;
  /**
   * Code-column counts after which a delimiter appears (e.g. [3, 6] puts one after the
   * 3rd and another after the 6th code column). Delimiters are optional — an empty array
   * means none. Set at taxonomy creation via a sequence of "insert a delimiter?" prompts.
   */
  delimiterPositions: number[];
  /**
   * Character used to pad unused code positions. Default '.'; some ERPs won't accept "."
   * in a code field, in which case "0" should be used instead (Section 4.4).
   */
  paddingChar: string;
  /** Character used for the code-column delimiters (Section 4.1). Default '-'; some ERPs
   * need a different character in a code field. Independent of each suffix's own delimiter. */
  codeDelimiterChar: string;
  /** Maximum ERP description field length, captured at taxonomy creation (Section 6.7). */
  maxDescriptionLength: number;
  /**
   * Character used as the per-level leading indent in Concatenated exports (Section 9).
   * Default a single space (ASCII 32); some ERPs prefer a visible character such as "_"
   * instead, since leading spaces can be trimmed on import.
   */
  indentChar: string;
  /**
   * User-defined suffix columns (0 to 6) appended after the wide description column on the
   * working screen and in the Discrete Columns export, each preceded by its own delimiter.
   */
  suffixes: SuffixField[];
}

export interface TaxonomyRow {
  id: string;
  /** One entry per level; each entry is a single character or ''. */
  codes: string[];
  /** One entry per level; only the column matching the row's deepest level is expected to hold text. */
  descriptions: string[];
  /** One entry per configured suffix column; only meaningful where that suffix is 'editable'. */
  suffixValues: string[];
}

export interface TaxonomyProject {
  /** Project file format version, for forward compatibility. */
  version: 1;
  title: string;
  tableName: string;
  purpose: string;
  settings: TaxonomySettings;
  rows: TaxonomyRow[];
  /**
   * Per-output-file save/export counters, keyed by a stable id for each producible file
   * (the project save, and each export format/layout combination). Incremented every time
   * that particular file is written, and used to build its " v1.NN" filename suffix.
   */
  fileVersions: Record<string, number>;
}

export const DEFAULT_SETTINGS: TaxonomySettings = {
  numLevels: 8,
  delimiterPositions: [3],
  paddingChar: '.',
  codeDelimiterChar: '-',
  maxDescriptionLength: 40,
  indentChar: ' ',
  suffixes: [],
};

export function createEmptyRow(numLevels: number, suffixes: SuffixField[] = []): TaxonomyRow {
  return {
    id: crypto.randomUUID(),
    codes: Array(numLevels).fill(''),
    descriptions: Array(numLevels).fill(''),
    // A "constant" suffix seeds every new row with its configured default value — still
    // editable per row from there (e.g. to duplicate a different value across a later block
    // of rows) rather than being locked to one value for the whole taxonomy.
    suffixValues: suffixes.map((s) => (s.mode === 'constant' ? s.constantValue : '')),
  };
}

export function createProject(
  title: string,
  tableName: string,
  purpose: string,
  maxDescriptionLength: number,
  delimiterPositions: number[],
  indentChar: string = ' ',
  numLevels: number = DEFAULT_SETTINGS.numLevels,
  suffixes: SuffixField[] = [],
  paddingChar: string = DEFAULT_SETTINGS.paddingChar,
  codeDelimiterChar: string = DEFAULT_SETTINGS.codeDelimiterChar,
): TaxonomyProject {
  return {
    version: 1,
    title,
    tableName,
    purpose,
    settings: {
      ...DEFAULT_SETTINGS,
      maxDescriptionLength,
      delimiterPositions,
      indentChar,
      numLevels,
      suffixes,
      paddingChar,
      codeDelimiterChar,
    },
    rows: [],
    fileVersions: {},
  };
}
