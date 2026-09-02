// Optional integration with the File System Access API (Chromium browsers): every Save/Export
// shows the browser's native "Save As" dialog, so the filename and destination folder are a
// per-save choice — starting, for convenience, in whichever folder was set via "Choose Export
// Folder" (remembered across the session and, via IndexedDB, across reloads) rather than
// forcing every file into that one folder. Firefox and Safari don't support this API —
// everything here degrades to the existing plain browser download when it's unavailable.

import { downloadBlob } from './download';

const DB_NAME = 'taxonomy-builder';
const STORE_NAME = 'handles';
const KEY = 'exportFolder';

export function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

function supportsSaveFilePicker(): boolean {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadStoredHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function storeHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(handle, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Not fatal — the folder just won't be remembered across reloads this time.
  }
}

let cachedHandle: FileSystemDirectoryHandle | null = null;

// One-shot: set by chooseExportFolder(), consumed by the very next successful saveExportFile()
// call, then cleared. James reported the Save dialog kept reopening in a stale, days-old
// default even right after explicitly navigating to a different folder for that save — root
// cause was this being treated as a *permanent* override, applied to literally every future
// save forever, rather than a one-time "start here next" nudge. It should only steer the ONE
// save right after a deliberate "Choose Export Folder" pick; after that, `saveExportFile`'s own
// `id` already reflects wherever the user has actually been saving (updated automatically by
// the browser on every real save, with no extra bookkeeping needed here) — which is exactly
// "the latest folder" the user wants remembered, and a stale explicit pick must never be able to
// keep overriding it indefinitely.
let pendingExplicitFolder: FileSystemDirectoryHandle | null = null;

/** Lets the user pick (or replace) the folder the very NEXT Save/Export starts in; remembered
 * (its name, for display) across the session and, via IndexedDB, across reloads. Reopens
 * starting at the currently remembered folder, if there is one, rather than the browser's own
 * default starting location. */
export async function chooseExportFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsFileSystemAccess()) return null;
  try {
    const startIn = cachedHandle ?? (await loadStoredHandle()) ?? undefined;
    const handle = await window.showDirectoryPicker!({ id: 'taxonomy-builder-exports', ...(startIn ? { startIn } : {}) });
    cachedHandle = handle;
    pendingExplicitFolder = handle;
    await storeHandle(handle);
    return handle;
  } catch {
    return null; // user cancelled the picker, or it couldn't be shown
  }
}

/** The remembered folder's name, without prompting for permission — for a UI label only. */
export async function peekExportFolderName(): Promise<string | null> {
  if (cachedHandle) return cachedHandle.name;
  const stored = await loadStoredHandle();
  return stored?.name ?? null;
}

function acceptTypesFor(filename: string, mimeType: string): FilePickerAcceptType[] {
  const dot = filename.lastIndexOf('.');
  const ext = dot === -1 ? '' : filename.slice(dot).toLowerCase();
  // showSaveFilePicker wants a bare MIME type ("text/csv") and rejects the whole call with a
  // TypeError — not the AbortError this function's caller already handles — if it's given a
  // full Content-Type-style string with parameters ("text/csv;charset=utf-8"), so only the part
  // before any ";" is usable here regardless of what a Blob's own .type happens to carry.
  const bareMimeType = mimeType.split(';')[0].trim();
  return [{ description: ext ? ext.slice(1).toUpperCase() : 'File', accept: { [bareMimeType]: ext ? [ext] : [] } }];
}

/**
 * Saves a blob via the browser's native "Save As" dialog — filename and destination folder are
 * the user's choice every time, not fixed to one remembered folder — starting, when the browser
 * supports it, wherever the previous save actually went (or, right after an explicit "Choose
 * Export Folder" pick, that folder — see `pendingExplicitFolder` above). Falls back to a normal
 * browser download when the picker API isn't supported (Firefox, Safari) or the save otherwise
 * can't go through the picker.
 *
 * `usedFolder` tells a caller showing "Folder: X" in its UI whether the remembered default is
 * still worth trusting (a permission lapse etc. would make that label inaccurate). `cancelled`
 * is set when the user backs out of the Save dialog rather than the save simply falling back —
 * callers should treat that as "nothing happened," not as a completed save to a fresh download.
 */
export async function saveExportFile(
  blob: Blob,
  filename: string,
): Promise<{ usedFolder: boolean; cancelled: boolean }> {
  if (supportsSaveFilePicker()) {
    // A fixed `id` is what makes Chromium remember the *last folder actually used*, on its own,
    // across every Save/Export call — updated automatically to wherever the user just saved on
    // every successful pick, with or without `startIn`. `pendingExplicitFolder` is only ever
    // set right after "Choose Export Folder" and is consumed below on success, so it can steer
    // exactly the one save right after a deliberate pick without pinning every future save to
    // it — that permanent pin was the actual bug (a folder picked once, days ago, keeps winning
    // over the id's own steadily-more-current memory forever). One shared id across
    // Save/CSV/XLSX/block-transfer (all funnel through this one function) is deliberate: they're
    // overwhelmingly the same working folder in practice.
    const startIn = pendingExplicitFolder ?? undefined;
    try {
      const handle = await window.showSaveFilePicker!({
        id: 'taxonomy-builder-save',
        suggestedName: filename,
        types: acceptTypesFor(filename, blob.type),
        ...(startIn ? { startIn } : {}),
      });
      pendingExplicitFolder = null;
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { usedFolder: true, cancelled: false };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { usedFolder: false, cancelled: true };
      }
      // Fall through to a normal download if the picker failed for some other reason.
    }
  }
  downloadBlob(blob, filename);
  return { usedFolder: false, cancelled: false };
}
