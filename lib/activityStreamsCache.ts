import type { CachedActivity } from "./activityStreamsDb";

// v7: adds peak60mAboveEnd to runBGContext.post (PR #192). Bumping the key
// forces a refetch so existing users pick up the backfilled field instead of
// silently rendering empty AfterPatternCards.
const LS_KEY = "bgcache_v7";

export function readLocalCache(): CachedActivity[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as CachedActivity[]) : [];
  } catch {
    return [];
  }
}

export function writeLocalCache(data: CachedActivity[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {
    // quota exceeded — non-critical
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
