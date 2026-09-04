import type { TaxonomyProject } from './types';
import { CODE_RESTRICTIONS } from './types';
import { saveExportFile } from './exportFolder';
import { bumpFileVersion } from './fileVersion';

/** Saves the project to a file and returns the project with its "save" version counter
 * bumped — callers must persist this back into state so the next save continues counting —
 * plus whether it actually landed in the remembered export folder or fell back to a plain
 * download. If the user cancels the "Save As" dialog, the original (unbumped) project is
 * returned instead — cancelling shouldn't consume a version number for nothing. */
export async function saveProjectToFile(
  project: TaxonomyProject,
): Promise<{ project: TaxonomyProject; usedFolder: boolean; cancelled: boolean }> {
  const { project: versioned, versionLabel } = bumpFileVersion(project, 'save');
  const json = JSON.stringify(versioned, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const base = project.tableName || project.title || 'taxonomy';
  const { usedFolder, cancelled } = await saveExportFile(blob, `${base}${versionLabel}.json`);
  return { project: cancelled ? project : versioned, usedFolder, cancelled };
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
        // Older files predate the configurable padding and code-delimiter characters —
        // default to the values that were previously hardcoded everywhere.
        if (typeof settings.paddingChar !== 'string' || settings.paddingChar.length !== 1) {
          settings.paddingChar = '.';
        }
        if (typeof settings.codeDelimiterChar !== 'string' || settings.codeDelimiterChar.length !== 1) {
          settings.codeDelimiterChar = '-';
        }
        // Older files predate the Code Restrictions dropdown (item 1) — default to the
        // unrestricted option, matching the full charset every taxonomy used before this.
        if (!CODE_RESTRICTIONS.includes(settings.codeRestriction as never)) {
          settings.codeRestriction = 'Alpha Numeric with All Alpha';
        }
        // Older files predate Lock Taxonomy — default to unlocked, and no row was ever
        // marked protected, matching every taxonomy's behaviour before this existed.
        if (typeof settings.locked !== 'boolean') settings.locked = false;
        // Older files predate the column-1 multi-character code length setting — default to 1,
        // matching every taxonomy's single-character column 1 behaviour before this existed.
        if (typeof settings.column1CodeLength !== 'number' || settings.column1CodeLength < 1 || settings.column1CodeLength > 5) {
          settings.column1CodeLength = 1;
        }
        // Older files predate Proper-Case-only mode — default to false, matching every
        // taxonomy's ALL CAPS structural-entry convention before this existed.
        if (typeof settings.properCaseOnly !== 'boolean') settings.properCaseOnly = false;
        const project = data as unknown as Record<string, unknown>;
        if (typeof project.fileVersions !== 'object' || project.fileVersions === null) {
          project.fileVersions = {};
        }
        // "Constant" suffixes used to be read-only, always showing settings.constantValue for
        // every row rather than their own per-row value — now they're editable like any other
        // suffix, seeded from that same default. Backfill any row whose stored value for a
        // constant-mode suffix is still blank (never having had a real per-row value to begin
        // with) so loading an older file doesn't blank out what it used to display.
        const suffixFields = settings.suffixes as Array<{ mode: string; constantValue: string }>;
        for (const row of data.rows as unknown as Record<string, unknown>[]) {
          if (!Array.isArray(row.suffixValues)) {
            row.suffixValues = suffixFields.map(() => '');
          }
          const suffixValues = row.suffixValues as string[];
          suffixFields.forEach((suffix, i) => {
            if (suffix.mode === 'constant' && !suffixValues[i]) {
              suffixValues[i] = suffix.constantValue;
            }
          });
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

// Session autosave: a lightweight recovery net, separate from the deliberate Save to File /
// Add to Library actions. Signing out (or the browser reloading, closing, crashing) doesn't
// otherwise lose whatever's currently open — App.tsx writes here on every change to `project`
// and offers "Resume Work in Progress" on the landing menu whenever this holds something. Only
// one slot, matching the app's own single-taxonomy-at-a-time model (Section 3/9.4) — starting
// or opening a different taxonomy overwrites it, same as it would overwrite the working grid.
const AUTOSAVE_KEY = 'taxonomy-builder-autosave';

export function saveAutosave(project: TaxonomyProject): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project));
  } catch {
    // Storage full, disabled, or unavailable (private browsing) — Save to File and Add to
    // Library are unaffected; this recovery net just isn't there for this session.
  }
}

export function loadAutosave(): TaxonomyProject | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return isTaxonomyProject(data) ? data : null;
  } catch {
    return null;
  }
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // Nothing to clear if storage isn't available in the first place.
  }
}
