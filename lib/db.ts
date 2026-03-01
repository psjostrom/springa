import { createClient, type Client } from "@libsql/client";

// --- Singleton database client ---

let _db: Client | undefined;
export function db() {
  // Non-null assertions: env vars are required in production (set in Vercel config).
  // In tests, createClient is mocked so these values are never used.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  _db ??= createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN! });
  return _db;
}

// --- Schema DDL (used by migration and tests) ---

export const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS user_settings (
  email          TEXT PRIMARY KEY,
  race_date      TEXT,
  race_name      TEXT,
  race_dist      REAL,
  prefix         TEXT,
  total_weeks    INTEGER,
  start_km       REAL,
  widget_order   TEXT,
  hidden_widgets TEXT
);

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
  pace           TEXT,
  cadence        TEXT,
  altitude       TEXT,
  activity_date  TEXT,
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

CREATE TABLE IF NOT EXISTS prerun_push_log (
  email      TEXT NOT NULL,
  event_date TEXT NOT NULL,
  sent_at    INTEGER NOT NULL,
  PRIMARY KEY (email, event_date)
);

CREATE TABLE IF NOT EXISTS bg_patterns (
  email              TEXT PRIMARY KEY,
  latest_activity_id TEXT NOT NULL,
  patterns_text      TEXT NOT NULL,
  analyzed_at        INTEGER NOT NULL
);
`;

