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
    return {
      width: Math.max(1, Math.min(8, maxLen)),
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

// A taxonomy with no codes at all yet — just a "Level 1", "Level 2", ... run of description
// columns (as many as the file actually has, in order — James's own ask: "bring in all
// columns"), optionally followed by a "Notes" column. This is deliberately its own detection
// path rather than folded into the code-column heuristics above: with zero code columns there's
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
    if ((header[col] ?? '').trim().toLowerCase() === `level ${expectLevel}`) {
      descCols.push(col);
      expectLevel++;
      col++;
    } else {
      break;
    }
  }
  if (descCols.length === 0 || descCols.length > MAX_LEVELS) return null;

  let noteCol: number | null = null;
  if (col < header.length) {
    if ((header[col] ?? '').trim().toLowerCase() !== 'notes') return null;
    noteCol = col;
    col++;
  }
  if (col < header.length) return null; // anything else left over means this isn't this shape

  return buildResult(dataRows, descCols.length, [], descCols, [], '-', [], [], noteCol);
}

export function parseDiscreteCsv(text: string): ParsedDiscreteCsv | { error: string } {
  const table = parseCsvTable(text);
  if (table.length === 0) return { error: 'This file is empty.' };
  return tryParseHeaderedCsv(table) ?? tryParseDescriptionOnlyCsv(table) ?? parseHeaderlessCsv(table);
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read this file.'));
    reader.readAsText(file);
  });
}
