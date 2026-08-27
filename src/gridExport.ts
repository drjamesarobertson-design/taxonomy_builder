// Raw-grid ("Discrete Columns") export, per CLAUDE.md Section 7: the grid exactly as it
// appears on screen — one column per code-character position (including the delimiter,
// exported as a literal "-"), followed by one column per description level. No
// concatenation or padding substitution — that's explicitly deferred (Section 9).

import type { TaxonomyProject, TaxonomyRow } from './types';
import { getLevelColor } from './colors';
import { downloadBlob } from './download';

type ExportColumn = { type: 'code' | 'desc'; level: number } | { type: 'delimiter' };

function buildExportColumns(numLevels: number, delimiterPositions: number[]): ExportColumn[] {
  const columns: ExportColumn[] = [];
  for (let level = 0; level < numLevels; level++) {
    columns.push({ type: 'code', level });
    if (delimiterPositions.includes(level + 1)) columns.push({ type: 'delimiter' });
  }
  for (let level = 0; level < numLevels; level++) {
    columns.push({ type: 'desc', level });
  }
  return columns;
}

function buildDiscreteGrid(project: TaxonomyProject): { header: string[]; rows: string[][]; columns: ExportColumn[] } {
  const { numLevels, delimiterPositions } = project.settings;
  const columns = buildExportColumns(numLevels, delimiterPositions);
  const header = columns.map((c) => (c.type === 'delimiter' ? '' : String(c.level + 1)));
  const rows = project.rows.map((row) =>
    columns.map((c) => {
      if (c.type === 'delimiter') return '-';
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
// Specifics James left to our judgement:
// - Code: trimmed to the row's own significant depth (codes[0..level] joined with no
//   delimiters or trailing padding), e.g. "1","2","3" becomes "123" — not the full
//   configured column width.
// - Description: the row's own text only (not a breadcrumb of its ancestors'
//   descriptions), indent-padded with one leading space per level above the top, so depth
//   is visible at a glance — e.g. a level-3 entry becomes "  Sales Income".
// Rows with no description at all (level -1) are skipped — there's nothing to export.
function buildConcatenatedGrid(project: TaxonomyProject): { header: string[]; rows: string[][] } {
  const rows: string[][] = [];
  for (const row of project.rows) {
    const level = levelOf(row);
    if (level === -1) continue;
    const code = row.codes.slice(0, level + 1).join('');
    const description = ' '.repeat(level) + (row.descriptions[level] ?? '');
    rows.push([code, description]);
  }
  return { header: ['Code', 'Description'], rows };
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function exportFilename(project: TaxonomyProject, extension: string): string {
  return `${project.tableName || project.title || 'taxonomy'}.${extension}`;
}

export function exportDiscreteCsv(project: TaxonomyProject): void {
  const { header, rows } = buildDiscreteGrid(project);
  const csv = [header, ...rows].map((line) => line.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, exportFilename(project, 'csv'));
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
  for (const rowValues of rows) sheet.addRow(rowValues);

  // Column colour-coding and delimiter styling, matching the on-screen grid (Section 4.2/7).
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
    excelCol.width = col.type === 'code' ? 4 : 24;
    excelCol.alignment = { horizontal: col.type === 'code' ? 'center' : 'left' };
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
  downloadBlob(blob, exportFilename(project, 'xlsx'));
}

export function exportConcatenatedCsv(project: TaxonomyProject): void {
  const { header, rows } = buildConcatenatedGrid(project);
  const csv = [header, ...rows].map((line) => line.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, exportFilename(project, 'csv'));
}

export async function exportConcatenatedXlsx(project: TaxonomyProject): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const { header, rows } = buildConcatenatedGrid(project);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet((project.tableName || 'Taxonomy').slice(0, 31));

  const headerRow = sheet.addRow(header);
  headerRow.font = { bold: true };
  for (const rowValues of rows) sheet.addRow(rowValues);
  sheet.getColumn(1).width = 14;
  sheet.getColumn(2).width = 50;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(blob, exportFilename(project, 'xlsx'));
}
