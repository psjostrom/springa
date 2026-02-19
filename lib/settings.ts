import { Redis } from "@upstash/redis";

let _redis: Redis;
function redis() {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    });
  }
  return _redis;
}

export interface UserSettings {
  intervalsApiKey?: string;
  googleAiApiKey?: string;
}

export interface CachedActivity {
  activityId: string;
  category: import("./types").WorkoutCategory;
  fuelRate: number | null;
  startBG: number;
  glucose: { time: number; value: number }[];
  hr: { time: number; value: number }[];
}

function key(email: string) {
  return `user:${email}`;
}

export async function getUserSettings(email: string): Promise<UserSettings> {
  const data = await redis().get<UserSettings>(key(email));
  return data ?? {};
}

export async function saveUserSettings(
  email: string,
  partial: Partial<UserSettings>,
): Promise<void> {
  const existing = await getUserSettings(email);
  await redis().set(key(email), { ...existing, ...partial });
}

// --- BG cache ---

function bgCacheKey(email: string) {
  return `bgcache:${email}`;
}

export async function getBGCache(email: string): Promise<CachedActivity[]> {
  const data = await redis().get<CachedActivity[]>(bgCacheKey(email));
  return data ?? [];
}

export async function saveBGCache(
  email: string,
  data: CachedActivity[],
): Promise<void> {
  await redis().set(bgCacheKey(email), data);
}
