// "HDD Folders" (James's ask): create real folders on the user's hard drive mirroring the
// current taxonomy's structure -- one folder per row, nested exactly the way the taxonomy's own
// rows are, not just the deepest ("leaf") entries. Uses the File System Access API
// (window.showDirectoryPicker, Chromium browsers only) -- the same mechanism, and the same
// browser-support ceiling, as the existing "Choose Export Folder" feature (exportFolder.ts).

import type { TaxonomyRow } from './types';

export function supportsHddFolders(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

// A row's level is the position of its deepest populated description column (Section 4.1);
// -1 means the row has no description at all yet, and so is not a folder in its own right.
function levelOf(row: TaxonomyRow): number {
  for (let i = row.descriptions.length - 1; i >= 0; i--) {
    if ((row.descriptions[i] ?? '').trim()) return i;
  }
  return -1;
}

// Same nearest-preceding-shallower-row convention every other ancestor lookup in this app uses
// (guidance.ts's own immediateParentIndex) -- a row's parent is the closest row above it, in
// grid order, at a shallower level.
function immediateParentIndex(rows: TaxonomyRow[], idx: number): number {
  const level = levelOf(rows[idx]);
  for (let i = idx - 1; i >= 0; i--) {
    const l = levelOf(rows[i]);
    if (l !== -1 && l < level) return i;
  }
  return -1;
}

// Characters Windows forbids in a folder name, plus control characters; trailing dots/spaces are
// also stripped since Windows silently drops them itself, which could otherwise let two
// different-looking taxonomy entries collide on disk with no warning at all.
// eslint-disable-next-line no-control-regex -- deliberate: strip control characters too
const ILLEGAL_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

export function sanitizeFolderName(name: string): string {
  const cleaned = name.replace(ILLEGAL_CHARS, '_').trim().replace(/[. ]+$/, '');
  return cleaned || 'Unnamed';
}

export interface HddFolderPlanRow {
  rowId: string;
  /** Sanitized, root to this row -- e.g. ["1 Admin", "Personnel Administration"]. */
  pathSegments: string[];
}

/** One entry per row that has a description -- every row becomes its own folder, nested under
 * its ancestors' folders, mirroring the taxonomy's hierarchy exactly (headings included, not
 * just leaves -- a heading is a real row, so it's a real folder too). Sibling folders that would
 * otherwise land on the very same sanitized name (e.g. two descriptions differing only in a
 * character Windows forbids) get " (2)", " (3)", ... appended so neither silently overwrites or
 * merges into the other on disk. */
export function buildHddFolderPlan(rows: TaxonomyRow[]): HddFolderPlanRow[] {
  const plan: HddFolderPlanRow[] = [];
  const pathByIndex = new Map<number, string[]>();
  const usedNamesByParent = new Map<number, Set<string>>();
  rows.forEach((row, idx) => {
    const level = levelOf(row);
    if (level === -1) return;
    const parentIdx = immediateParentIndex(rows, idx);
    const parentPath = parentIdx !== -1 ? (pathByIndex.get(parentIdx) ?? []) : [];

    let name = sanitizeFolderName(row.descriptions[level] ?? '');
    let used = usedNamesByParent.get(parentIdx);
    if (!used) {
      used = new Set();
      usedNamesByParent.set(parentIdx, used);
    }
    if (used.has(name)) {
      let suffix = 2;
      while (used.has(`${name} (${suffix})`)) suffix++;
      name = `${name} (${suffix})`;
    }
    used.add(name);

    const path = [...parentPath, name];
    pathByIndex.set(idx, path);
    plan.push({ rowId: row.id, pathSegments: path });
  });
  return plan;
}

/** Walks the plan (parents always precede their children, since buildHddFolderPlan walks `rows`
 * top to bottom the same way the grid itself is ordered) and creates every folder under `root`.
 * `getDirectoryHandle(..., { create: true })` reuses a folder that already exists at that exact
 * path rather than erroring, so this is safe to re-run against a folder from a previous, partial
 * run -- nothing already there is touched or recreated. */
export async function createHddFolders(
  root: FileSystemDirectoryHandle,
  plan: HddFolderPlanRow[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ created: number; total: number }> {
  const dirCache = new Map<string, FileSystemDirectoryHandle>();
  dirCache.set('', root);
  let created = 0;
  for (const { pathSegments } of plan) {
    let currentKey = '';
    let currentHandle = root;
    for (const segment of pathSegments) {
      const nextKey = currentKey ? `${currentKey}/${segment}` : segment;
      let handle = dirCache.get(nextKey);
      if (!handle) {
        handle = await currentHandle.getDirectoryHandle(segment, { create: true });
        dirCache.set(nextKey, handle);
      }
      currentKey = nextKey;
      currentHandle = handle;
    }
    created++;
    onProgress?.(created, plan.length);
  }
  return { created, total: plan.length };
}
