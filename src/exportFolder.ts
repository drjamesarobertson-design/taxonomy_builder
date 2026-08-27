// Optional integration with the File System Access API (Chromium browsers): lets Save/Export
// write straight into a folder the user picks once, remembered across the session (and, via
// IndexedDB, across reloads) rather than prompting a fresh "Save As" dialog every time.
// Firefox and Safari don't support this API — everything here degrades to the existing plain
// browser download when it's unavailable, or if the user cancels the folder picker.

import { downloadBlob } from './download';

const DB_NAME = 'taxonomy-builder';
const STORE_NAME = 'handles';
const KEY = 'exportFolder';

export function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
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

async function verifyPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts = { mode: 'readwrite' as const };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if ((await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}

/** Lets the user pick (or replace) the folder Save/Export writes to; remembered for next time. */
export async function chooseExportFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsFileSystemAccess()) return null;
  try {
    const handle = await window.showDirectoryPicker!({ id: 'taxonomy-builder-exports' });
    cachedHandle = handle;
    await storeHandle(handle);
    return handle;
  } catch {
    return null; // user cancelled the picker
  }
}

/** Returns the remembered export folder, prompting the user to pick one only the first time. */
async function ensureExportFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsFileSystemAccess()) return null;
  if (cachedHandle && (await verifyPermission(cachedHandle))) return cachedHandle;
  const stored = await loadStoredHandle();
  if (stored && (await verifyPermission(stored))) {
    cachedHandle = stored;
    return stored;
  }
  return chooseExportFolder();
}

/** The remembered folder's name, without prompting for permission — for a UI label only. */
export async function peekExportFolderName(): Promise<string | null> {
  if (cachedHandle) return cachedHandle.name;
  const stored = await loadStoredHandle();
  return stored?.name ?? null;
}

/**
 * Saves a blob to the remembered export folder if the browser supports it and the user has
 * granted access, otherwise falls back to a normal browser download.
 */
export async function saveExportFile(blob: Blob, filename: string): Promise<void> {
  const folder = await ensureExportFolder();
  if (folder) {
    try {
      const fileHandle = await folder.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch {
      // Fall through to a normal download if writing to the folder failed for some reason.
    }
  }
  downloadBlob(blob, filename);
}
