// The Library (left-hand sidebar): a place to keep multiple built taxonomies for quick
// reference and further work, organised under a fixed set of headings. Per-account cloud
// storage (Supabase, table `library_entries` — supabase/0002_create_library_entries.sql),
// replacing the previous browser-local IndexedDB storage: each signed-in user's Library now
// lives on their own account, isolated from every other user by Row Level Security, and follows
// them to any device/browser they sign into rather than being stranded on one machine. It's
// still an additional, optional place to park a copy of a taxonomy — a taxonomy's own save/load-
// to-file flow (Section 8) is completely unaffected.

import type { TaxonomyProject } from './types';
import { isTaxonomyProject, migrateProjectData } from './storage';
import { supabase } from './supabaseClient';

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

interface LibraryRow {
  id: string;
  user_id: string;
  category: string;
  entry_order: number;
  project: TaxonomyProject;
  updated_at: string;
}

const TABLE_NAME = 'library_entries';

function rowToEntry(row: LibraryRow): LibraryEntry {
  return { id: row.id, category: row.category as LibraryCategory, order: row.entry_order, project: row.project, updatedAt: row.updated_at };
}

/** Every Library operation is scoped to the signed-in user's own account — Row Level Security
 * enforces this server-side regardless, but resolving the id here lets each call build its own
 * row explicitly rather than relying on a default, and gives a clear, catchable error (rather
 * than an opaque RLS rejection) on the one path that genuinely shouldn't happen: a Library call
 * made with no active session. */
async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('You need to be signed in to use the Library.');
  return data.user.id;
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
  const userId = await currentUserId();
  const { data, error } = await supabase.from(TABLE_NAME).select('*').eq('user_id', userId);
  if (error) throw new Error(error.message);
  const entries = (data as LibraryRow[]).map(rowToEntry);
  const migrations = entries
    .map((e) => ({ original: e, migrated: migrateLegacyCategory(e) }))
    .filter((m): m is { original: LibraryEntry; migrated: LibraryEntry } => m.migrated !== null);
  if (migrations.length > 0) {
    await Promise.all(migrations.map((m) => putEntry(m.migrated)));
  }
  const migratedById = new Map(migrations.map((m) => [m.original.id, m.migrated]));
  // James's report: an entry saved to the Library before a newer settings field existed (e.g.
  // customAbbreviations) came back into the live app with that field still `undefined` once
  // reopened — this read straight from storage, unlike Load from File, which already runs this
  // same migration. Any code that spreads that field (toProperCasePreservingAbbreviations,
  // findUnknownAllCapsWords) threw the moment it ran, which read as "the button doesn't
  // register." Not written back to storage (unlike the category migration above) — cheap and
  // idempotent enough to just re-run on every load rather than adding another persisted-write
  // path for it.
  return entries.map((e) => {
    const base = migratedById.get(e.id) ?? e;
    return { ...base, project: migrateProjectData(base.project) };
  });
}

async function putEntry(entry: LibraryEntry): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from(TABLE_NAME).upsert({
    id: entry.id,
    user_id: userId,
    category: entry.category,
    entry_order: entry.order,
    project: entry.project,
    updated_at: entry.updatedAt,
  });
  if (error) throw new Error(error.message);
}

