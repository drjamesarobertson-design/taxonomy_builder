// "Create Block" / "Import Block" — a manual content-transfer format for duplicating a
// taxonomy's codes, descriptions, and suffixes into a different, already-open taxonomy (e.g.
// seeding a Chart of Accounts or an Item Master from a previously-built one). A dedicated JSON
// shape rather than the Discrete Columns CSV: a round-trip import needs to know unambiguously
// which cell is a real code vs. a delimiter vs. padding vs. a description vs. a suffix — a
// plain CSV's column positions alone can't carry that reliably once the source and target
// tables have different level counts, delimiter positions, or padding characters (Section 4.4:
// those are inherited from the target table on import, never carried over from the source).

import type { TaxonomyProject, TaxonomyRow } from './types';
import { saveExportFile } from './exportFolder';
import { bumpFileVersion } from './fileVersion';

export interface BlockEntry {
  /** This row's own code path, column 1 through its own level — nothing beyond (no trailing
   * padding or blanks), so the target's own column layout at the import anchor is all that
   * decides where these land. */
  codes: string[];
  description: string;
  /** One entry per suffix column configured on the source taxonomy, in order. */
  suffixValues: string[];
}

export interface TaxonomyBlock {
  formatVersion: 1;
  sourceTitle: string;
  sourceTableName: string;
  entries: BlockEntry[];
}

// A row's level is the position of its deepest populated description column (Section 4.1);
// -1 means the row has no description at all yet, so there's nothing to include for it.
function levelOf(row: TaxonomyRow): number {
  for (let i = row.descriptions.length - 1; i >= 0; i--) {
    if ((row.descriptions[i] ?? '').trim()) return i;
  }
  return -1;
}

// `rowsOverride` (item 3): exports only a chosen range of rows — e.g. one branch of a large
// taxonomy — rather than the whole table, via the grid's own multi-row selection. Each row's
// own code path is still trimmed to its own level exactly as for a whole-table export; nothing
// about the block format itself changes, only which rows feed it. `includeSuffixes` (also item
// 3, "Include Suffix? Y/N") lets the block leave suffix values out entirely, for a plain
// structure-and-wording transfer into a target that may not share the same suffix setup.
export function buildBlock(
  project: TaxonomyProject,
  options?: { rowsOverride?: TaxonomyRow[]; includeSuffixes?: boolean },
): TaxonomyBlock {
  const entries: BlockEntry[] = [];
  const includeSuffixes = options?.includeSuffixes ?? true;
  for (const row of options?.rowsOverride ?? project.rows) {
    const level = levelOf(row);
    if (level === -1) continue;
    entries.push({
      codes: row.codes.slice(0, level + 1).map((c) => c ?? ''),
      description: row.descriptions[level] ?? '',
      suffixValues: includeSuffixes ? project.settings.suffixes.map((_, i) => row.suffixValues[i] ?? '') : [],
    });
  }
  return {
    formatVersion: 1,
    sourceTitle: project.title,
    sourceTableName: project.tableName,
    entries,
  };
}

function exportFilename(project: TaxonomyProject, versionLabel: string, descriptor?: string): string {
  const base = project.tableName || project.title || 'taxonomy';
  return `${base} ${descriptor ? `${descriptor} ` : ''}Block${versionLabel}.json`;
}

export async function exportBlock(
  project: TaxonomyProject,
  options?: { rowsOverride?: TaxonomyRow[]; includeSuffixes?: boolean },
): Promise<{ project: TaxonomyProject; usedFolder: boolean; cancelled: boolean }> {
  const { project: versioned, versionLabel } = bumpFileVersion(project, 'block-json');
  const block = buildBlock(project, options);
  const json = JSON.stringify(block, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const descriptor = options?.rowsOverride ? 'Selection' : undefined;
  const { usedFolder, cancelled } = await saveExportFile(blob, exportFilename(project, versionLabel, descriptor));
  return { project: cancelled ? project : versioned, usedFolder, cancelled };
}

function isTaxonomyBlock(data: unknown): data is TaxonomyBlock {
  if (typeof data !== 'object' || data === null) return false;
  const b = data as Record<string, unknown>;
  if (!Array.isArray(b.entries)) return false;
  return b.entries.every((e) => {
    if (typeof e !== 'object' || e === null) return false;
    const entry = e as Record<string, unknown>;
    return (
      Array.isArray(entry.codes) &&
      entry.codes.length >= 1 &&
      entry.codes.every((c) => typeof c === 'string') &&
      typeof entry.description === 'string' &&
      Array.isArray(entry.suffixValues) &&
      entry.suffixValues.every((s) => typeof s === 'string')
    );
  });
}

export function parseBlockFile(file: File): Promise<TaxonomyBlock> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (!isTaxonomyBlock(data)) {
          reject(new Error('This file does not look like a valid block.'));
          return;
        }
        resolve(data);
      } catch {
        reject(new Error('Could not parse this file as JSON.'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read this file.'));
    reader.readAsText(file);
  });
}
