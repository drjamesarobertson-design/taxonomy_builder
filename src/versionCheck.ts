// James's ask: some way to know a newer version of the app has shipped while this tab has been
// sitting open — the running JS is already loaded into memory, so nothing short of a genuine
// fresh request (a reload) ever picks up a new deploy. version.json (deploy-pages.yml) sits at a
// fixed, non-hashed path alongside the hashed JS bundle specifically so it's cheap to poll
// without pulling down the whole app again. Compares against this build's own VITE_PR_NUMBER
// (already baked in for the existing "PR #nnn" badge) — a mismatch means a newer build has been
// deployed since this tab loaded.

export interface VersionMarker {
  pr: string;
}

/** Fetches the currently-deployed version marker, bypassing any cache — a stale cached copy
 * would defeat the entire point of this check. Returns null on any failure (offline, a local
 * dev server with no version.json, a genuinely malformed response) rather than throwing —
 * missing this one check silently is far better than an error banner over a false alarm. */
export async function fetchDeployedVersion(): Promise<VersionMarker | null> {
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<VersionMarker>;
    return typeof data.pr === 'string' && data.pr ? { pr: data.pr } : null;
  } catch {
    return null;
  }
}
