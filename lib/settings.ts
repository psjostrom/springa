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
  widgetOrder?: string[];
  hiddenWidgets?: string[];
  // Profile data — fetched from Intervals.icu on every settings load, not stored in DB
  lthr?: number;
  maxHr?: number;
  hrZones?: number[];
}

// --- CRUD ---

export async function getUserSettings(email: string): Promise<UserSettings> {
  const result = await db().execute({
    sql: "SELECT intervals_api_key, google_ai_api_key, xdrip_secret, race_date, timezone, race_name, race_dist, prefix, total_weeks, start_km, widget_order, hidden_widgets FROM user_settings WHERE email = ?",
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
  if (row.widget_order) settings.widgetOrder = JSON.parse(row.widget_order as string) as string[];
  if (row.hidden_widgets) settings.hiddenWidgets = JSON.parse(row.hidden_widgets as string) as string[];
  return settings;
}

export async function saveUserSettings(
  email: string,
  partial: Partial<UserSettings>,
): Promise<void> {
  await db().execute({
    sql: `INSERT INTO user_settings (email, intervals_api_key, google_ai_api_key, xdrip_secret, race_date, timezone, race_name, race_dist, prefix, total_weeks, start_km, widget_order, hidden_widgets)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      partial.widgetOrder ? JSON.stringify(partial.widgetOrder) : null,
      partial.hiddenWidgets ? JSON.stringify(partial.hiddenWidgets) : null,
    ],
  });
}
