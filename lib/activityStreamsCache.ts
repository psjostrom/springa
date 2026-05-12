import type { CachedActivity } from "./activityStreamsDb";
import type { BGContextStatus } from "./runBGContext";

// v8: runBGContext moved from "persisted on activity_streams" to
// "server-computed on every read of getActivityStreams from Scout's batch
// endpoint". Two protections layer here:
//   1. `useStreamCache.mergeCaches` prefers the server's runBGContext over
//      the cached one (so a fresh server compute always wins).
//   2. Bumping the cache key forces clients to drop entries that pre-date
//      this PR's schema. Belt-and-suspenders against any other field shape
//      drift between v7 and v8 the merge wouldn't catch.
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

export interface FetchBGCacheResult {
  activities: CachedActivity[];
  /**
   * Why activities[*].runBGContext might be null:
   *  - "ok" / "no-input"   → Scout responded; null contexts are real (no readings in window)
   *  - "upstream-error"    → Scout request threw — show banner, predictions are stale
   *  - "no-credentials"    → Nightscout not connected — show settings link
   *  - "fetch-error"       → /api/bg-cache itself failed — local-only fallback
   */
  bgContextStatus: BGContextStatus | "fetch-error";
}

export async function fetchBGCache(): Promise<FetchBGCacheResult> {
  try {
    const res = await fetch("/api/bg-cache");
    if (!res.ok) return { activities: [], bgContextStatus: "fetch-error" };
    const json = (await res.json()) as
      | { activities: CachedActivity[]; bgContextStatus: BGContextStatus }
      | CachedActivity[];
    // Backwards compatibility: pre-PR-#192 the route returned a bare array.
    // After the rename the route returns the structured shape. Both still
    // hit prod briefly during the rolling deploy; treat the legacy shape as
    // "ok" so we don't trigger the banner on the legacy path.
    if (Array.isArray(json)) {
      return { activities: json, bgContextStatus: "ok" };
    }
    return { activities: json.activities, bgContextStatus: json.bgContextStatus };
  } catch {
    return { activities: [], bgContextStatus: "fetch-error" };
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
