// Item 2: importing an existing taxonomy already built in the "correct format" — per James,
// each code column in its own adjacent column left to right, immediately followed by each
// description column in its own adjacent column. Real files James has supplied have no header
// row at all — they start straight into data — so structure (level count, delimiter positions,
// suffix columns) has to be inferred from the data itself, not read off column labels. This
// also happens to accept the richer, headered shape this app's own "Export to CSV — Discrete
// Columns" produces (gridExport.ts's buildDiscreteGrid) when a header row IS present, since
// that's a superset of the same basic layout. Metadata a CSV has no way to carry (title, table
// name, purpose) is collected separately once parsing succeeds (see App.tsx).

import type { SuffixField, TaxonomyRow } from './types';
import { MAX_LEVELS } from './types';

export interface ParsedDiscreteCsv {
  numLevels: number;
  delimiterPositions: number[];
  codeDelimiterChar: string;
  suffixes: SuffixField[];
  rows: TaxonomyRow[];
}

const CODE_CHARSET = new Set(['.', ..."0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split('')]);

// A minimal RFC4180-style CSV parser: quoted fields (with embedded commas/newlines/escaped
// "" for a literal quote) and bare fields, CRLF or bare LF line endings.
function parseCsvTable(text: string): string[][] {
  const table: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      // handled on the following \n, or ignored if the file uses bare \r (not expected here)
    } else if (c === '\n') {
      row.push(field);
      table.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    table.push(row);
  }
  // Drop stray fully-blank lines (a single empty field), most commonly a trailing newline at EOF.
  return table.filter((r) => !(r.length <= 1 && (r[0] ?? '') === ''));
}

// Builds the final rows/suffixes once every column's role (code / description / suffix value /
// note) is known, regardless of which detection path worked it out. `numLevels` is passed
// explicitly rather than inferred from codeCols.length, since the description-only path below
// has no code columns at all (numLevels there comes from the description columns instead).
function buildResult(
  dataRows: string[][],
  numLevels: number,
  codeCols: number[],
  descCols: number[],
  delimiterPositions: number[],
  codeDelimiterChar: string,
  suffixValueCols: number[],
  suffixDelimiterChars: string[],
  noteCol: number | null = null,
): ParsedDiscreteCsv {
  const suffixes: SuffixField[] = suffixValueCols.map((c, i) => {
    const maxLen = dataRows.reduce((m, r) => Math.max(m, (r[c] ?? '').length), 1);
    // James's ask for an imported old GL code column: "6 char but allow for 10" — a generous
    // ceiling, not a target width; every suffix here is still sized to the longest value the
    // file actually has (down to 1), this just raises how far that can stretch.
    return {
      width: Math.max(1, Math.min(10, maxLen)),
      delimiter: suffixDelimiterChars[i] || '-',
      mode: 'editable',
      constantValue: '',
    };
  });
  const rows: TaxonomyRow[] = dataRows
    .filter((r) => r.some((cell) => (cell ?? '').trim() !== ''))
    .map((r) => ({
      id: crypto.randomUUID(),
      codes: codeCols.length > 0 ? codeCols.map((c) => r[c] ?? '') : Array(numLevels).fill(''),
      descriptions: descCols.map((c) => r[c] ?? ''),
      suffixValues: suffixValueCols.map((c) => r[c] ?? ''),
      ...(noteCol !== null && (r[noteCol] ?? '').trim() !== '' ? { note: (r[noteCol] ?? '').trim() } : {}),
    }));
  return { numLevels, delimiterPositions, codeDelimiterChar, suffixes, rows };
}

// Tries reading table[0] as a genuine header row — numbered code/description columns ("1",
// "2", "3", ...), an optional blank spacer between the two blocks, and optional "Suffix N"
// columns — the shape this app's own CSV export produces. Returns null (not an error) on any
// mismatch, since a plain file with no header at all is just as valid; parseDiscreteCsv falls
// back to the data-driven detection below when this comes back empty-handed.
function tryParseHeaderedCsv(table: string[][]): ParsedDiscreteCsv | null {
  const header = table[0];
  const dataRows = table.slice(1);

  const codeCols: number[] = [];
  const codeDelimiterCols: number[] = [];
  let col = 0;
  let expect = 1;
  while (col < header.length) {
    const h = (header[col] ?? '').trim();
    if (h === String(expect)) {
      codeCols.push(col);
      expect++;
      col++;
      continue;
    }
    if (h === '') {
      let peek = col + 1;
      while (peek < header.length && (header[peek] ?? '').trim() === '') peek++;
      if (peek < header.length && (header[peek] ?? '').trim() === String(expect)) {
        codeDelimiterCols.push(col);
        col++;
        continue;
      }
    }
    break;
  }
  const numLevels = codeCols.length;
  if (numLevels === 0 || numLevels > MAX_LEVELS) return null;

  if ((header[col] ?? '').trim() === '') col++; // optional spacer column

  const descCols: number[] = [];
  let expectDesc = 1;
  while (col < header.length && expectDesc <= numLevels) {
    if ((header[col] ?? '').trim() === String(expectDesc)) {
      descCols.push(col);
      expectDesc++;
      col++;
    } else {
      break;
    }
  }
  if (descCols.length !== numLevels) return null;

  const suffixValueCols: number[] = [];
  const suffixDelimiterChars: string[] = [];
  let suffixIndex = 1;
  while (col < header.length) {
    if ((header[col] ?? '').trim() !== '') return null;
    const suffixCol = col + 1;
    if ((header[suffixCol] ?? '').trim() !== `Suffix ${suffixIndex}`) return null;
    suffixDelimiterChars.push(dataRows[0]?.[col] || '-');
    suffixValueCols.push(suffixCol);
    suffixIndex++;
    col += 2;
  }

  const delimiterPositions = codeDelimiterCols.map((dCol) => codeCols.filter((c) => c < dCol).length);
  const codeDelimiterChar = codeDelimiterCols.length > 0 ? dataRows[0]?.[codeDelimiterCols[0]] || '-' : '-';
  return buildResult(dataRows, numLevels, codeCols, descCols, delimiterPositions, codeDelimiterChar, suffixValueCols, suffixDelimiterChars);
}

// The single most frequent value in a list — used to decide "what character does this
// delimiter column actually use" even when a handful of rows don't have it.
function mostCommonValue(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0] ?? '';
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

// True when at least `threshold` of the rows' values in this column satisfy `predicate` — not
// unanimous agreement, since a real spreadsheet built by hand over years can easily have a
// handful of rows with a missing trailing padding character or similar slip (the actual file
// James supplied has exactly this: 9 rows out of 1840 short one padding column). Those rows
// still import — just with whatever's actually in that cell for them — rather than a few
// stray rows throwing off the detected shape of the other 99%.
function mostlyMatches(values: string[], predicate: (v: string) => boolean, threshold = 0.9): boolean {
  if (values.length === 0) return false;
  const matches = values.filter(predicate).length;
  return matches / values.length >= threshold;
}

// No header at all — every row, including what would otherwise look like "row 1", is data.
// Structure is inferred purely from the columns' own content: a run of columns that are
// (almost always) a single character from the code charset is the code block, optionally
// interrupted by columns that are (almost always) the same single non-code character — a
// delimiter. The first column that's blank in every row ends the code block; the description
// block is exactly the next `numLevels` columns after skipping any number of such blank
// columns (this app's own export has one; James's files have two). Anything left over that
// isn't blank in every row is treated as suffix data.
function parseHeaderlessCsv(table: string[][]): ParsedDiscreteCsv | { error: string } {
  const numCols = Math.max(...table.map((r) => r.length));
  const rows = table.map((r) => Array.from({ length: numCols }, (_, i) => r[i] ?? ''));
  const columnValues = (c: number) => rows.map((r) => r[c]);

  const codeCols: number[] = [];
  const delimiterCols: number[] = [];
  const delimiterChars: string[] = [];
  let col = 0;
  while (col < numCols) {
    const values = columnValues(col);
    if (mostlyMatches(values, (v) => v.length === 1 && CODE_CHARSET.has(v))) {
      codeCols.push(col);
      col++;
      continue;
    }
    const common = mostCommonValue(values.filter((v) => v !== ''));
    if (common.length === 1 && !CODE_CHARSET.has(common) && mostlyMatches(values, (v) => v === common)) {
      delimiterCols.push(col);
      delimiterChars.push(common);
      col++;
      continue;
    }
    break;
  }
  const numLevels = codeCols.length;
  if (numLevels === 0) {
    return {
      error:
        'Could not find any code columns (a run of columns each holding a single "." or code character) — this doesn\'t look like a taxonomy in code-columns/description-columns format.',
    };
  }
  if (numLevels > MAX_LEVELS) {
    return { error: `Detected ${numLevels} code columns, more than this tool supports (${MAX_LEVELS}).` };
  }

  // Skip however many consecutive columns are blank in every row — the spacer between the
  // code and description blocks. Different files use a different number of these (or none).
  while (col < numCols && rows.every((r) => r[col] === '')) col++;

  if (col + numLevels > numCols) {
    return {
      error: `Expected ${numLevels} description columns (matching the ${numLevels} code columns) after the code block, but only ${numCols - col} column(s) remain.`,
    };
  }
  const descCols = Array.from({ length: numLevels }, (_, i) => col + i);
  col += numLevels;

  // More blank filler, then anything with real content left becomes a suffix column — no
  // header to name its delimiter, so it defaults to "-".
  while (col < numCols && rows.every((r) => r[col] === '')) col++;
  const suffixValueCols: number[] = [];
  while (col < numCols) {
    if (rows.some((r) => r[col] !== '')) suffixValueCols.push(col);
    col++;
  }
  const suffixDelimiterChars = suffixValueCols.map(() => '-');

  const delimiterPositions = delimiterCols.map((dCol) => codeCols.filter((c) => c < dCol).length);
  const codeDelimiterChar = delimiterChars[0] || '-';
  return buildResult(rows, numLevels, codeCols, descCols, delimiterPositions, codeDelimiterChar, suffixValueCols, suffixDelimiterChars);
}

// James's elaboration on this shape: a GL-mapping tool's export ("GL Analyser") can carry the
// client's existing GL code, a confidence/certainty rating, and a reason/notes column after the
// "Level N" run — recognised by header name (case-insensitive), in this fixed order, each
// independently optional. Widened beyond one literal spelling each since there's no reason to
// assume every such export names them identically.
const OLD_CODE_HEADER_NAMES = ['old acc', 'old account', 'old code', 'old gl code', 'account code', 'gl code', 'client account code'];
const CERTAINTY_HEADER_NAMES = ['certainty', 'confidence'];
const NOTES_HEADER_NAMES = ['notes', 'note', 'reason / notes', 'reason', 'comments', 'comment'];

// James's real "GBG Chart of Accounts" export used "G/L Code" — punctuation the fixed candidate
// list above didn't have a literal entry for. Rather than chase every future spelling one at a
// time, normalise both sides down to bare letters/digits before comparing, so "G/L Code",
// "G.L. Code" and "gl code" all read the same.
function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchesHeader(header: string | undefined, candidates: string[]): boolean {
  const normalized = normalizeHeader(header ?? '');
  return candidates.some((c) => normalizeHeader(c) === normalized);
}

function isKnownTrailingHeader(header: string | undefined): boolean {
  return (
    matchesHeader(header, OLD_CODE_HEADER_NAMES) ||
    matchesHeader(header, CERTAINTY_HEADER_NAMES) ||
    matchesHeader(header, NOTES_HEADER_NAMES)
  );
}

// A file's deepest items sometimes overflow one (or more) columns past the last named "Level N"
// header — this app has no way to know that column's own name in advance (James's own GL
// Analyser export reuses "Account (from client CoA)" for exactly this, a column name that
// otherwise means something else entirely). Recognised structurally instead: a genuine extra
// level never holds text on the same row as the column immediately before it — it's one row's
// *next* level down, not a second value for the same entry — while a real trailing metadata
// column (an old code, say) is populated on the very rows where that last level is used.
function isOverflowDescriptionColumn(dataRows: string[][], col: number, prevDescCol: number): boolean {
  let sawBoth = false;
  let nonBlank = 0;
  for (const row of dataRows) {
    const cur = (row[col] ?? '').trim();
    if (cur) {
      nonBlank++;
      if ((row[prevDescCol] ?? '').trim()) {
        sawBoth = true;
        break;
      }
    }
  }
  return !sawBoth && nonBlank > 0;
}

const COMMENT_MIN_LENGTH = 60;
const COMMENT_LOWERCASE_RATIO = 0.5;

// James's report: some source files carry an explanatory comment as though it were its own
// entry — sitting alone in one description column, with no old code or certainty of its own
// (every real posting-level leaf has picked up at least one by the time a file reaches this
// stage) — meant to annotate the row immediately above it, not to stand as an entry in its own
// right. Recognised by long, prose-like text (mostly lower-case, well past a heading's usual
// length) rather than a short heading or item name.
function looksLikeCommentText(text: string): boolean {
  if (text.length <= COMMENT_MIN_LENGTH) return false;
  const letters = [...text].filter((c) => /[a-zA-Z]/.test(c));
  if (letters.length === 0) return false;
  const lower = letters.filter((c) => c === c.toLowerCase()).length;
  return lower / letters.length > COMMENT_LOWERCASE_RATIO;
}

// Folds each detected comment row into a Notes entry on the row directly above it (James: "move
// those into the notes column and move up one row against the heading"), then drops the comment
// row entirely. A comment row with nothing above it (the very first row in the file) has nowhere
// to attach to, so it's left as an ordinary row rather than silently discarded.
function mergeCommentRowsIntoNotesAbove(
  dataRows: string[][],
  descCols: number[],
  oldCodeCol: number | null,
  certaintyCol: number | null,
  noteCol: number | null,
): string[][] {
  if (noteCol === null) return dataRows;
  const result: string[][] = [];
  for (const row of dataRows) {
    const hasCodeOrCertainty =
      (oldCodeCol !== null && (row[oldCodeCol] ?? '').trim() !== '') ||
      (certaintyCol !== null && (row[certaintyCol] ?? '').trim() !== '');
    const descValues = descCols.map((c) => (row[c] ?? '').trim()).filter((v) => v !== '');
    const isCommentRow = !hasCodeOrCertainty && descValues.length === 1 && looksLikeCommentText(descValues[0]);
    if (isCommentRow && result.length > 0) {
      const previous = result[result.length - 1];
      const existingNote = (previous[noteCol] ?? '').trim();
      previous[noteCol] = existingNote ? `${existingNote} ${descValues[0]}` : descValues[0];
      continue;
    }
    result.push([...row]);
  }
  return result;
}

// A taxonomy with no codes at all yet — just a "Level 1", "Level 2", ... run of description
// columns (as many as the file actually has, in order — James's own ask: "bring in all
// columns"), optionally overflowing into further, arbitrarily-named description columns, then
// optionally an old GL code / a certainty rating / a reason-notes column, each independently
// optional (see the header-matching helpers above). This is deliberately its own detection path
// rather than folded into the code-column heuristics above: with zero code columns there's
// nothing for that logic to anchor on, and a codeless file is a completely unambiguous shape in
// its own right once the header names itself this way. Returns null (not an error) on any
// header mismatch, so parseDiscreteCsv's other two paths still get a turn.
function tryParseDescriptionOnlyCsv(table: string[][]): ParsedDiscreteCsv | null {
  const header = table[0];
  const dataRows = table.slice(1);

  const descCols: number[] = [];
  let col = 0;
  let expectLevel = 1;
  while (col < header.length) {
    // James's report: a real file numbered its first three columns "L1"/"L2"/"L3" then
    // switched to "Level 4" for the fourth — the abbreviated and spelled-out forms mixed
    // within the very same header row. Both are accepted at every position independently,
    // rather than committing to one style for a whole file.
    const h = (header[col] ?? '').trim().toLowerCase();
    if (h === `level ${expectLevel}` || h === `l${expectLevel}`) {
      descCols.push(col);
      expectLevel++;
      col++;
    } else {
      break;
    }
  }
  if (descCols.length === 0 || descCols.length > MAX_LEVELS) return null;

  while (descCols.length < MAX_LEVELS && col < header.length && !isKnownTrailingHeader(header[col])) {
    if (!isOverflowDescriptionColumn(dataRows, col, descCols[descCols.length - 1])) break;
    descCols.push(col);
    col++;
  }

  // James's report: a real GL Analyser export sometimes leaves a single unnamed, always-blank
  // column between the last "Level N" column and the trailing metadata ("Level 1,Level
  // 2,Level 3,,Notes") — the same spacer convention the other two CSV import paths already
  // tolerate. The overflow loop above already declines to consume it as a genuine extra level
  // (it's never populated, so isOverflowDescriptionColumn's nonBlank check fails), but nothing
  // was skipping over it before checking for old code/certainty/notes, so a file shaped exactly
  // like this fell through to "isn't this shape" and then to the headerless parser, which
  // rejected it outright with a "Could not find any code columns" error that has nothing to do
  // with the actual problem.
  while (col < header.length && (header[col] ?? '').trim() === '') col++;

  let oldCodeCol: number | null = null;
  if (col < header.length && matchesHeader(header[col], OLD_CODE_HEADER_NAMES)) {
    oldCodeCol = col;
    col++;
  }

  let certaintyCol: number | null = null;
  if (col < header.length && matchesHeader(header[col], CERTAINTY_HEADER_NAMES)) {
    certaintyCol = col;
    col++;
  }

  let noteCol: number | null = null;
  if (col < header.length) {
    if (!matchesHeader(header[col], NOTES_HEADER_NAMES)) return null;
    noteCol = col;
    col++;
  }
  if (col < header.length) return null; // anything else left over means this isn't this shape

  const mergedRows = mergeCommentRowsIntoNotesAbove(dataRows, descCols, oldCodeCol, certaintyCol, noteCol);
  const suffixValueCols = [oldCodeCol, certaintyCol].filter((c): c is number => c !== null);
  return buildResult(
    mergedRows,
    descCols.length,
    [],
    descCols,
    [],
    '-',
    suffixValueCols,
    suffixValueCols.map(() => '-'),
    noteCol,
  );
}

export function parseDiscreteCsv(text: string): ParsedDiscreteCsv | { error: string } {
  const table = parseCsvTable(text);
  if (table.length === 0) return { error: 'This file is empty.' };
  const result = tryParseHeaderedCsv(table) ?? tryParseDescriptionOnlyCsv(table) ?? parseHeaderlessCsv(table);
  // James's report: a file with one combined code per row (e.g. "2111" instead of one column per
  // code character) fails every path above with a generic "no code columns found" error that
  // gives no hint what to actually do about it — check whether parseCompositeCodeCsv (below)
  // would succeed on this exact file, and if so, redirect to the menu item built for it rather
  // than leaving the user stuck on a dead end.
  if ('error' in result && !('error' in parseCompositeCodeCsv(text))) {
    return {
      error:
        'This file has one combined code per row (e.g. "2111") rather than one column per code character — on the "Import CSV" menu, choose "Third Party Concatenated Codes" instead of "ERP Doctor Delimited Format" for this file.',
    };
  }
  return result;
}

// James's ask: "Separate Out Code Elements" — a file from another system that carries one
// composite/concatenated code per row (e.g. "2111") instead of this app's own one-character-
// per-column layout. Recognised by a plain "Code"/"Description" header pair (widened slightly,
// same normalise-and-compare approach as matchesHeader above, rather than one literal spelling
// each) — deliberately a separate, explicit import path rather than folded into
// parseDiscreteCsv's own detection, since a composite code column would otherwise just look like
// a column of over-long, non-single-character "code" values and fail every existing heuristic
// outright rather than risk being silently misread as something it isn't.
const COMPOSITE_CODE_HEADER_NAMES = ['code', 'account code', 'gl code', 'composite code', 'concatenated code', 'old code'];
const COMPOSITE_DESC_HEADER_NAMES = ['description', 'name', 'desc', 'account name'];

export interface ParsedCompositeCsvRow {
  /** One character per detected level, left to right, right-padded with "." to numLevels. */
  codeChars: string[];
  description: string;
}

export interface ParsedCompositeCsv {
  numLevels: number;
  rows: ParsedCompositeCsvRow[];
}

// Splits each row's composite code into one character per column and finds the deepest level
// actually reached — everything from there is exactly what buildSeparatedCsv (below) needs once
// the user has chosen where to put delimiters, which this function has no way to know on its own.
export function parseCompositeCodeCsv(text: string): ParsedCompositeCsv | { error: string } {
  const table = parseCsvTable(text);
  if (table.length === 0) return { error: 'This file is empty.' };
  const header = table[0];
  const dataRows = table.slice(1);

  const codeCol = header.findIndex((h) => matchesHeader(h, COMPOSITE_CODE_HEADER_NAMES));
  const descCol = header.findIndex((h) => matchesHeader(h, COMPOSITE_DESC_HEADER_NAMES));
  if (codeCol === -1 || descCol === -1) {
    return {
      error:
        'Could not find a "Code" column and a "Description" column in the header row — this import expects exactly one composite code column plus one description column.',
    };
  }

  const dataRowsWithContent = dataRows.filter(
    (r) => (r[codeCol] ?? '').trim() !== '' || (r[descCol] ?? '').trim() !== '',
  );
  const codeValues = dataRowsWithContent.map((r) => (r[codeCol] ?? '').trim());
  const numLevels = Math.max(0, ...codeValues.map((c) => c.length));
  if (numLevels === 0) {
    return { error: 'No code values found in the "Code" column.' };
  }
  if (numLevels > MAX_LEVELS) {
    return { error: `Detected codes up to ${numLevels} characters long, more than this tool supports (${MAX_LEVELS}).` };
  }

  const rows: ParsedCompositeCsvRow[] = dataRowsWithContent.map((r) => {
    const code = (r[codeCol] ?? '').trim();
    const codeChars = Array.from({ length: numLevels }, (_, i) => code[i] ?? '.');
    return { codeChars, description: (r[descCol] ?? '').trim() };
  });

  return { numLevels, rows };
}

// Turns a parsed composite-code file into the same shape every other import path produces, once
// the user has chosen delimiter positions and a delimiter character (SeparateCodeElementsSetup.tsx)
// — reusing CsvImportConfirm/handleCsvImportConfirm downstream exactly as-is. A row's level (and
// so which description column its text lands in) is wherever its own code stops before running
// into trailing "." padding — the same convention the rest of this app already uses for "." as
// the universal blank/no-further-hierarchy marker, independent of whatever padding character the
// taxonomy is ultimately configured to use.
export function buildSeparatedCsv(
  parsed: ParsedCompositeCsv,
  delimiterPositions: number[],
  codeDelimiterChar: string,
): ParsedDiscreteCsv {
  const rows: TaxonomyRow[] = parsed.rows.map((r) => {
    let level = 0;
    for (let i = r.codeChars.length - 1; i >= 0; i--) {
      if (r.codeChars[i] !== '.') {
        level = i;
        break;
      }
    }
    const descriptions = Array(parsed.numLevels).fill('');
    descriptions[level] = r.description;
    return {
      id: crypto.randomUUID(),
      codes: [...r.codeChars],
      descriptions,
      suffixValues: [],
    };
  });
  return { numLevels: parsed.numLevels, delimiterPositions, codeDelimiterChar, suffixes: [], rows };
}

// James's ask: "Multi-Column Description Table Without Code" -- his HDD folder-structure export
// (no header row, no code columns at all): one column per hierarchy level, and each row has
// exactly ONE populated cell, whose column position IS that row's level (matching indentation by
// position rather than by any marker). Neither existing path fits this shape: the headerless
// code-column detector (parseHeaderlessCsv) has no code columns to anchor on at all, and the
// headered description-only path (tryParseDescriptionOnlyCsv) requires "Level 1"/"L1" column
// headers this file doesn't have. Recognised structurally instead, the same way
// parseHeaderlessCsv recognises its own shape: no header assumed, every row is data.
export function parseMultiColumnDescriptionCsv(text: string): ParsedDiscreteCsv | { error: string } {
  const table = parseCsvTable(text);
  if (table.length === 0) return { error: 'This file is empty.' };
  const numCols = Math.max(...table.map((r) => r.length));
  if (numCols > MAX_LEVELS) {
    return { error: `This file has ${numCols} columns, more than this tool supports (${MAX_LEVELS}).` };
  }

  const dataRows: string[][] = [];
  for (let i = 0; i < table.length; i++) {
    const row = table[i];
    const populated: number[] = [];
    for (let c = 0; c < numCols; c++) {
      if ((row[c] ?? '').trim() !== '') populated.push(c);
    }
    if (populated.length === 0) continue; // a blank line -- skip rather than error
    if (populated.length > 1) {
      return {
        error: `Row ${i + 1} has more than one populated column (expected exactly one per row, at the position matching its level in the hierarchy) — this doesn't look like a Multi-Column Description Table Without Code file.`,
      };
    }
    dataRows.push(row);
  }
  if (dataRows.length === 0) return { error: 'No data rows found in this file.' };

  const numLevels = numCols;
  const descCols = Array.from({ length: numLevels }, (_, i) => i);
  return buildResult(dataRows, numLevels, [], descCols, [], '-', [], []);
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read this file.'));
    reader.readAsText(file);
  });
}
