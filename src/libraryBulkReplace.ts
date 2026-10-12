// James's ask: re-importing an anonymised copy of some or all of the Library's taxonomies
// (exported via "Export to Excel"/"Export to CSV", then edited outside the app -- e.g. to strip
// client-identifying text before using a taxonomy for a demo video) must REPLACE each matching
// Library entry's content in place, never add a new entry and never touch entries with no
// matching file. "Matching" means: the uploaded file's name (minus extension) is, once
// normalised, the filename the current Library would produce for that entry via a bulk export --
// the same uniqueFilenames() ordering/collision logic libraryBulkExport.ts already uses, so a
// round trip through Export -> edit -> this lines files back up with the entry they came from
// even once normalised.
//
// James's report (first real try): his own file-naming habit -- visible in every file he's sent
// this whole project, e.g. "Payroll_Block_Master_v_2.0.csv" -- replaces spaces with underscores
// and appends a trailing "_v_N.N" version tag, neither of which our own export filename ever
// has. An exact-stem match against that would never succeed for him in practice, so matchKey()
// below normalises underscores/hyphens/spaces together and strips a trailing version tag (or an
// OS-style duplicate-download "(2)") before comparing on both sides.
//
// Deliberately narrow: this never creates or deletes a Library entry, and every field other
// than rows (category, order, isStarterSample/"star", settings, title, tableName, purpose,
// fileVersions) is left exactly as-is on every replaced entry -- updateLibraryEntryProject
// (library.ts) already preserves all of that, spreading the existing entry and only swapping
// `project`.
//
// Not yet gated behind anything -- there's no "super user" concept in this app yet. James has
// asked for a proposal for one separately; once that exists, this is the first candidate to
// move behind it, since a wrong folder choice here silently overwrites real content across the
// whole Library in one pass.

import type { TaxonomyProject, TaxonomyRow } from './types';
import type { LibraryEntry } from './library';
import { buildExportColumns } from './gridExport';
import { uniqueFilenames } from './libraryBulkExport';
import { readFileAsText, parseCsvTable } from './csvImport';
import { updateLibraryEntryProject } from './library';

export function supportsFolderBulkRead(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

// Only the two formats the bulk export itself ever produces -- not legacy binary .xls, which
// ExcelJS's xlsx reader doesn't understand anyway.
const SUPPORTED_EXTENSIONS = ['csv', 'xlsx'];

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

function stemOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? filename : filename.slice(0, dot);
}

// Treats underscores, hyphens and runs of whitespace as interchangeable word separators, same
// as sanitizeFolderName's own replacement of filesystem-illegal characters with "_" already
// blurs the line between what was originally a space and what wasn't.
function normalizeForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Strips a trailing version tag ("v1.3", "v 2", "v_3.0" once normalized to "v 3 0"... handled
// below) and a trailing OS-style duplicate-download suffix ("(2)") -- repeatedly, in case a
// file picked up both (e.g. "... v1.3 (2)"). Caveat: a taxonomy whose real title genuinely ends
// in something like "V2" would also get trimmed here -- an accepted tradeoff given James's own
// files always carry a genuine version tag in practice.
function stripTrailingVersionTag(normalized: string): string {
  let result = normalized;
  for (let i = 0; i < 3; i++) {
    const next = result.replace(/\s*\(\d+\)$/, '').replace(/\s*v\s*\d+(\s*\.\s*\d+)*$/i, '');
    if (next === result) break;
    result = next.trim();
  }
  return result;
}

function matchKey(filename: string): string {
  return stripTrailingVersionTag(normalizeForMatch(stemOf(filename)));
}

/** Chromium only (gated by supportsFolderBulkRead) -- one folder-read permission prompt, then
 * every file directly inside it (not recursing into subfolders, same as the bulk export only
 * ever writes one level deep). Returns null if the user dismisses the picker. */
export async function pickFolderFiles(): Promise<File[] | null> {
  let root: FileSystemDirectoryHandle;
  try {
    root = await window.showDirectoryPicker!({ id: 'taxonomy-builder-bulk-import' });
  } catch {
    return null;
  }
  const files: File[] = [];
  for await (const handle of root.values()) {
    if (handle.kind === 'file') files.push(await handle.getFile());
  }
  return files;
}

export interface ReplacePlan {
  /** One per file whose name matched a current Library entry -- what will actually be replaced. */
  matches: { entry: LibraryEntry; file: File }[];
  /** Filenames (with extension) that didn't match any current Library entry, or whose
   * extension isn't one this import understands -- never acted on. */
  unmatchedFiles: string[];
  /** Library entries with no matching file in this batch -- left completely untouched. */
  entriesWithoutFile: LibraryEntry[];
}

/** Pure name-matching only -- no file content is read here. Matches each file's name (minus
 * extension, normalised) against the filename a bulk export of `entries` (in this same order)
 * would have produced for it, under that file's own extension. A key two entries' names both
 * normalise to maps to `null` (ambiguous) rather than either entry, so a collision never causes
 * a file to silently land on the wrong one. */
function reverseByStem(entries: LibraryEntry[], extension: string): Map<string, LibraryEntry | null> {
  const names = uniqueFilenames(entries, extension);
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const reversed = new Map<string, LibraryEntry | null>();
  for (const [entryId, filename] of names) {
    const entry = entryById.get(entryId);
    if (!entry) continue;
    const key = matchKey(filename);
    reversed.set(key, reversed.has(key) ? null : entry);
  }
  return reversed;
}

export function planReplace(entries: LibraryEntry[], files: File[]): ReplacePlan {
  const csvByStem = reverseByStem(entries, 'csv');
  const xlsxByStem = reverseByStem(entries, 'xlsx');

  const matches: { entry: LibraryEntry; file: File }[] = [];
  const unmatchedFiles: string[] = [];
  const matchedEntryIds = new Set<string>();

  for (const file of files) {
    const ext = extensionOf(file.name);
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      unmatchedFiles.push(file.name);
      continue;
    }
    const key = matchKey(file.name);
    const entry = (ext === 'csv' ? csvByStem : xlsxByStem).get(key);
    if (!entry) {
      unmatchedFiles.push(file.name);
      continue;
    }
    matches.push({ entry, file });
    matchedEntryIds.add(entry.id);
  }

  const entriesWithoutFile = entries.filter((e) => !matchedEntryIds.has(e.id));
  return { matches, unmatchedFiles, entriesWithoutFile };
}

