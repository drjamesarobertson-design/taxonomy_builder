// Per-file save/export version counters. Each producible file (the project save, and each
// export format/layout combination) gets its own counter on the project, incremented every
// time that particular file is written, and rendered as a " v1.NN" filename suffix.

import type { TaxonomyProject } from './types';

export type FileVersionKey =
  | 'save'
  | 'discrete-csv'
  | 'discrete-xlsx'
  | 'concatenated-csv'
  | 'concatenated-xlsx';

export function bumpFileVersion(
  project: TaxonomyProject,
  key: FileVersionKey,
): { project: TaxonomyProject; versionLabel: string } {
  const next = (project.fileVersions[key] ?? 0) + 1;
  const updated: TaxonomyProject = {
    ...project,
    fileVersions: { ...project.fileVersions, [key]: next },
  };
  return { project: updated, versionLabel: ` v1.${String(next).padStart(2, '0')}` };
}
