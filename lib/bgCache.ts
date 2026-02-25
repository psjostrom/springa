import type { CachedActivity } from "./bgCacheDb";

export const BG_MODEL_MAX_ACTIVITIES = 15;
const LS_KEY = "bgcache";

export function readLocalCache(): CachedActivity[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
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
    return await res.json();
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
