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

const XDRIP_TTL = 7200; // 2 hours

function xdripAuthKey(sha1: string) {
  return `xdrip-auth:${sha1}`;
}

function xdripReadingsKey(email: string) {
  return `xdrip:${email}`;
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

export async function getXdripReadings(
  email: string,
): Promise<XdripReading[]> {
  const data = await redis().get<XdripReading[]>(xdripReadingsKey(email));
  return data ?? [];
}

export async function saveXdripReadings(
  email: string,
  readings: XdripReading[],
): Promise<void> {
  // Trim to last 2 hours
  const cutoff = Date.now() - XDRIP_TTL * 1000;
  const trimmed = readings.filter((r) => r.ts > cutoff);
  await redis().set(xdripReadingsKey(email), trimmed, { ex: XDRIP_TTL });
}
