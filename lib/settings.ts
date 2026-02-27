import { db } from "./db";

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
  maxHr?: number;
  hrZones?: number[];
  widgetOrder?: string[];
  hiddenWidgets?: string[];
}

// --- CRUD ---

export async function getUserSettings(email: string): Promise<UserSettings> {
  const result = await db().execute({
    sql: "SELECT intervals_api_key, google_ai_api_key, xdrip_secret, race_date, timezone, race_name, race_dist, prefix, total_weeks, start_km, lthr, max_hr, hr_zones, widget_order, hidden_widgets FROM user_settings WHERE email = ?",
    args: [email],
  });
  if (result.rows.length === 0) return {};
  const row = result.rows[0];
  const settings: UserSettings = {};
  if (row.intervals_api_key) settings.intervalsApiKey = row.intervals_api_key as string;
  if (row.google_ai_api_key) settings.googleAiApiKey = row.google_ai_api_key as string;
  if (row.xdrip_secret) settings.xdripSecret = row.xdrip_secret as string;
  if (row.race_date) settings.raceDate = row.race_date as string;
  if (row.timezone) settings.timezone = row.timezone as string;
  if (row.race_name) settings.raceName = row.race_name as string;
  if (row.race_dist != null) settings.raceDist = row.race_dist as number;
  if (row.prefix) settings.prefix = row.prefix as string;
  if (row.total_weeks != null) settings.totalWeeks = row.total_weeks as number;
  if (row.start_km != null) settings.startKm = row.start_km as number;
  if (row.lthr != null) settings.lthr = row.lthr as number;
  if (row.max_hr != null) settings.maxHr = row.max_hr as number;
  if (row.hr_zones) settings.hrZones = JSON.parse(row.hr_zones as string) as number[];
  if (row.widget_order) settings.widgetOrder = JSON.parse(row.widget_order as string) as string[];
  if (row.hidden_widgets) settings.hiddenWidgets = JSON.parse(row.hidden_widgets as string) as string[];
  return settings;
}

export async function saveUserSettings(
  email: string,
  partial: Partial<UserSettings>,
): Promise<void> {
  await db().execute({
    sql: `INSERT INTO user_settings (email, intervals_api_key, google_ai_api_key, xdrip_secret, race_date, timezone, race_name, race_dist, prefix, total_weeks, start_km, lthr, max_hr, hr_zones, widget_order, hidden_widgets)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            max_hr = COALESCE(excluded.max_hr, max_hr),
            hr_zones = COALESCE(excluded.hr_zones, hr_zones),
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
      partial.maxHr ?? null,
      partial.hrZones ? JSON.stringify(partial.hrZones) : null,
      partial.widgetOrder ? JSON.stringify(partial.widgetOrder) : null,
      partial.hiddenWidgets ? JSON.stringify(partial.hiddenWidgets) : null,
    ],
  });
}

// --- Profile sync throttle ---

const PROFILE_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

export async function shouldSyncProfile(email: string): Promise<boolean> {
  const result = await db().execute({
    sql: "SELECT profile_synced_at FROM user_settings WHERE email = ?",
    args: [email],
  });
  if (result.rows.length === 0) return false;
  const syncedAt = result.rows[0].profile_synced_at as string | null;
  if (!syncedAt) return true;
  return Date.now() - new Date(syncedAt).getTime() > PROFILE_SYNC_INTERVAL_MS;
}

export async function markProfileSynced(email: string): Promise<void> {
  await db().execute({
    sql: "UPDATE user_settings SET profile_synced_at = ? WHERE email = ?",
    args: [new Date().toISOString(), email],
  });
}
