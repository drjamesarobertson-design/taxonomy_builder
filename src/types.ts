// Data model for a taxonomy project, per CLAUDE.md Section 4 (data model) and Section 8 (persistence).

/** Internal cap on how many code/description levels a taxonomy can have. */
export const MAX_LEVELS = 15;

// Item 1: a per-taxonomy restriction on what a *real* (non-padding) code character may be,
// narrower than the fixed global charset (".", 0-9, a-z, A-Z). The padding character itself
// is always exempt — it marks "no further hierarchy here", not a code value, so it stays
// enterable no matter which restriction is active.
export const CODE_RESTRICTIONS = [
  'Numeric Only',
  'Alpha Numeric with All Alpha',
  'Alpha Numeric with Upper Case Alpha Only',
  'Alpha Upper Case Only',
  'Alpha Both Cases Only',
] as const;

export type CodeRestriction = (typeof CODE_RESTRICTIONS)[number];

// The sign-on landing menu's six starting points for a new taxonomy (WorkflowMenu). All six
// currently open the same taxonomy setup screen — per-level guided workflows (hiding/revealing
// columns, step-by-step prompts) are the next piece of work, not yet built.
export const WORKFLOW_LEVELS = [
  'Simple Taxonomy',
  'Intermediate Complexity Taxonomy',
  'Advanced Complexity Taxonomy',
  'Chart of Accounts',
  'Item Master',
  'Highly Experienced User — No Guidance',
] as const;

export type WorkflowLevel = (typeof WORKFLOW_LEVELS)[number];

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
  /** Item 1: narrows which characters a real code may use, beyond the fixed global charset.
   * Defaults to 'Alpha Numeric with All Alpha' — the full existing charset, i.e. unrestricted —
   * so older project files without this field behave exactly as before. */
  codeRestriction: CodeRestriction;
  /**
   * Lock Taxonomy: once a taxonomy has gone live in an ERP and carries real transactions
   * against its codes, further free-form editing risks corrupting that history. Locking
   * marks every row currently in the table `protected` (see TaxonomyRow) and switches on:
   * no editing an existing (protected) row's own code or description, no deleting one
   * (Mark as Delete instead), and new rows can only be inserted where an actual code gap
   * exists between neighbours. Unlocking clears none of that history — it only lifts the
   * enforcement, so the taxonomy can be worked on again (with an explicit warning).
   */
  locked: boolean;
}

export interface TaxonomyRow {
  id: string;
  /** One entry per level; each entry is a single character or ''. */
  codes: string[];
  /** One entry per level; only the column matching the row's deepest level is expected to hold text. */
  descriptions: string[];
  /** One entry per configured suffix column; only meaningful where that suffix is 'editable'. */
  suffixValues: string[];
  /**
   * Lock Taxonomy: set true on every row present at the moment the taxonomy was last locked
   * (see TaxonomySettings.locked). Persists across a later Unlock — it's a permanent record
   * of "this row existed when this taxonomy was live", not a live enforcement switch — so a
   * protected row stays visually flagged (greyed out) even after unlocking, while a
   * subsequent Lock sweeps in any rows added or left unprotected since.
   */
  protected?: boolean;
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
  codeRestriction: 'Alpha Numeric with All Alpha',
  locked: false,
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

// Grows every row's codes/descriptions arrays to a new (larger) column count, padding with ''
// — used whenever numLevels increases, whether from Import Block needing more depth or from
// adding columns directly (Settings, or the grid's own right-click "Add Column"). Never shrinks
// — a caller wanting fewer columns is responsible for confirming that's actually safe first.
export function growRowsToLevels(rows: TaxonomyRow[], newNumLevels: number): TaxonomyRow[] {
  return rows.map((row) => {
    const pad = newNumLevels - row.codes.length;
    if (pad <= 0) return row;
    return {
      ...row,
      codes: [...row.codes, ...Array(pad).fill('')],
      descriptions: [...row.descriptions, ...Array(pad).fill('')],
    };
  });
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
