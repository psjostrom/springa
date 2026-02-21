import { createClient, type Client } from "@libsql/client";
import { createHash } from "crypto";
import type { XdripReading } from "./xdrip";

// --- Database client ---

let _db: Client;
function db() {
  if (!_db) {
    _db = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });
  }
  return _db;
}

/** Schema DDL — used by migration and tests. */
export const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS user_settings (
  email              TEXT PRIMARY KEY,
  intervals_api_key  TEXT,
  google_ai_api_key  TEXT,
  xdrip_secret       TEXT
);

CREATE TABLE IF NOT EXISTS xdrip_auth (
  secret_hash  TEXT PRIMARY KEY,
  email        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_xdrip_auth_email ON xdrip_auth(email);

CREATE TABLE IF NOT EXISTS xdrip_readings (
  email     TEXT NOT NULL,
  ts        INTEGER NOT NULL,
  mmol      REAL NOT NULL,
  sgv       INTEGER NOT NULL,
  direction TEXT NOT NULL,
  PRIMARY KEY (email, ts)
);

CREATE TABLE IF NOT EXISTS bg_cache (
  email          TEXT NOT NULL,
  activity_id    TEXT NOT NULL,
  category       TEXT NOT NULL,
  fuel_rate      REAL,
  start_bg       REAL NOT NULL,
  glucose        TEXT NOT NULL,
  hr             TEXT NOT NULL,
  run_bg_context TEXT,
  PRIMARY KEY (email, activity_id)
);

CREATE TABLE IF NOT EXISTS run_analysis (
  email       TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  text        TEXT NOT NULL,
  PRIMARY KEY (email, activity_id)
);
`;

// --- Types ---

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

// --- User settings ---

export async function getUserSettings(email: string): Promise<UserSettings> {
  const result = await db().execute({
    sql: "SELECT intervals_api_key, google_ai_api_key, xdrip_secret FROM user_settings WHERE email = ?",
    args: [email],
  });
  if (result.rows.length === 0) return {};
  const r = result.rows[0];
  const settings: UserSettings = {};
  if (r.intervals_api_key) settings.intervalsApiKey = r.intervals_api_key as string;
  if (r.google_ai_api_key) settings.googleAiApiKey = r.google_ai_api_key as string;
  if (r.xdrip_secret) settings.xdripSecret = r.xdrip_secret as string;
  return settings;
}

export async function saveUserSettings(
  email: string,
  partial: Partial<UserSettings>,
): Promise<void> {
  await db().execute({
    sql: `INSERT INTO user_settings (email, intervals_api_key, google_ai_api_key, xdrip_secret)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET
            intervals_api_key = COALESCE(excluded.intervals_api_key, intervals_api_key),
            google_ai_api_key = COALESCE(excluded.google_ai_api_key, google_ai_api_key),
            xdrip_secret = COALESCE(excluded.xdrip_secret, xdrip_secret)`,
    args: [
      email,
      partial.intervalsApiKey ?? null,
      partial.googleAiApiKey ?? null,
      partial.xdripSecret ?? null,
    ],
  });
}

// --- BG cache ---

export async function getBGCache(email: string): Promise<CachedActivity[]> {
  const result = await db().execute({
    sql: "SELECT activity_id, category, fuel_rate, start_bg, glucose, hr, run_bg_context FROM bg_cache WHERE email = ?",
    args: [email],
  });
  return result.rows.map((r) => ({
    activityId: r.activity_id as string,
    category: r.category as CachedActivity["category"],
    fuelRate: r.fuel_rate as number | null,
    startBG: r.start_bg as number,
    glucose: JSON.parse(r.glucose as string),
    hr: JSON.parse(r.hr as string),
    runBGContext: r.run_bg_context ? JSON.parse(r.run_bg_context as string) : null,
  }));
}

export async function saveBGCache(
  email: string,
  data: CachedActivity[],
): Promise<void> {
  await db().batch(
    [
      { sql: "DELETE FROM bg_cache WHERE email = ?", args: [email] },
      ...data.map((a) => ({
        sql: `INSERT INTO bg_cache (email, activity_id, category, fuel_rate, start_bg, glucose, hr, run_bg_context)
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
    ],
    "write",
  );
}

// --- xDrip auth + readings ---

export function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

export async function saveXdripAuth(
  email: string,
  secret: string,
): Promise<void> {
  const hash = sha1(secret);
  // Delete any existing auth entries for this user, then insert new one
  await db().batch(
    [
      { sql: "DELETE FROM xdrip_auth WHERE email = ?", args: [email] },
      {
        sql: "INSERT INTO xdrip_auth (secret_hash, email) VALUES (?, ?)",
        args: [hash, email],
      },
    ],
    "write",
  );
  await saveUserSettings(email, { xdripSecret: secret });
}

