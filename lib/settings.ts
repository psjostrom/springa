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
  xdrip_secret       TEXT,
  race_date          TEXT,
  timezone           TEXT,
  race_name          TEXT,
  race_dist          REAL,
  prefix             TEXT,
  total_weeks        INTEGER,
  start_km           REAL,
  lthr               INTEGER
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

CREATE TABLE IF NOT EXISTS push_subscriptions (
  email      TEXT NOT NULL,
  endpoint   TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (email, endpoint)
);

CREATE TABLE IF NOT EXISTS run_feedback (
  email      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  activity_id TEXT,
  rating     TEXT,
  comment    TEXT,
  distance   REAL,
  duration   REAL,
  avg_hr     REAL,
  PRIMARY KEY (email, created_at)
);

CREATE TABLE IF NOT EXISTS prerun_push_log (
  email      TEXT NOT NULL,
  event_date TEXT NOT NULL,
  sent_at    INTEGER NOT NULL,
  PRIMARY KEY (email, event_date)
);
`;

// --- Types ---

export interface UserSettings {
  intervalsApiKey?: string;
  googleAiApiKey?: string;
  xdripSecret?: string;
  raceDate?: string;
  timezone?: string;
  raceName?: string;
  raceDist?: number;
  prefix?: string;
  totalWeeks?: number;
  startKm?: number;
  lthr?: number;
  widgetOrder?: string[];
  hiddenWidgets?: string[];
}

export interface CachedActivity {
  activityId: string;
  category: import("./types").WorkoutCategory;
  fuelRate: number | null;
  startBG: number;
  glucose: { time: number; value: number }[];
  hr: { time: number; value: number }[];
  runBGContext?: import("./runBGContext").RunBGContext | null;
  pace?: { time: number; value: number }[];
  cadence?: { time: number; value: number }[];
  altitude?: { time: number; value: number }[];
  activityDate?: string;
}

// --- User settings ---

let _settingsMigrated = false;
async function migrateSettingsSchema(): Promise<void> {
  if (_settingsMigrated) return;
  _settingsMigrated = true;
  for (const col of [
    { name: "widget_order", type: "TEXT" },
    { name: "hidden_widgets", type: "TEXT" },
  ]) {
    try {
      await db().execute({
        sql: `ALTER TABLE user_settings ADD COLUMN ${col.name} ${col.type}`,
        args: [],
      });
    } catch {
      // column already exists — expected
    }
  }
}

export async function getUserSettings(email: string): Promise<UserSettings> {
  await migrateSettingsSchema();
  const result = await db().execute({
    sql: "SELECT intervals_api_key, google_ai_api_key, xdrip_secret, race_date, timezone, race_name, race_dist, prefix, total_weeks, start_km, lthr, widget_order, hidden_widgets FROM user_settings WHERE email = ?",
    args: [email],
  });
  if (result.rows.length === 0) return {};
  const r = result.rows[0];
  const settings: UserSettings = {};
  if (r.intervals_api_key) settings.intervalsApiKey = r.intervals_api_key as string;
  if (r.google_ai_api_key) settings.googleAiApiKey = r.google_ai_api_key as string;
  if (r.xdrip_secret) settings.xdripSecret = r.xdrip_secret as string;
  if (r.race_date) settings.raceDate = r.race_date as string;
  if (r.timezone) settings.timezone = r.timezone as string;
  if (r.race_name) settings.raceName = r.race_name as string;
  if (r.race_dist != null) settings.raceDist = r.race_dist as number;
  if (r.prefix) settings.prefix = r.prefix as string;
  if (r.total_weeks != null) settings.totalWeeks = r.total_weeks as number;
  if (r.start_km != null) settings.startKm = r.start_km as number;
  if (r.lthr != null) settings.lthr = r.lthr as number;
  if (r.widget_order) settings.widgetOrder = JSON.parse(r.widget_order as string);
  if (r.hidden_widgets) settings.hiddenWidgets = JSON.parse(r.hidden_widgets as string);
  return settings;
}

export async function saveUserSettings(
  email: string,
  partial: Partial<UserSettings>,
): Promise<void> {
  await migrateSettingsSchema();
  await db().execute({
    sql: `INSERT INTO user_settings (email, intervals_api_key, google_ai_api_key, xdrip_secret, race_date, timezone, race_name, race_dist, prefix, total_weeks, start_km, lthr, widget_order, hidden_widgets)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET
            intervals_api_key = COALESCE(excluded.intervals_api_key, intervals_api_key),
            google_ai_api_key = COALESCE(excluded.google_ai_api_key, google_ai_api_key),
            xdrip_secret = COALESCE(excluded.xdrip_secret, xdrip_secret),
            race_date = COALESCE(excluded.race_date, race_date),
            timezone = COALESCE(excluded.timezone, timezone),
            race_name = COALESCE(excluded.race_name, race_name),
            race_dist = COALESCE(excluded.race_dist, race_dist),
            prefix = COALESCE(excluded.prefix, prefix),
            total_weeks = COALESCE(excluded.total_weeks, total_weeks),
            start_km = COALESCE(excluded.start_km, start_km),
            lthr = COALESCE(excluded.lthr, lthr),
            widget_order = COALESCE(excluded.widget_order, widget_order),
            hidden_widgets = COALESCE(excluded.hidden_widgets, hidden_widgets)`,
    args: [
      email,
      partial.intervalsApiKey ?? null,
      partial.googleAiApiKey ?? null,
      partial.xdripSecret ?? null,
      partial.raceDate ?? null,
      partial.timezone ?? null,
      partial.raceName ?? null,
      partial.raceDist ?? null,
      partial.prefix ?? null,
      partial.totalWeeks ?? null,
      partial.startKm ?? null,
      partial.lthr ?? null,
      partial.widgetOrder ? JSON.stringify(partial.widgetOrder) : null,
      partial.hiddenWidgets ? JSON.stringify(partial.hiddenWidgets) : null,
    ],
  });
}

// --- BG cache ---

let _migrated = false;

/** Add stream columns to bg_cache if they don't exist yet (idempotent). */
async function migrateBGCacheSchema(): Promise<void> {
  if (_migrated) return;
  _migrated = true;
  const cols = [
    { name: "pace", type: "TEXT" },
    { name: "cadence", type: "TEXT" },
    { name: "altitude", type: "TEXT" },
    { name: "activity_date", type: "TEXT" },
  ];
  for (const col of cols) {
    try {
      await db().execute({
        sql: `ALTER TABLE bg_cache ADD COLUMN ${col.name} ${col.type}`,
        args: [],
      });
    } catch {
      // column already exists — expected
    }
  }
}

export async function getBGCache(email: string): Promise<CachedActivity[]> {
  await migrateBGCacheSchema();
  const result = await db().execute({
    sql: "SELECT activity_id, category, fuel_rate, start_bg, glucose, hr, run_bg_context, pace, cadence, altitude, activity_date FROM bg_cache WHERE email = ?",
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
    pace: r.pace ? JSON.parse(r.pace as string) : [],
    cadence: r.cadence ? JSON.parse(r.cadence as string) : [],
    altitude: r.altitude ? JSON.parse(r.altitude as string) : [],
    activityDate: (r.activity_date as string) || undefined,
  }));
}

export async function saveBGCache(
  email: string,
  data: CachedActivity[],
): Promise<void> {
  await migrateBGCacheSchema();
  await db().batch(
    [
      { sql: "DELETE FROM bg_cache WHERE email = ?", args: [email] },
      ...data.map((a) => ({
        sql: `INSERT INTO bg_cache (email, activity_id, category, fuel_rate, start_bg, glucose, hr, run_bg_context, pace, cadence, altitude, activity_date)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          email,
          a.activityId,
          a.category,
          a.fuelRate,
          a.startBG,
          JSON.stringify(a.glucose),
          JSON.stringify(a.hr),
          a.runBGContext ? JSON.stringify(a.runBGContext) : null,
          a.pace && a.pace.length > 0 ? JSON.stringify(a.pace) : null,
          a.cadence && a.cadence.length > 0 ? JSON.stringify(a.cadence) : null,
          a.altitude && a.altitude.length > 0 ? JSON.stringify(a.altitude) : null,
          a.activityDate ?? null,
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

