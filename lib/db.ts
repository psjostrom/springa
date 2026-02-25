import { createClient, type Client } from "@libsql/client";

// --- Singleton database client ---

let _db: Client;
export function db() {
  if (!_db) {
    _db = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });
  }
  return _db;
}

// --- Schema DDL (used by migration and tests) ---

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

// --- Schema migration helpers (idempotent, run-once per process) ---

const _migrated = new Set<string>();

export async function runMigration(name: string, fn: () => Promise<void>): Promise<void> {
  if (_migrated.has(name)) return;
  _migrated.add(name);
  await fn();
}

export async function addColumns(table: string, cols: { name: string; type: string }[]): Promise<void> {
  for (const col of cols) {
    try {
      await db().execute({
        sql: `ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.type}`,
        args: [],
      });
    } catch {
      // column already exists — expected
    }
  }
}
