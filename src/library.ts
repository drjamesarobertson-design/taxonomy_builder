// The Library (left-hand sidebar): a place to keep multiple built taxonomies for quick
// reference and further work, organised under a fixed set of headings. This is genuinely
// client-side persistence with no backend, per CLAUDE.md's "no backend or database" v1
// scope — entries live in this browser's own IndexedDB, in a separate database from the
// export-folder-handle store in exportFolder.ts, so a taxonomy's own save/load-to-file
// flow (Section 8) is completely unaffected; the Library is an additional, optional place
// to park a copy, not a replacement for saving to a file.

import type { TaxonomyProject } from './types';

// James's report: "Add to Library only offers Cubic Business Model" — the previous shape had
// one "Cubic Business Model Related" heading which only revealed its real choices (Division,
// Location, Function, Chart of Accounts) via a second dropdown once that heading was picked, so
// the actual choices James wanted were invisible until then. Those four now sit directly in
// this list — still grouped together visually (LibrarySidebar.tsx puts a plain "Cubic Business
// Model" heading above them, exactly like WorkflowMenu already does) — with no nested
// category/subcategory step required to reach them.
export const LIBRARY_CATEGORIES = [
  'Division',
  'Location',
  'Function',
  'Chart of Accounts',
  'Item and Product Related',
  'Customer Related',
  'Personnel Related',
  'Asset Related',
  'Projects Related',
  'Plant Related',
  'General / Other',
] as const;

export type LibraryCategory = (typeof LIBRARY_CATEGORIES)[number];

// James's Cubic Business Model© (CLAUDE.md Section 9) — these four sit together under a shared,
// non-clickable "Cubic Business Model" heading in LibrarySidebar, same grouping idea as
// WorkflowMenu's CUBIC_BUSINESS_MODEL_WORKFLOW_LEVELS, just for the Library's own category list.
export const CUBIC_BUSINESS_MODEL_LIBRARY_CATEGORIES: readonly LibraryCategory[] = [
  'Division',
  'Location',
  'Function',
  'Chart of Accounts',
];

export interface LibraryEntry {
  id: string;
  category: LibraryCategory;
  /** Position within its category, ascending. Not necessarily contiguous. */
  order: number;
  project: TaxonomyProject;
  updatedAt: string;
}

const DB_NAME = 'taxonomy-builder-library';
const STORE_NAME = 'entries';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Two generations of legacy category shapes to migrate on first read, so entries saved under
// either one don't silently vanish from every heading once they no longer match
// LIBRARY_CATEGORIES: the original "General Ledger Related" (pre-Cubic-Business-Model), and the
// later "Cubic Business Model Related" + a DIVISIONS/LOCATIONS/FUNCTIONS/GL ACCOUNTS subcategory
// (James's report that the nested picker hid the real choices — see LIBRARY_CATEGORIES above).
// Both collapse onto today's flat Division/Location/Function/Chart of Accounts categories.
const LEGACY_GENERAL_LEDGER_CATEGORY = 'General Ledger Related';
const LEGACY_CUBIC_BUSINESS_MODEL_CATEGORY = 'Cubic Business Model Related';
const LEGACY_SUBCATEGORY_TO_CATEGORY: Record<string, LibraryCategory> = {
  DIVISIONS: 'Division',
  LOCATIONS: 'Location',
  FUNCTIONS: 'Function',
  'GL ACCOUNTS': 'Chart of Accounts',
};

function migrateLegacyCategory(entry: LibraryEntry & { subcategory?: string }): LibraryEntry | null {
  const category = entry.category as string;
  if (category === LEGACY_GENERAL_LEDGER_CATEGORY) {
    const { subcategory: _subcategory, ...rest } = entry;
    return { ...rest, category: 'Chart of Accounts' };
  }
  if (category === LEGACY_CUBIC_BUSINESS_MODEL_CATEGORY) {
    const { subcategory, ...rest } = entry;
    return { ...rest, category: LEGACY_SUBCATEGORY_TO_CATEGORY[subcategory ?? ''] ?? 'Chart of Accounts' };
  }
  return null;
}

export async function listLibraryEntries(): Promise<LibraryEntry[]> {
  const db = await openDb();
  const entries = await new Promise<LibraryEntry[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as LibraryEntry[]);
    req.onerror = () => reject(req.error);
  });
  const migrations = entries
    .map((e) => ({ original: e, migrated: migrateLegacyCategory(e) }))
    .filter((m): m is { original: LibraryEntry; migrated: LibraryEntry } => m.migrated !== null);
  if (migrations.length === 0) return entries;
  await Promise.all(migrations.map((m) => putEntry(m.migrated)));
  const migratedById = new Map(migrations.map((m) => [m.original.id, m.migrated]));
  return entries.map((e) => migratedById.get(e.id) ?? e);
}

function putEntry(entry: LibraryEntry): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

export async function deleteLibraryEntry(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function nextOrder(entries: LibraryEntry[], category: LibraryCategory): number {
  const inScope = entries.filter((e) => e.category === category);
  return inScope.length === 0 ? 0 : Math.max(...inScope.map((e) => e.order)) + 1;
}

/** Saves a snapshot of `project` as a brand-new Library entry under `category`. */
export async function addLibraryEntry(project: TaxonomyProject, category: LibraryCategory): Promise<LibraryEntry> {
  const entries = await listLibraryEntries();
  const entry: LibraryEntry = {
    id: crypto.randomUUID(),
    category,
    order: nextOrder(entries, category),
    project,
    updatedAt: new Date().toISOString(),
  };
  await putEntry(entry);
  return entry;
}

/** Overwrites an existing entry's saved taxonomy content (category/order untouched). */
export async function updateLibraryEntryProject(id: string, project: TaxonomyProject): Promise<void> {
  const entries = await listLibraryEntries();
  const existing = entries.find((e) => e.id === id);
  if (!existing) throw new Error('This Library entry no longer exists.');
  await putEntry({ ...existing, project, updatedAt: new Date().toISOString() });
}

/** Renames an entry — patches the stored project's own title, so it stays the single
 * source of truth for what's shown both in the Library and if the taxonomy is reopened. */
export async function renameLibraryEntry(id: string, title: string): Promise<void> {
  const entries = await listLibraryEntries();
  const existing = entries.find((e) => e.id === id);
  if (!existing) throw new Error('This Library entry no longer exists.');
  await putEntry({ ...existing, project: { ...existing.project, title }, updatedAt: new Date().toISOString() });
}

/** Sets the full ordered id list for one category — covers both a plain reorder within that
 * category and a move in from a different one in the same call (every id passed here ends up
 * in `category`, at its position in the array). */
export async function setLibraryCategoryOrder(category: LibraryCategory, orderedIds: string[]): Promise<void> {
  const entries = await listLibraryEntries();
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    orderedIds.forEach((id, index) => {
      const existing = entries.find((e) => e.id === id);
      if (existing) store.put({ ...existing, category, order: index });
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
