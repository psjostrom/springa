import { createClient, type Client } from "@libsql/client";

// --- Singleton database client ---

let _db: Client | undefined;
export function db() {
  if (!_db) {
    const url = process.env.TURSO_DATABASE_URL;
    const token = process.env.TURSO_AUTH_TOKEN;
    if (!url || !token) throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required");
    _db = createClient({ url, authToken: token });
  }
  return _db;
}

// --- Schema DDL (used by migration and tests) ---

export const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS user_settings (
  email          TEXT PRIMARY KEY,
  race_date      TEXT,
  race_name      TEXT,
  race_dist      REAL,
  total_weeks    INTEGER,
  start_km       REAL,
  widget_order     TEXT,
  hidden_widgets   TEXT,
  bg_chart_window  INTEGER,
  include_base_phase INTEGER,
  warmth_preference  INTEGER,
  approved           INTEGER NOT NULL DEFAULT 0,
  sugar_mode         INTEGER NOT NULL DEFAULT 0,
  display_name       TEXT,
  timezone           TEXT DEFAULT 'Europe/Stockholm',
  intervals_api_key  TEXT,
  run_days           TEXT,
  mylife_email       TEXT,
  mylife_password    TEXT,
  nightscout_secret  TEXT,
  google_refresh_token TEXT,
  google_calendar_id   TEXT,
  onboarding_complete INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bg_readings (
  email     TEXT NOT NULL,
  ts        INTEGER NOT NULL,
  mmol      REAL NOT NULL,
  sgv       INTEGER NOT NULL,
  direction TEXT NOT NULL,
  delta     REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (email, ts)
);

CREATE TABLE IF NOT EXISTS activity_streams (
  email          TEXT NOT NULL,
  activity_id    TEXT NOT NULL,
  name           TEXT,
  run_start_ms   INTEGER,
  fuel_rate      REAL,
  hr             TEXT NOT NULL,
  run_bg_context TEXT,
  pace           TEXT,
  cadence        TEXT,
  altitude       TEXT,
  activity_date  TEXT,
  distance       TEXT,
  raw_time       TEXT,
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

CREATE TABLE IF NOT EXISTS prerun_carbs (
  email          TEXT NOT NULL,
  event_id       TEXT NOT NULL,
  carbs_g        INTEGER,
  created_at     INTEGER NOT NULL,
  PRIMARY KEY (email, event_id)
);

CREATE TABLE IF NOT EXISTS treatments (
  email          TEXT NOT NULL,
  id             TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  event_type     TEXT NOT NULL,
  insulin        REAL,
  carbs          REAL,
  basal_rate     REAL,
  duration       INTEGER,
  entered_by     TEXT,
  ts             INTEGER NOT NULL,
  PRIMARY KEY (email, id)
);

CREATE INDEX IF NOT EXISTS idx_treatments_ts ON treatments(email, ts);

CREATE INDEX IF NOT EXISTS idx_nightscout_secret ON user_settings(nightscout_secret);
`;

