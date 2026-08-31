// Raw-grid ("Discrete Columns") export, per CLAUDE.md Section 7: the grid exactly as it
// appears on screen — one column per code-character position (including the delimiter,
// exported as a literal "-"), followed by one column per description level, followed by any
// configured suffix columns (each with its own delimiter). No concatenation or padding
// substitution for the main code/description columns — that's explicitly deferred (Section 9).

import type { TaxonomyProject, TaxonomyRow } from './types';
import { getLevelColor } from './colors';
import { saveExportFile } from './exportFolder';
import { bumpFileVersion } from './fileVersion';

type ExportColumn =
  | { type: 'code'; level: number }
  | { type: 'desc'; level: number }
  | { type: 'delimiter'; char: string }
  | { type: 'gap' }
  | { type: 'suffix'; index: number };

function buildExportColumns(project: TaxonomyProject): ExportColumn[] {
  const { numLevels, delimiterPositions, suffixes, codeDelimiterChar } = project.settings;
  const columns: ExportColumn[] = [];
  for (let level = 0; level < numLevels; level++) {
    columns.push({ type: 'code', level });
    if (delimiterPositions.includes(level + 1)) {
      columns.push({ type: 'delimiter', char: codeDelimiterChar || '-' });
    }
  }
  // A blank spacer column between the code block and the description block, matching the
  // on-screen grid's own gap column under the "Code" / "Description" section headings
  // (Section 7: the export should match the working view exactly).
  columns.push({ type: 'gap' });
  for (let level = 0; level < numLevels; level++) {
    columns.push({ type: 'desc', level });
  }
  // User-defined suffix columns, each preceded by its own configured delimiter character.
  suffixes.forEach((suffix, index) => {
    columns.push({ type: 'delimiter', char: suffix.delimiter || '-' });
    columns.push({ type: 'suffix', index });
  });
  return columns;
}

