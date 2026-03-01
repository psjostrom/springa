import { db } from "./db";

// --- Types ---

export interface UserSettings {
  raceDate?: string;
  raceName?: string;
  raceDist?: number;
  prefix?: string;
  totalWeeks?: number;
  startKm?: number;
  widgetOrder?: string[];
  hiddenWidgets?: string[];
  // Non-DB fields — populated by the settings API route, not stored in DB
  intervalsApiKey?: string;
  xdripConnected?: boolean;
  mylifeConnected?: boolean;
  lthr?: number;
  maxHr?: number;
  hrZones?: number[];
}

// --- CRUD ---

export async function getUserSettings(email: string): Promise<UserSettings> {
  const result = await db().execute({
    sql: "SELECT race_date, race_name, race_dist, prefix, total_weeks, start_km, widget_order, hidden_widgets FROM user_settings WHERE email = ?",
    args: [email],
  });
  if (result.rows.length === 0) return {};
  const row = result.rows[0];
  const settings: UserSettings = {};
  if (row.race_date) settings.raceDate = row.race_date as string;
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
    sql: `INSERT INTO user_settings (email, race_date, race_name, race_dist, prefix, total_weeks, start_km, widget_order, hidden_widgets)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET
            race_date = COALESCE(excluded.race_date, race_date),
            race_name = COALESCE(excluded.race_name, race_name),
            race_dist = COALESCE(excluded.race_dist, race_dist),
            prefix = COALESCE(excluded.prefix, prefix),
            total_weeks = COALESCE(excluded.total_weeks, total_weeks),
            start_km = COALESCE(excluded.start_km, start_km),
            widget_order = COALESCE(excluded.widget_order, widget_order),
            hidden_widgets = COALESCE(excluded.hidden_widgets, hidden_widgets)`,
    args: [
      email,
      partial.raceDate ?? null,
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
