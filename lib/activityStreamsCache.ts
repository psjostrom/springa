import type { CachedActivity } from "./activityStreamsDb";

// v8: runBGContext is now computed server-side on every read (Scout batch
// endpoint) instead of being persisted to activity_streams.run_bg_context.
// Older localStorage rows lack runBGContext entirely, and the merge prefers
// localStorage — so without bumping, stale rows mask the freshly-computed
// server context and the Tomorrow card renders "No matching history" until
// localStorage gets manually wiped.
const LS_KEY = "bgcache_v8";
const STALE_LS_KEYS = ["bgcache_v7", "bgcache_v6", "bgcache_v5"];

/** Drop old cache versions so they don't keep eating localStorage quota.
 *  The full payload is several MB; one stale copy can exhaust the per-origin
 *  budget and cause silent setItem failures on the current key. */
function evictStaleVersions(): void {
  for (const k of STALE_LS_KEYS) {
    try {
      if (localStorage.getItem(k) != null) localStorage.removeItem(k);
    } catch {
      // localStorage may be unavailable in SSR/test contexts.
    }
  }
}

export function readLocalCache(): CachedActivity[] {
  evictStaleVersions();
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as CachedActivity[]) : [];
  } catch {
    return [];
  }
}

export function writeLocalCache(data: CachedActivity[]): void {
  evictStaleVersions();
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch (err) {
    // Quota exceeded is the most likely failure (each entry carries hr/pace/
    // glucose JSON arrays so the full payload is multiple MB). Surface it so
    // we notice — silent failure here means the next reload still hits the
    // server cold instead of hydrating from localStorage.
    console.warn("[bgcache] writeLocalCache failed:", err instanceof Error ? err.message : err);
  }
}

export async function fetchBGCache(): Promise<CachedActivity[]> {
  try {
    const res = await fetch("/api/bg-cache");
    if (!res.ok) return [];
    return (await res.json()) as CachedActivity[];
  } catch {
    return [];
  }
}

export async function saveBGCacheRemote(data: CachedActivity[]): Promise<boolean> {
  try {
    const res = await fetch("/api/bg-cache", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch {
    // non-critical — next visit will rebuild
    return false;
  }
}
