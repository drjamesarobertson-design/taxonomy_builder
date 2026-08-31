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

// queryPermission/requestPermission can reject outright rather than resolving to "denied" —
// e.g. requestPermission needs an active user gesture, and one can easily have expired by the
// time this runs (a dynamic import earlier in the same export, for instance). Treating any
// such rejection as "not available" — instead of letting it propagate — is what keeps a
// permission hiccup from silently hanging the whole export.
async function verifyPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const opts = { mode: 'readwrite' as const };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if ((await handle.requestPermission(opts)) === 'granted') return true;
    return false;
  } catch {
    return false;
  }
}

/** Lets the user pick (or replace) the folder Save/Export writes to; remembered for next time.
 * Reopens starting at the currently remembered folder, if there is one, rather than the
 * browser's own default starting location. */
export async function chooseExportFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsFileSystemAccess()) return null;
  try {
    const startIn = cachedHandle ?? (await loadStoredHandle()) ?? undefined;
    const handle = await window.showDirectoryPicker!({ id: 'taxonomy-builder-exports', ...(startIn ? { startIn } : {}) });
    cachedHandle = handle;
    await storeHandle(handle);
    return handle;
  } catch {
    return null; // user cancelled the picker, or it couldn't be shown
  }
}

/** The remembered folder, with permission already verified — without prompting to pick one if
 * there isn't one yet. Used as a starting-location hint for the per-save "Save As" dialog, so
 * it's fine for this to come back empty; the dialog itself still lets the user browse anywhere. */
async function peekVerifiedFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    if (!supportsFileSystemAccess()) return null;
    if (cachedHandle && (await verifyPermission(cachedHandle))) return cachedHandle;
    const stored = await loadStoredHandle();
    if (stored && (await verifyPermission(stored))) {
      cachedHandle = stored;
      return stored;
    }
  } catch {
    // Falls through to null below.
  }
  return null;
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
  return [{ description: ext ? ext.slice(1).toUpperCase() : 'File', accept: { [mimeType]: ext ? [ext] : [] } }];
}

/**
 * Saves a blob via the browser's native "Save As" dialog — filename and destination folder are
 * the user's choice every time, not fixed to one remembered folder — starting, when the browser
 * supports it, in whichever folder was set via "Choose Export Folder" (a default location, not
 * a silent destination). Falls back to a normal browser download when the picker API isn't
 * supported (Firefox, Safari) or the save otherwise can't go through the picker.
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
    try {
      const startIn = (await peekVerifiedFolder()) ?? undefined;
      const handle = await window.showSaveFilePicker!({
        suggestedName: filename,
        types: acceptTypesFor(filename, blob.type),
        ...(startIn ? { startIn } : {}),
      });
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
