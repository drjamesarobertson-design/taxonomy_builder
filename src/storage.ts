import type { TaxonomyProject } from './types';
import { saveExportFile } from './exportFolder';
import { bumpFileVersion } from './fileVersion';

/** Saves the project to a file and returns the project with its "save" version counter
 * bumped — callers must persist this back into state so the next save continues counting. */
export async function saveProjectToFile(project: TaxonomyProject): Promise<TaxonomyProject> {
  const { project: versioned, versionLabel } = bumpFileVersion(project, 'save');
  const json = JSON.stringify(versioned, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const base = project.tableName || project.title || 'taxonomy';
  await saveExportFile(blob, `${base}${versionLabel}.json`);
  return versioned;
}

function isTaxonomyProject(data: unknown): data is TaxonomyProject {
  if (typeof data !== 'object' || data === null) return false;
  const p = data as Record<string, unknown>;
  return (
    typeof p.title === 'string' &&
    typeof p.tableName === 'string' &&
    typeof p.purpose === 'string' &&
    typeof p.settings === 'object' &&
    p.settings !== null &&
    Array.isArray(p.rows)
  );
}

export function loadProjectFromFile(file: File): Promise<TaxonomyProject> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (!isTaxonomyProject(data)) {
          reject(new Error('This file does not look like a valid taxonomy project.'));
          return;
        }
        // Migrate older project files: a single delimiterAfter position becomes an array.
        const settings = data.settings as unknown as Record<string, unknown>;
        if (!Array.isArray(settings.delimiterPositions) && typeof settings.delimiterAfter === 'number') {
          settings.delimiterPositions = [settings.delimiterAfter];
        }
        // Older files predate the configurable Concatenated-export indent character — default
        // to the space that was previously hardcoded.
        if (typeof settings.indentChar !== 'string' || settings.indentChar.length !== 1) {
          settings.indentChar = ' ';
        }
        // Older files predate suffix columns and per-file version counters.
        if (!Array.isArray(settings.suffixes)) settings.suffixes = [];
        const project = data as unknown as Record<string, unknown>;
        if (typeof project.fileVersions !== 'object' || project.fileVersions === null) {
          project.fileVersions = {};
        }
        const suffixCount = (settings.suffixes as unknown[]).length;
        for (const row of data.rows as unknown as Record<string, unknown>[]) {
          if (!Array.isArray(row.suffixValues)) {
            row.suffixValues = Array(suffixCount).fill('');
          }
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
