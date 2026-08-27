// Raw-grid ("Discrete Columns") export, per CLAUDE.md Section 7: the grid exactly as it
// appears on screen — one column per code-character position (including the delimiter,
// exported as a literal "-"), followed by one column per description level. No
// concatenation or padding substitution — that's explicitly deferred (Section 9).

import type { TaxonomyProject, TaxonomyRow } from './types';
import { getLevelColor } from './colors';
import { saveExportFile } from './exportFolder';

type ExportColumn = { type: 'code' | 'desc'; level: number } | { type: 'delimiter' } | { type: 'gap' };

function buildExportColumns(numLevels: number, delimiterPositions: number[]): ExportColumn[] {
  const columns: ExportColumn[] = [];
  for (let level = 0; level < numLevels; level++) {
    columns.push({ type: 'code', level });
    if (delimiterPositions.includes(level + 1)) columns.push({ type: 'delimiter' });
  }
  // A blank spacer column between the code block and the description block, matching the
  // on-screen grid's own gap column under the "Code" / "Description" section headings
  // (Section 7: the export should match the working view exactly).
  columns.push({ type: 'gap' });
  for (let level = 0; level < numLevels; level++) {
    columns.push({ type: 'desc', level });
  }
  return columns;
}

function buildDiscreteGrid(project: TaxonomyProject): { header: string[]; rows: string[][]; columns: ExportColumn[] } {
  const { numLevels, delimiterPositions } = project.settings;
  const columns = buildExportColumns(numLevels, delimiterPositions);
  const header = columns.map((c) => (c.type === 'code' || c.type === 'desc' ? String(c.level + 1) : ''));
  const rows = project.rows.map((row) =>
    columns.map((c) => {
      if (c.type === 'delimiter') return '-';
      if (c.type === 'gap') return '';
      if (c.type === 'code') return row.codes[c.level] ?? '';
      return row.descriptions[c.level] ?? '';
    }),
  );
  return { header, rows, columns };
}

// A row's level is the position of its deepest populated description column (Section 4.1);
// -1 means the row has no description at all yet, so there's nothing to export for it.
function levelOf(row: TaxonomyRow): number {
  for (let i = row.descriptions.length - 1; i >= 0; i--) {
    if ((row.descriptions[i] ?? '').trim()) return i;
  }
  return -1;
}

// "Concatenated" export (Section 9, item 1 — out of v1's original scope, but James asked
// for it): one combined Code column and one combined Description column per posting-level
// row, ready to feed an ERP import, rather than one column per level.
//
// - Code: the row's full, fixed-width code exactly as it appears in the grid — including
//   any trailing padding characters the user has entered — not trimmed to the row's own
//   depth, so a fixed-length ERP code field still lines up.
// - Description: the row's own text only (not a breadcrumb of its ancestors'
//   descriptions), indented with one leading copy of the taxonomy's configured indent
//   character per level above the top (a space by default, or another ASCII character set
//   on the New Taxonomy form), so depth is visible at a glance.
// Rows with no description at all (level -1) are skipped — there's nothing to export.
function buildConcatenatedGrid(project: TaxonomyProject): { header: string[]; rows: string[][] } {
  const indentChar = project.settings.indentChar || ' ';
  const rows: string[][] = [];
  for (const row of project.rows) {
    const level = levelOf(row);
    if (level === -1) continue;
    const code = row.codes.join('');
    const description = indentChar.repeat(level) + (row.descriptions[level] ?? '');
    rows.push([code, description]);
  }
  return { header: ['Code', 'Description'], rows };
}

