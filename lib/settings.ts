import { Redis } from "@upstash/redis";
import { createHash } from "crypto";
import type { XdripReading } from "./xdrip";

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
  xdripSecret?: string;
}

export interface CachedActivity {
  activityId: string;
  category: import("./types").WorkoutCategory;
  fuelRate: number | null;
  startBG: number;
  glucose: { time: number; value: number }[];
  hr: { time: number; value: number }[];
  runBGContext?: import("./runBGContext").RunBGContext | null;
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

// --- xDrip auth + readings ---

// Readings are sharded by month (xdrip:{email}:2026-02) to stay under
// Upstash free-tier 1 MB max value size. Each month is ~560 KB at
// Dexcom G6 5-min resolution. Persisted indefinitely for post-run analysis.

function xdripAuthKey(sha1: string) {
  return `xdrip-auth:${sha1}`;
}

/** Month key in YYYY-MM format from a timestamp in ms. */
export function monthKey(tsMs: number): string {
  const d = new Date(tsMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function xdripShardKey(email: string, month: string) {
  return `xdrip:${email}:${month}`;
}

export function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

export async function saveXdripAuth(
  email: string,
  secret: string,
): Promise<void> {
  // Remove old reverse mapping if user had a previous secret
  const existing = await getUserSettings(email);
  if (existing.xdripSecret) {
    const oldHash = sha1(existing.xdripSecret);
    await redis().del(xdripAuthKey(oldHash));
  }

  const hash = sha1(secret);
  await redis().set(xdripAuthKey(hash), email);
  await saveUserSettings(email, { xdripSecret: secret });
}

export async function lookupXdripUser(
  apiSecretHash: string,
): Promise<string | null> {
  return redis().get<string>(xdripAuthKey(apiSecretHash));
}

/** Read readings for specific months. Defaults to current + previous month. */
export async function getXdripReadings(
  email: string,
  months?: string[],
): Promise<XdripReading[]> {
  if (!months) {
    const now = Date.now();
    const cur = monthKey(now);
    const prev = monthKey(now - 30 * 24 * 60 * 60 * 1000);
    months = cur === prev ? [cur] : [prev, cur];
  }

  const results = await Promise.all(
    months.map((m) => redis().get<XdripReading[]>(xdripShardKey(email, m))),
  );

  return results.flatMap((r) => r ?? []).sort((a, b) => a.ts - b.ts);
}

// --- Run analysis cache ---

function runAnalysisKey(email: string, activityId: string) {
  return `run-analysis:${email}:${activityId}`;
}

export async function getRunAnalysis(
  email: string,
  activityId: string,
): Promise<string | null> {
  return redis().get<string>(runAnalysisKey(email, activityId));
}

export async function saveRunAnalysis(
  email: string,
  activityId: string,
  text: string,
): Promise<void> {
  await redis().set(runAnalysisKey(email, activityId), text);
}

/** Save readings into their monthly shards. Merges with existing data per shard. */
export async function saveXdripReadings(
  email: string,
  readings: XdripReading[],
): Promise<void> {
  // Group by month
  const byMonth = new Map<string, XdripReading[]>();
  for (const r of readings) {
    const mk = monthKey(r.ts);
    const list = byMonth.get(mk) ?? [];
    list.push(r);
    byMonth.set(mk, list);
  }

  // Save each shard
  await Promise.all(
    [...byMonth.entries()].map(([month, shard]) =>
      redis().set(xdripShardKey(email, month), shard),
    ),
  );
}