function buildDiscreteGrid(project: TaxonomyProject): { header: string[]; rows: string[][]; columns: ExportColumn[] } {
  const columns = buildExportColumns(project);
  const header = columns.map((c) => {
    if (c.type === 'code' || c.type === 'desc') return String(c.level + 1);
    if (c.type === 'suffix') return `Suffix ${c.index + 1}`;
    return '';
  });
  const rows = project.rows.map((row) =>
    columns.map((c) => {
      if (c.type === 'delimiter') return c.char;
      if (c.type === 'gap') return '';
      if (c.type === 'code') return row.codes[c.level] ?? '';
      if (c.type === 'desc') return row.descriptions[c.level] ?? '';
      // Both suffix modes are per-row now — "constant" only means new rows are seeded with
      // the configured default, not that every row is forced to share the same value.
      return row.suffixValues[c.index] ?? '';
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

// Inserts the taxonomy's configured "-" delimiters into a full code string at the same
// positions they appear in the grid and the Discrete Columns export, e.g. codes ["1","2","3"]
// with a delimiter after column 2 becomes "12-3".
function joinCodeWithDelimiters(codes: string[], delimiterPositions: number[], delimiterChar: string): string {
  let result = '';
  for (let i = 0; i < codes.length; i++) {
    result += codes[i] ?? '';
    if (delimiterPositions.includes(i + 1)) result += delimiterChar;
  }
  return result;
}

// "Concatenated" export (Section 9, item 1 — out of v1's original scope, but James asked
// for it): one combined Code column and one combined Description column per posting-level
// row, ready to feed an ERP import, rather than one column per level.
//
// - Code: the row's full, fixed-width code exactly as it appears in the grid — including any
//   trailing padding characters and the taxonomy's configured "-" delimiters at the same
//   positions they appear on screen — not trimmed to the row's own depth, so a fixed-length
//   ERP code field still lines up.
// - Description: the row's own text only (not a breadcrumb of its ancestors'
//   descriptions), indented with one leading copy of the taxonomy's configured indent
//   character per level above the top (a space by default, or another ASCII character set
//   on the New Taxonomy form), so depth is visible at a glance.
// Rows with no description at all (level -1) are skipped — there's nothing to export.
function buildConcatenatedGrid(project: TaxonomyProject): { header: string[]; rows: string[][] } {
  const { indentChar: rawIndentChar, delimiterPositions, codeDelimiterChar } = project.settings;
  const indentChar = rawIndentChar || ' ';
  const rows: string[][] = [];
  for (const row of project.rows) {
    const level = levelOf(row);
    if (level === -1) continue;
    const code = joinCodeWithDelimiters(row.codes, delimiterPositions, codeDelimiterChar || '-');
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

// Returns a project whose row codes have every occurrence of the taxonomy's own configured
// padding character replaced with `replacement` — used only to build the bytes of one export,
// never returned to the caller as the project's new state (the real, stored project always
// keeps its own padding character exactly as typed; only the exported file's content changes).
function withPaddingSubstitution(project: TaxonomyProject, replacement: string | undefined): TaxonomyProject {
  if (!replacement) return project;
  const target = project.settings.paddingChar;
  return {
    ...project,
    rows: project.rows.map((row) => ({
      ...row,
      codes: row.codes.map((c) => (c === target ? replacement : c)),
    })),
  };
}

// File names carry a descriptor of which export they are, plus a " v1.NN" version suffix that
// increments every time that same file (same descriptor/format) is written again — a taxonomy
// typically ends up with several files side by side in the same folder, e.g.
// "Further Milling v1.01.json" (the save file, for reuse) alongside
// "Further Milling Per Column v1.03.csv" and "Further Milling Concatenated v1.01.xlsx".
function exportFilename(project: TaxonomyProject, descriptor: string, extension: string, versionLabel: string): string {
  const base = project.tableName || project.title || 'taxonomy';
  return `${base} ${descriptor}${versionLabel}.${extension}`;
}

export async function exportDiscreteCsv(
  project: TaxonomyProject,
  options?: { paddingOverride?: string },
): Promise<{ project: TaxonomyProject; usedFolder: boolean; cancelled: boolean }> {
  const { project: versioned, versionLabel } = bumpFileVersion(project, 'discrete-csv');
  const { header, rows } = buildDiscreteGrid(withPaddingSubstitution(project, options?.paddingOverride));
  const csv = [header, ...rows].map((line) => line.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const { usedFolder, cancelled } = await saveExportFile(blob, exportFilename(project, 'Per Column', 'csv', versionLabel));
  return { project: cancelled ? project : versioned, usedFolder, cancelled };
}

export async function exportDiscreteXlsx(
  project: TaxonomyProject,
  options?: { paddingOverride?: string },
): Promise<{ project: TaxonomyProject; usedFolder: boolean; cancelled: boolean }> {
  const { project: versioned, versionLabel } = bumpFileVersion(project, 'discrete-xlsx');
  // exceljs is a large dependency needed only for this one export path — code-split so it
  // doesn't inflate the initial bundle for everyone who never exports to Excel.
  const ExcelJS = (await import('exceljs')).default;
  const { header, rows, columns } = buildDiscreteGrid(withPaddingSubstitution(project, options?.paddingOverride));
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
    if (col.type === 'suffix') {
      excelCol.width = Math.max(4, project.settings.suffixes[col.index].width + 2);
      excelCol.alignment = { horizontal: 'left' };
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
  const { usedFolder, cancelled } = await saveExportFile(blob, exportFilename(project, 'Per Column', 'xlsx', versionLabel));
  return { project: cancelled ? project : versioned, usedFolder, cancelled };
}

export async function exportConcatenatedCsv(
  project: TaxonomyProject,
  options?: { paddingOverride?: string },
): Promise<{ project: TaxonomyProject; usedFolder: boolean; cancelled: boolean }> {
  const { project: versioned, versionLabel } = bumpFileVersion(project, 'concatenated-csv');
  const { header, rows } = buildConcatenatedGrid(withPaddingSubstitution(project, options?.paddingOverride));
  const csv = [header, ...rows].map((line) => line.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const { usedFolder, cancelled } = await saveExportFile(blob, exportFilename(project, 'Concatenated', 'csv', versionLabel));
  return { project: cancelled ? project : versioned, usedFolder, cancelled };
}

export async function exportConcatenatedXlsx(
  project: TaxonomyProject,
  options?: { paddingOverride?: string },
): Promise<{ project: TaxonomyProject; usedFolder: boolean; cancelled: boolean }> {
  const { project: versioned, versionLabel } = bumpFileVersion(project, 'concatenated-xlsx');
  const ExcelJS = (await import('exceljs')).default;
  const { header, rows } = buildConcatenatedGrid(withPaddingSubstitution(project, options?.paddingOverride));
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
  const { usedFolder, cancelled } = await saveExportFile(blob, exportFilename(project, 'Concatenated', 'xlsx', versionLabel));
  return { project: cancelled ? project : versioned, usedFolder, cancelled };
}