export async function deleteLibraryEntry(id: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from(TABLE_NAME).delete().eq('id', id).eq('user_id', userId);
  if (error) throw new Error(error.message);
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
  const userId = await currentUserId();
  const entries = await listLibraryEntries();
  const rows = orderedIds
    .map((id, index) => {
      const existing = entries.find((e) => e.id === id);
      if (!existing) return null;
      return {
        id,
        user_id: userId,
        category,
        entry_order: index,
        project: existing.project,
        updated_at: existing.updatedAt,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  if (rows.length === 0) return;
  const { error } = await supabase.from(TABLE_NAME).upsert(rows);
  if (error) throw new Error(error.message);
}

// One-time migration off this browser's old, pre-cloud IndexedDB storage — the exact shape
// library.ts used before per-account cloud storage existed. Read-only: never written back to,
// and never deleted, so it stays a safety net regardless of how the cloud migration goes.
const LEGACY_DB_NAME = 'taxonomy-builder-library';
const LEGACY_STORE_NAME = 'entries';

function openLegacyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LEGACY_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LEGACY_STORE_NAME)) {
        db.createObjectStore(LEGACY_STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readLegacyEntries(): Promise<LibraryEntry[]> {
  try {
    const db = await openLegacyDb();
    return await new Promise<LibraryEntry[]>((resolve, reject) => {
      const tx = db.transaction(LEGACY_STORE_NAME, 'readonly');
      const req = tx.objectStore(LEGACY_STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result as LibraryEntry[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    // No legacy IndexedDB at all (a browser/profile that never had the old Library) — nothing
    // to migrate, not an error.
    return [];
  }
}

/** Brings this browser's old local Library across to the signed-in user's cloud account —
 * called once on startup (App.tsx), before the first `listLibraryEntries()`. Only acts when the
 * cloud Library is genuinely empty AND this browser has local entries to offer, so it never
 * overwrites or duplicates onto an account that already has cloud entries (including from a
 * previous run of this same migration). Returns how many entries were migrated, or 0. */
export async function migrateLegacyLocalLibrary(): Promise<number> {
  const cloud = await listLibraryEntries();
  if (cloud.length > 0) return 0;
  const local = await readLegacyEntries();
  if (local.length === 0) return 0;
  for (const entry of local) {
    await addLibraryEntry(migrateProjectData(entry.project), entry.category);
  }
  return local.length;
}

// Export/Import Library: James's request for a way to (a) carry his Library to a new machine —
// this account's Library now already follows them to any device (see the file-level comment
// above), but Export/Import remains useful for handing a curated subset to interested parties as
// a demo, or bundling sample files with a sale — and (b) that same "hand a subset to someone
// else" need. Both are the same underlying need: a portable file holding one or more Library
// entries, built from a user-chosen selection (LibrarySidebar.tsx), downloaded via download.ts's
// existing downloadBlob helper. Import always merges into whatever Library is already open — a
// fresh id per entry — never replacing or overwriting, matching the app's established "never
// silently overwrite" convention (see confirmAddToLibrary's own overwrite-vs-new-version prompt
// in App.tsx).
const LIBRARY_EXPORT_BUNDLE_TYPE = 'taxonomy-builder-library-export';

export interface LibraryExportBundle {
  type: typeof LIBRARY_EXPORT_BUNDLE_TYPE;
  version: 1;
  exportedAt: string;
  entries: Array<{ category: LibraryCategory; project: TaxonomyProject }>;
}

/** Builds a portable bundle from a chosen set of Library entries, ready to hand to downloadBlob. */
export function buildLibraryExportBundle(entries: LibraryEntry[]): LibraryExportBundle {
  return {
    type: LIBRARY_EXPORT_BUNDLE_TYPE,
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: entries.map((e) => ({ category: e.category, project: e.project })),
  };
}

/** Parses and validates a Library export file's contents, running every entry's project through
 * the same backward-compatibility migrations a plain "Load from File" project gets — so a bundle
 * exported by an older build still imports cleanly. Throws with a user-facing message on
 * anything that doesn't look like a genuine Library export. */
export function parseLibraryExportBundle(data: unknown): LibraryExportBundle {
  if (typeof data !== 'object' || data === null) {
    throw new Error('This file does not look like a Library export.');
  }
  const bundle = data as Record<string, unknown>;
  if (bundle.type !== LIBRARY_EXPORT_BUNDLE_TYPE || !Array.isArray(bundle.entries)) {
    throw new Error('This file does not look like a Library export.');
  }
  const categoryNames: readonly string[] = LIBRARY_CATEGORIES;
  const entries = bundle.entries.map((raw, index) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`Entry ${index + 1} in this file is not valid.`);
    }
    const r = raw as Record<string, unknown>;
    if (!isTaxonomyProject(r.project)) {
      throw new Error(`Entry ${index + 1} in this file does not contain a valid taxonomy.`);
    }
    const category = typeof r.category === 'string' && categoryNames.includes(r.category)
      ? (r.category as LibraryCategory)
      : 'General / Other';
    return { category, project: migrateProjectData(r.project) };
  });
  return {
    type: LIBRARY_EXPORT_BUNDLE_TYPE,
    version: 1,
    exportedAt: typeof bundle.exportedAt === 'string' ? bundle.exportedAt : new Date().toISOString(),
    entries,
  };
}

/** Adds every entry in `bundle` to the Library as a brand-new entry (fresh id, appended to its
 * category) — always merges into what's already there, never replaces or overwrites an existing
 * entry. Returns how many entries were added. */
export async function importLibraryBundle(bundle: LibraryExportBundle): Promise<number> {
  for (const { category, project } of bundle.entries) {
    await addLibraryEntry(project, category);
  }
  return bundle.entries.length;
}