export async function lookupXdripUser(
  apiSecretHash: string,
): Promise<string | null> {
  const result = await db().execute({
    sql: "SELECT email FROM xdrip_auth WHERE secret_hash = ?",
    args: [apiSecretHash],
  });
  return result.rows.length > 0 ? (result.rows[0].email as string) : null;
}

/** Month key in YYYY-MM format from a timestamp in ms. */
export function monthKey(tsMs: number): string {
  const d = new Date(tsMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
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

  // Convert month strings to timestamp range
  const ranges = months.map((m) => {
    const [y, mo] = m.split("-").map(Number);
    const start = Date.UTC(y, mo - 1, 1);
    const end = Date.UTC(y, mo, 1);
    return { start, end };
  });

  const minTs = Math.min(...ranges.map((r) => r.start));
  const maxTs = Math.max(...ranges.map((r) => r.end));

  const result = await db().execute({
    sql: "SELECT ts, mmol, sgv, direction FROM xdrip_readings WHERE email = ? AND ts >= ? AND ts < ? ORDER BY ts",
    args: [email, minTs, maxTs],
  });

  return result.rows.map((r) => ({
    ts: r.ts as number,
    mmol: r.mmol as number,
    sgv: r.sgv as number,
    direction: r.direction as string,
  }));
}

/** Save readings. Uses INSERT OR REPLACE for dedup by (email, ts). */
export async function saveXdripReadings(
  email: string,
  readings: XdripReading[],
): Promise<void> {
  if (readings.length === 0) return;

  // Batch in groups of 100 to stay under libSQL parameter limits
  const BATCH_SIZE = 100;
  for (let i = 0; i < readings.length; i += BATCH_SIZE) {
    const chunk = readings.slice(i, i + BATCH_SIZE);
    await db().batch(
      chunk.map((r) => ({
        sql: `INSERT OR REPLACE INTO xdrip_readings (email, ts, mmol, sgv, direction)
              VALUES (?, ?, ?, ?, ?)`,
        args: [email, r.ts, r.mmol, r.sgv, r.direction],
      })),
      "write",
    );
  }
}

// --- Run history summaries ---

export interface RunSummary {
  activityId: string;
  category: string;
  fuelRate: number | null;
  startBG: number;
  endBG: number | null;
  avgHR: number | null;
  dropRate: number | null; // mmol/L per 10min
}

export async function getRecentRunSummaries(
  email: string,
  limit: number = 10,
): Promise<RunSummary[]> {
  const result = await db().execute({
    sql: `SELECT b.activity_id, b.category, b.fuel_rate, b.start_bg, b.glucose, b.hr
          FROM bg_cache b
          INNER JOIN run_analysis r ON b.email = r.email AND b.activity_id = r.activity_id
          WHERE b.email = ?
          ORDER BY b.ROWID DESC
          LIMIT ?`,
    args: [email, limit],
  });

  return result.rows.map((r) => {
    const glucose: { time: number; value: number }[] = JSON.parse(r.glucose as string);
    const hr: { time: number; value: number }[] = JSON.parse(r.hr as string);

    const endBG = glucose.length > 0 ? glucose[glucose.length - 1].value : null;
    const avgHR = hr.length > 0
      ? Math.round(hr.reduce((s, p) => s + p.value, 0) / hr.length)
      : null;

    let dropRate: number | null = null;
    if (glucose.length >= 2) {
      const durationSec = glucose[glucose.length - 1].time - glucose[0].time;
      const duration10m = durationSec / 600;
      if (duration10m > 0) {
        dropRate = (glucose[glucose.length - 1].value - glucose[0].value) / duration10m;
      }
    }

    return {
      activityId: r.activity_id as string,
      category: r.category as string,
      fuelRate: r.fuel_rate as number | null,
      startBG: r.start_bg as number,
      endBG,
      avgHR,
      dropRate,
    };
  });
}

// --- Run analysis cache ---

export async function getRunAnalysis(
  email: string,
  activityId: string,
): Promise<string | null> {
  const result = await db().execute({
    sql: "SELECT text FROM run_analysis WHERE email = ? AND activity_id = ?",
    args: [email, activityId],
  });
  return result.rows.length > 0 ? (result.rows[0].text as string) : null;
}

export async function saveRunAnalysis(
  email: string,
  activityId: string,
  text: string,
): Promise<void> {
  await db().execute({
    sql: "INSERT OR REPLACE INTO run_analysis (email, activity_id, text) VALUES (?, ?, ?)",
    args: [email, activityId, text],
  });
}