async function readFileDataRows(file: File): Promise<string[][]> {
  const ext = extensionOf(file.name);
  if (ext === 'csv') {
    // buildDiscreteCsvBlob (gridExport.ts) never writes a header row -- unlike the xlsx export
    // below, every line is real data, so none gets dropped here.
    const text = await readFileAsText(file);
    return parseCsvTable(text);
  }
  // xlsx/xls: exceljs is a large dependency needed only for this one path -- code-split so it
  // doesn't inflate the bundle for anyone who never uses this feature.
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber === 1) return; // header row
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const v = cell.value;
      cells[colNumber - 1] =
        v === null || v === undefined
          ? ''
          : typeof v === 'object' && 'text' in v
            ? String((v as { text: unknown }).text)
            : typeof v === 'object' && 'result' in v
              ? String((v as { result: unknown }).result ?? '')
              : String(v);
    });
    rows.push(cells);
  });
  return rows;
}

// The raw-grid export (gridExport.ts) has no column for a row's note or its Lock-protected
// flag -- both are carried forward from the existing row at the same position instead, so
// replacing a taxonomy's content this way doesn't silently wipe either. Only `codes`,
// `descriptions` and `suffixValues` ever come from the uploaded file.
function applyFileRowsToProject(existingProject: TaxonomyProject, fileDataRows: string[][]): TaxonomyProject {
  const columns = buildExportColumns(existingProject);
  const { numLevels, suffixes } = existingProject.settings;
  const rows: TaxonomyRow[] = fileDataRows.map((cells, i) => {
    const old = existingProject.rows[i];
    const codes: string[] = new Array(numLevels).fill('');
    const descriptions: string[] = new Array(numLevels).fill('');
    const suffixValues: string[] = new Array(suffixes.length).fill('');
    columns.forEach((col, colIndex) => {
      const value = cells[colIndex] ?? '';
      if (col.type === 'code') codes[col.level] = value;
      else if (col.type === 'desc') descriptions[col.level] = value;
      else if (col.type === 'suffix') suffixValues[col.index] = value;
    });
    return {
      id: old?.id ?? crypto.randomUUID(),
      codes,
      descriptions,
      suffixValues,
      protected: old?.protected,
      note: old?.note,
    };
  });
  return { ...existingProject, rows };
}

export interface ReplaceResult {
  replacedCount: number;
  /** Entries whose uploaded file had a different row count than the entry it replaced --
   * notes/protected flags past the shorter of the two couldn't be carried forward for these. */
  rowCountMismatches: string[];
}

/** Executes a confirmed ReplacePlan.matches list -- reads each file, rebuilds that entry's
 * project from it, and writes it back under the SAME Library entry id (so category, order,
 * isStarterSample, settings etc. all stay exactly as they were). `onProgress` fires after each
 * entry (1-based `done`). */
export async function applyReplacements(
  matches: { entry: LibraryEntry; file: File }[],
  onProgress?: (done: number, total: number) => void,
): Promise<ReplaceResult> {
  const rowCountMismatches: string[] = [];
  let done = 0;
  for (const { entry, file } of matches) {
    const fileDataRows = await readFileDataRows(file);
    if (fileDataRows.length !== entry.project.rows.length) rowCountMismatches.push(file.name);
    const newProject = applyFileRowsToProject(entry.project, fileDataRows);
    await updateLibraryEntryProject(entry.id, newProject);
    done++;
    onProgress?.(done, matches.length);
  }
  return { replacedCount: done, rowCountMismatches };
}
