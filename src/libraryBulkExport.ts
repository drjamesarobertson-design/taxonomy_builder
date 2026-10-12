// James's ask: "Export All" — every taxonomy in the Library, as one Excel or CSV file each, in
// one action rather than opening each one in turn and using its own Export button. Chromium
// browsers (window.showDirectoryPicker, the same File System Access API "Choose Export Folder"
// and Folders -> Local Hard Drive already use) get a single destination-folder prompt covering
// every file this writes — no further per-file Save dialogs. Firefox/Safari, which don't support
// that API, fall back to one ordinary browser download per file.

import type { LibraryEntry } from './library';
import { buildDiscreteCsvBlob, buildDiscreteXlsxBlob } from './gridExport';
import { sanitizeFolderName } from './hddFolders';
import { downloadBlob } from './download';

export function supportsFolderBulkExport(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

// Same sibling-collision handling as buildHddFolderPlan (hddFolders.ts) — two entries whose
// table name/title sanitizes to the same filename get " (2)", " (3)", ... appended rather than
// one silently overwriting the other.
function uniqueFilenames(entries: LibraryEntry[], extension: string): Map<string, string> {
  const used = new Set<string>();
  const names = new Map<string, string>();
  for (const entry of entries) {
    const base = sanitizeFolderName(entry.project.tableName || entry.project.title || 'taxonomy');
    let name = `${base}.${extension}`;
    let suffix = 2;
    while (used.has(name)) {
      name = `${base} (${suffix}).${extension}`;
      suffix++;
    }
    used.add(name);
    names.set(entry.id, name);
  }
  return names;
}

export interface BulkExportResult {
  /** 'folder': written straight into a chosen folder, no further prompts. 'downloads': one
   * ordinary browser download per file (Firefox/Safari, or the user declined the folder prompt
   * but the caller chose to fall back anyway). 'cancelled': the initial folder picker was
   * dismissed — nothing was written. */
  method: 'folder' | 'downloads' | 'cancelled';
  count: number;
}

/** Writes one file per entry, in the given format, either straight into a user-chosen folder
 * (Chromium) or as individual browser downloads (fallback). `onProgress` fires after each file
 * (1-based `done`) so a caller can show "Exporting 5 of 23…". */
export async function exportLibraryEntriesToFiles(
  entries: LibraryEntry[],
  format: 'xlsx' | 'csv',
  onProgress?: (done: number, total: number) => void,
): Promise<BulkExportResult> {
  const names = uniqueFilenames(entries, format);
  const buildBlob = (entry: LibraryEntry) =>
    format === 'xlsx' ? buildDiscreteXlsxBlob(entry.project) : Promise.resolve(buildDiscreteCsvBlob(entry.project));

  if (supportsFolderBulkExport()) {
    let root: FileSystemDirectoryHandle;
    try {
      root = await window.showDirectoryPicker!({ id: 'taxonomy-builder-bulk-export' });
    } catch {
      return { method: 'cancelled', count: 0 }; // user dismissed the picker
    }
    let done = 0;
    for (const entry of entries) {
      const blob = await buildBlob(entry);
      const handle = await root.getFileHandle(names.get(entry.id)!, { create: true });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      done++;
      onProgress?.(done, entries.length);
    }
    return { method: 'folder', count: done };
  }

  // Fallback: plain downloads, one per file. A short stagger between each reduces (but can't
  // fully eliminate, in every browser) the chance of the browser's own "this site is downloading
  // multiple files" block kicking in for a long list.
  let done = 0;
  for (const entry of entries) {
    const blob = await buildBlob(entry);
    downloadBlob(blob, names.get(entry.id)!);
    done++;
    onProgress?.(done, entries.length);
    if (done < entries.length) await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return { method: 'downloads', count: done };
}