// Excel has no equivalent of the on-screen grid's text-overflow-into-the-next-cell trick, so
// the closest match to "the column looks as wide as it needs to be, same as the grid" is an
// auto-fit: each column sized to its own longest value (header included), clamped to a
// sensible range.
function autoFitWidth(header: string, values: string[], min: number, max: number): number {
  const longest = values.reduce((longestSoFar, v) => Math.max(longestSoFar, v.length), header.length);
  return Math.min(max, Math.max(min, longest + 2));
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// File names carry a descriptor of which export they are, since a taxonomy typically ends
// up with several files side by side in the same folder — e.g. "Further Milling.json" (the
// save file, for reuse) alongside "Further Milling Per Column.csv" and "Further Milling
// Concatenated.xlsx".
function exportFilename(project: TaxonomyProject, descriptor: string, extension: string): string {
  const base = project.tableName || project.title || 'taxonomy';
  return `${base} ${descriptor}.${extension}`;
}

export async function exportDiscreteCsv(project: TaxonomyProject): Promise<void> {
  const { header, rows } = buildDiscreteGrid(project);
  const csv = [header, ...rows].map((line) => line.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  await saveExportFile(blob, exportFilename(project, 'Per Column', 'csv'));
}

export async function exportDiscreteXlsx(project: TaxonomyProject): Promise<void> {
  // exceljs is a large dependency needed only for this one export path — code-split so it
  // doesn't inflate the initial bundle for everyone who never exports to Excel.
  const ExcelJS = (await import('exceljs')).default;
  const { header, rows, columns } = buildDiscreteGrid(project);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet((project.tableName || 'Taxonomy').slice(0, 31));

  const headerRow = sheet.addRow(header);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: 'center' };
  // A blank string value still writes an actual (empty) cell in the xlsx — Excel treats that
  // as "has content" and refuses to spill a neighbouring cell's overflow text into it. Writing
  // null instead leaves the cell with no value at all, which is what the overflow trick below
  // actually needs.
  for (const rowValues of rows) sheet.addRow(rowValues.map((v) => (v === '' ? null : v)));

  // Column colour-coding and delimiter styling, matching the on-screen grid (Section 4.2/7).
  //
  // Column widths: with text wrap off (the default — nothing here turns it on), a cell whose
  // text is wider than its column spills into the next cell to the right for as long as that
  // neighbour stays empty, the same trick the on-screen grid itself relies on. Since only one
  // description column ever holds text on any given row (Section 4.1), every other
  // description column on that row is empty and free to spill into — so every code column and
  // every description column except the last can be narrowed right down, and only the last
  // description column (with no column to its right to spill into) needs to stay auto-fit to
  // its own longest value.
  const NARROW_WIDTH = 1.5;
  const lastDescLevel = project.settings.numLevels - 1;
  columns.forEach((col, colIndex) => {
    const excelCol = sheet.getColumn(colIndex + 1);
    if (col.type === 'delimiter') {
      excelCol.width = 3;
      excelCol.alignment = { horizontal: 'center' };
      excelCol.eachCell((cell, rowNumber) => {
        if (rowNumber > 1) cell.font = { color: { argb: 'FF999999' } };
      });
      return;
    }
    if (col.type === 'gap') {
      excelCol.width = 3;
      return;
    }
    const isCode = col.type === 'code';
    const staysWide = col.type === 'desc' && col.level === lastDescLevel;
    excelCol.width = staysWide
      ? autoFitWidth(header[colIndex], rows.map((r) => r[colIndex]), 8, 60)
      : NARROW_WIDTH;
    excelCol.alignment = { horizontal: isCode ? 'center' : 'left' };
    const hex = getLevelColor(col.level);
    if (!hex) return;
    const argb = `FF${hex.replace('#', '').toUpperCase()}`;
    excelCol.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  await saveExportFile(blob, exportFilename(project, 'Per Column', 'xlsx'));
}

export async function exportConcatenatedCsv(project: TaxonomyProject): Promise<void> {
  const { header, rows } = buildConcatenatedGrid(project);
  const csv = [header, ...rows].map((line) => line.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  await saveExportFile(blob, exportFilename(project, 'Concatenated', 'csv'));
}

export async function exportConcatenatedXlsx(project: TaxonomyProject): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const { header, rows } = buildConcatenatedGrid(project);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet((project.tableName || 'Taxonomy').slice(0, 31));

  const headerRow = sheet.addRow(header);
  headerRow.font = { bold: true };
  for (const rowValues of rows) sheet.addRow(rowValues);
  sheet.getColumn(1).width = autoFitWidth(header[0], rows.map((r) => r[0]), 8, 30);
  sheet.getColumn(2).width = autoFitWidth(header[1], rows.map((r) => r[1]), 20, 80);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  await saveExportFile(blob, exportFilename(project, 'Concatenated', 'xlsx'));
}