// --- Push subscriptions ---

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function savePushSubscription(
  email: string,
  sub: PushSubscriptionRecord,
): Promise<void> {
  await db().execute({
    sql: `INSERT OR REPLACE INTO push_subscriptions (email, endpoint, p256dh, auth, created_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [email, sub.endpoint, sub.p256dh, sub.auth, Date.now()],
  });
}

export async function getPushSubscriptions(
  email: string,
): Promise<PushSubscriptionRecord[]> {
  const result = await db().execute({
    sql: "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE email = ?",
    args: [email],
  });
  return result.rows.map((r) => ({
    endpoint: r.endpoint as string,
    p256dh: r.p256dh as string,
    auth: r.auth as string,
  }));
}

export async function deletePushSubscription(
  email: string,
  endpoint: string,
): Promise<void> {
  await db().execute({
    sql: "DELETE FROM push_subscriptions WHERE email = ? AND endpoint = ?",
    args: [email, endpoint],
  });
}

// --- Run feedback ---

export interface RunFeedbackRecord {
  email: string;
  createdAt: number;
  activityId?: string;
  rating?: string;
  comment?: string;
  distance?: number;
  duration?: number;
  avgHr?: number;
  carbsG?: number;
}

let _feedbackMigrated = false;
async function migrateFeedbackSchema(): Promise<void> {
  if (_feedbackMigrated) return;
  _feedbackMigrated = true;
  try {
    await db().execute({
      sql: "ALTER TABLE run_feedback ADD COLUMN carbs_g REAL",
      args: [],
    });
  } catch {
    // column already exists — expected
  }
}

export async function saveRunFeedback(
  email: string,
  feedback: {
    createdAt: number;
    distance?: number;
    duration?: number;
    avgHr?: number;
  },
): Promise<void> {
  await db().execute({
    sql: `INSERT INTO run_feedback (email, created_at, distance, duration, avg_hr)
          VALUES (?, ?, ?, ?, ?)`,
    args: [
      email,
      feedback.createdAt,
      feedback.distance ?? null,
      feedback.duration ?? null,
      feedback.avgHr ?? null,
    ],
  });
}

export async function getRunFeedback(
  email: string,
  createdAt: number,
): Promise<RunFeedbackRecord | null> {
  await migrateFeedbackSchema();
  const result = await db().execute({
    sql: "SELECT email, created_at, activity_id, rating, comment, distance, duration, avg_hr, carbs_g FROM run_feedback WHERE email = ? AND created_at = ?",
    args: [email, createdAt],
  });
  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  return {
    email: r.email as string,
    createdAt: r.created_at as number,
    activityId: r.activity_id as string | undefined,
    rating: r.rating as string | undefined,
    comment: r.comment as string | undefined,
    distance: r.distance as number | undefined,
    duration: r.duration as number | undefined,
    avgHr: r.avg_hr as number | undefined,
    carbsG: r.carbs_g as number | undefined,
  };
}

export async function updateRunFeedback(
  email: string,
  createdAt: number,
  rating: string,
  comment?: string,
  carbsG?: number,
): Promise<void> {
  await migrateFeedbackSchema();
  await db().execute({
    sql: "UPDATE run_feedback SET rating = ?, comment = ?, carbs_g = ? WHERE email = ? AND created_at = ?",
    args: [rating, comment ?? null, carbsG ?? null, email, createdAt],
  });
}

/** Fetch recent rated feedback for the adapt prompt. */
export async function getRecentFeedback(
  email: string,
  limit: number = 10,
): Promise<RunFeedbackRecord[]> {
  await migrateFeedbackSchema();
  const result = await db().execute({
    sql: `SELECT email, created_at, activity_id, rating, comment, distance, duration, avg_hr, carbs_g
          FROM run_feedback
          WHERE email = ? AND rating IS NOT NULL AND rating != 'skipped'
          ORDER BY created_at DESC
          LIMIT ?`,
    args: [email, limit],
  });
  return result.rows.map((r) => ({
    email: r.email as string,
    createdAt: r.created_at as number,
    activityId: r.activity_id as string | undefined,
    rating: r.rating as string | undefined,
    comment: r.comment as string | undefined,
    distance: r.distance as number | undefined,
    duration: r.duration as number | undefined,
    avgHr: r.avg_hr as number | undefined,
    carbsG: r.carbs_g as number | undefined,
  }));
}

// --- Pre-run push dedup ---

export async function getPrerunPushUsers(): Promise<string[]> {
  const result = await db().execute({
    sql: "SELECT DISTINCT email FROM push_subscriptions",
    args: [],
  });
  return result.rows.map((r) => r.email as string);
}

export async function hasPrerunPushSent(
  email: string,
  eventDate: string,
): Promise<boolean> {
  const result = await db().execute({
    sql: "SELECT 1 FROM prerun_push_log WHERE email = ? AND event_date = ?",
    args: [email, eventDate],
  });
  return result.rows.length > 0;
}

export async function markPrerunPushSent(
  email: string,
  eventDate: string,
): Promise<void> {
  await db().execute({
    sql: "INSERT OR IGNORE INTO prerun_push_log (email, event_date, sent_at) VALUES (?, ?, ?)",
    args: [email, eventDate, Date.now()],
  });
}

/** Fetch only recent xDrip readings (default: last 30 minutes). */
export async function getRecentXdripReadings(
  email: string,
  withinMs: number = 30 * 60 * 1000,
): Promise<XdripReading[]> {
  const cutoff = Date.now() - withinMs;
  const result = await db().execute({
    sql: "SELECT ts, mmol, sgv, direction FROM xdrip_readings WHERE email = ? AND ts >= ? ORDER BY ts",
    args: [email, cutoff],
  });
  return result.rows.map((r) => ({
    ts: r.ts as number,
    mmol: r.mmol as number,
    sgv: r.sgv as number,
    direction: r.direction as string,
  }));
}
