import type { TaxonomyProject } from './types';

export function saveProjectToFile(project: TaxonomyProject): void {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const filename = `${project.tableName || project.title || 'taxonomy'}.json`;
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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
        resolve(data);
      } catch {
        reject(new Error('Could not parse this file as JSON.'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read this file.'));
    reader.readAsText(file);
  });
}
