/**
 * One-time migration script: Upstash Redis → Turso (libSQL/SQLite)
 *
 * Reads all data from Redis and writes to Turso tables.
 * Run locally with: npx tsx scripts/migrate-redis-to-turso.ts
 *
 * Requires env vars:
 *   KV_REST_API_URL, KV_REST_API_TOKEN  (Upstash source)
 *   TURSO_DATABASE_URL, TURSO_AUTH_TOKEN (Turso destination)
 */

import { Redis } from "@upstash/redis";
import { createClient } from "@libsql/client";
import { createHash } from "crypto";
import { SCHEMA_DDL } from "../lib/settings";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

async function scanKeys(pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | number = 0;
  do {
    const [next, batch] = await redis.scan(cursor, { match: pattern, count: 100 });
    cursor = next;
    keys.push(...batch);
  } while (String(cursor) !== "0");
  return keys;
}

async function migrateUserSettings() {
  console.log("\n--- User Settings ---");
  const keys = await scanKeys("user:*");
  console.log(`Found ${keys.length} user settings keys`);

  for (const key of keys) {
    const email = key.replace("user:", "");
    const data = await redis.get<Record<string, string>>(key);
    if (!data) continue;

    await turso.execute({
      sql: `INSERT OR REPLACE INTO user_settings (email, intervals_api_key, google_ai_api_key, xdrip_secret)
            VALUES (?, ?, ?, ?)`,
      args: [
        email,
        data.intervalsApiKey ?? null,
        data.googleAiApiKey ?? null,
        data.xdripSecret ?? null,
      ],
    });
    console.log(`  ✓ ${email}`);
  }
}

async function migrateXdripAuth() {
  console.log("\n--- xDrip Auth ---");
  const keys = await scanKeys("xdrip-auth:*");
  console.log(`Found ${keys.length} auth keys`);

  for (const key of keys) {
    const hash = key.replace("xdrip-auth:", "");
    const email = await redis.get<string>(key);
    if (!email) continue;

    await turso.execute({
      sql: "INSERT OR REPLACE INTO xdrip_auth (secret_hash, email) VALUES (?, ?)",
      args: [hash, email],
    });
    console.log(`  ✓ ${hash.substring(0, 8)}... → ${email}`);
  }
}

async function migrateXdripReadings() {
  console.log("\n--- xDrip Readings ---");
  const keys = await scanKeys("xdrip:*");
  // Filter out xdrip-auth keys
  const shardKeys = keys.filter((k) => !k.startsWith("xdrip-auth:"));
  console.log(`Found ${shardKeys.length} reading shards`);

  let totalReadings = 0;

  for (const key of shardKeys) {
    // key format: xdrip:{email}:{YYYY-MM}
    const parts = key.split(":");
    const email = parts[1];
    const month = parts[2];

    const raw = await redis.get<Array<{ ts: number; mmol: number; sgv: number; direction: string }>>(key);
    if (!raw || raw.length === 0) continue;
    const readings = raw.filter((r) => Number.isFinite(r.ts) && Number.isFinite(r.sgv) && Number.isFinite(r.mmol));
    const skipped = raw.length - readings.length;
    if (skipped > 0) console.log(`  ⚠ ${email} ${month}: skipped ${skipped} corrupted readings`);

    // Batch insert in groups of 100
    const BATCH_SIZE = 100;
    for (let i = 0; i < readings.length; i += BATCH_SIZE) {
      const chunk = readings.slice(i, i + BATCH_SIZE);
      await turso.batch(
        chunk.map((r) => ({
          sql: `INSERT OR REPLACE INTO xdrip_readings (email, ts, mmol, sgv, direction)
                VALUES (?, ?, ?, ?, ?)`,
          args: [
            email,
            Number(r.ts),
            Number(r.mmol),
            Number(r.sgv),
            String(r.direction ?? "NONE"),
          ],
        })),
        "write",
      );
    }

    totalReadings += readings.length;
    console.log(`  ✓ ${email} ${month}: ${readings.length} readings`);
  }

  console.log(`  Total: ${totalReadings} readings migrated`);
}

async function migrateBGCache() {
  console.log("\n--- BG Cache ---");
  const keys = await scanKeys("bgcache:*");
  console.log(`Found ${keys.length} cache keys`);

  for (const key of keys) {
    const email = key.replace("bgcache:", "");
    const data = await redis.get<Array<{
      activityId: string;
      category: string;
      fuelRate: number | null;
      startBG: number;
      glucose: Array<{ time: number; value: number }>;
      hr: Array<{ time: number; value: number }>;
      runBGContext?: unknown;
    }>>(key);
    if (!data || data.length === 0) continue;

    await turso.batch(
      data.map((a) => ({
        sql: `INSERT OR REPLACE INTO bg_cache (email, activity_id, category, fuel_rate, start_bg, glucose, hr, run_bg_context)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          email,
          a.activityId,
          a.category,
          a.fuelRate,
          a.startBG,
          JSON.stringify(a.glucose),
          JSON.stringify(a.hr),
          a.runBGContext ? JSON.stringify(a.runBGContext) : null,
        ],
      })),
      "write",
    );

    console.log(`  ✓ ${email}: ${data.length} activities`);
  }
}

async function migrateRunAnalysis() {
  console.log("\n--- Run Analysis ---");
  const keys = await scanKeys("run-analysis:*");
  console.log(`Found ${keys.length} analysis keys`);

  for (const key of keys) {
    // key format: run-analysis:{email}:{activityId}
    const parts = key.split(":");
    const email = parts[1];
    const activityId = parts.slice(2).join(":"); // activityId might contain colons
    const text = await redis.get<string>(key);
    if (!text) continue;

    await turso.execute({
      sql: "INSERT OR REPLACE INTO run_analysis (email, activity_id, text) VALUES (?, ?, ?)",
      args: [email, activityId, text],
    });
    console.log(`  ✓ ${email} / ${activityId}`);
  }
}

async function verify() {
  console.log("\n--- Verification ---");

  const tables = ["user_settings", "xdrip_auth", "xdrip_readings", "bg_cache", "run_analysis"];
  for (const table of tables) {
    const result = await turso.execute(`SELECT COUNT(*) as cnt FROM ${table}`);
    console.log(`  ${table}: ${result.rows[0].cnt} rows`);
  }
}

async function main() {
  console.log("=== Redis → Turso Migration ===");

  // Create tables
  console.log("\nCreating schema...");
  await turso.executeMultiple(SCHEMA_DDL);
  console.log("Schema ready.");

  await migrateUserSettings();
  await migrateXdripAuth();
  await migrateXdripReadings();
  await migrateBGCache();
  await migrateRunAnalysis();
  await verify();

  console.log("\n=== Migration complete ===");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
