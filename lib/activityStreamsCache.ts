import type { CachedActivity } from "./activityStreamsDb";

export const BG_MODEL_MAX_ACTIVITIES = 15;
// v2: glucose now comes from xDrip, not streams - invalidate old cache
const LS_KEY = "bgcache_v2";
const OLD_LS_KEY = "bgcache";

export function readLocalCache(): CachedActivity[] {
  try {
    // Clean up old cache key on first read
    if (typeof localStorage !== "undefined" && localStorage.getItem(OLD_LS_KEY)) {
      localStorage.removeItem(OLD_LS_KEY);
    }
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

export async function saveBGCacheRemote(data: CachedActivity[]): Promise<void> {
  try {
    await fetch("/api/bg-cache", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch {
    // non-critical — next visit will rebuild
  }
}
