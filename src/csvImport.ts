// Item 2: importing an existing taxonomy already built in the "correct format" — codes in
// separate columns, descriptions in separate columns — the same shape this app's own
// "Export to CSV — Discrete Columns" produces (gridExport.ts's buildDiscreteGrid): a code
// column per level, optional single-character delimiter columns interspersed among them, one
// blank spacer column, a description column per level, then any suffix columns each preceded
// by their own delimiter column. Structure (level count, delimiter positions, suffix count and
// widths) is inferred entirely from the header row's own numbering and the data — nothing
// about it needs to be typed in by hand. Metadata the CSV has no way to carry (title, table
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

export function parseDiscreteCsv(text: string): ParsedDiscreteCsv | { error: string } {
  const table = parseCsvTable(text);
  if (table.length === 0) return { error: 'This file is empty.' };
  const header = table[0];
  const dataRows = table.slice(1);

  // The code block: columns numbered 1, 2, 3, ... — a blank header column in between is a
  // code-delimiter column, kept only when the numbering keeps going afterward (otherwise
  // that blank is the spacer between the code and description blocks, and the block is done).
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
  if (numLevels === 0) {
    return { error: 'Could not find numbered code columns (1, 2, 3, ...) in the header row — this doesn\'t look like a Discrete Columns export.' };
  }
  if (numLevels > MAX_LEVELS) {
    return { error: `Detected ${numLevels} code columns, more than this tool supports (${MAX_LEVELS}).` };
  }

  // The single blank spacer column between the code and description blocks.
  if ((header[col] ?? '').trim() !== '') {
    return { error: 'Expected a blank spacer column between the code and description columns.' };
  }
  col++;

  // The description block: the same 1..numLevels numbering, immediately following.
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
  if (descCols.length !== numLevels) {
    return {
      error: `Expected ${numLevels} description columns (matching the ${numLevels} code columns) but found ${descCols.length}.`,
    };
  }

  // Optional suffix columns: each is a (blank-header delimiter, "Suffix N") pair.
  const suffixValueCols: number[] = [];
  const suffixDelimiterChars: string[] = [];
  let suffixIndex = 1;
  while (col < header.length) {
    if ((header[col] ?? '').trim() !== '') {
      return { error: `Unexpected column header "${header[col]}" after the description columns.` };
    }
    const suffixCol = col + 1;
    const suffixHeader = (header[suffixCol] ?? '').trim();
    if (suffixHeader !== `Suffix ${suffixIndex}`) {
      return {
        error: `Expected a "Suffix ${suffixIndex}" column after the description columns but found "${suffixHeader || '(blank)'}".`,
      };
    }
    suffixDelimiterChars.push(dataRows[0]?.[col] || '-');
    suffixValueCols.push(suffixCol);
    suffixIndex++;
    col += 2;
  }

  const delimiterPositions = codeDelimiterCols.map((dCol) => codeCols.filter((c) => c < dCol).length);
  const codeDelimiterChar = codeDelimiterCols.length > 0 ? dataRows[0]?.[codeDelimiterCols[0]] || '-' : '-';
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
      codes: codeCols.map((c) => r[c] ?? ''),
      descriptions: descCols.map((c) => r[c] ?? ''),
      suffixValues: suffixValueCols.map((c) => r[c] ?? ''),
    }));

  return { numLevels, delimiterPositions, codeDelimiterChar, suffixes, rows };
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read this file.'));
    reader.readAsText(file);
  });
}
