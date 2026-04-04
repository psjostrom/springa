import { db } from "./db";

// --- Types ---

export interface UserSettings {
  raceDate?: string;
  raceName?: string;
  raceDist?: number;

  totalWeeks?: number;
  startKm?: number;
  widgetOrder?: string[];
  hiddenWidgets?: string[];
  bgChartWindow?: number;
  includeBasePhase?: boolean;
  /** Personal warmth preference: -2 (run very warm) to +2 (run very cold). Default 0. */
  warmthPreference?: number;

  // Multi-user fields
  approved?: boolean;
  sugarMode?: boolean;
  displayName?: string;
  timezone?: string;
  runDays?: number[];
  onboardingComplete?: boolean;

  // Non-DB fields — populated by the settings API route, not stored in DB
  intervalsApiKey?: string;
  nightscoutUrl?: string;
  nightscoutConnected?: boolean;
  lthr?: number;
  maxHr?: number;
  hrZones?: number[];
}

// --- CRUD ---

export async function getUserSettings(email: string): Promise<UserSettings> {
  const result = await db().execute({
    sql: `SELECT race_date, race_name, race_dist, total_weeks, start_km, widget_order, hidden_widgets,
                 bg_chart_window, include_base_phase, warmth_preference,
                 approved, sugar_mode, display_name, timezone, run_days, onboarding_complete,
                 intervals_api_key, nightscout_url, nightscout_secret
          FROM user_settings WHERE email = ?`,
    args: [email],
  });
  if (result.rows.length === 0) return {};
  const row = result.rows[0];
  const settings: UserSettings = {};
  if (row.race_date) settings.raceDate = row.race_date as string;
  if (row.race_name) settings.raceName = row.race_name as string;
  if (row.race_dist != null) settings.raceDist = row.race_dist as number;
  if (row.total_weeks != null) settings.totalWeeks = row.total_weeks as number;
  if (row.start_km != null) settings.startKm = row.start_km as number;
  if (row.widget_order) settings.widgetOrder = JSON.parse(row.widget_order as string) as string[];
  if (row.hidden_widgets) settings.hiddenWidgets = JSON.parse(row.hidden_widgets as string) as string[];
  if (row.bg_chart_window != null) settings.bgChartWindow = row.bg_chart_window as number;
  if (row.include_base_phase != null) settings.includeBasePhase = (row.include_base_phase as number) === 1;
  if (row.warmth_preference != null) settings.warmthPreference = row.warmth_preference as number;

  // Multi-user fields (NULL-safe: ALTER TABLE doesn't backfill existing rows)
  settings.approved = (row.approved as number | null ?? 0) === 1;
  settings.sugarMode = (row.sugar_mode as number | null ?? 0) === 1;
  if (row.display_name) settings.displayName = row.display_name as string;
  settings.timezone = (row.timezone as string | null) ?? "Europe/Stockholm";
  if (row.run_days) settings.runDays = JSON.parse(row.run_days as string) as number[];
  settings.onboardingComplete = (row.onboarding_complete as number | null ?? 0) === 1;

  // Derived boolean flag (actual credentials decrypted separately via getUserCredentials)
  settings.nightscoutConnected = !!(row.nightscout_url && row.nightscout_secret);

  return settings;
}

export async function saveUserSettings(
  email: string,
  partial: Partial<UserSettings>,
): Promise<void> {
  await db().execute({
    sql: `INSERT INTO user_settings (email, race_date, race_name, race_dist, total_weeks, start_km, widget_order, hidden_widgets, bg_chart_window, include_base_phase, warmth_preference, sugar_mode, display_name, run_days, onboarding_complete)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET
            race_date = COALESCE(excluded.race_date, race_date),
            race_name = COALESCE(excluded.race_name, race_name),
            race_dist = COALESCE(excluded.race_dist, race_dist),
            total_weeks = COALESCE(excluded.total_weeks, total_weeks),
            start_km = COALESCE(excluded.start_km, start_km),
            widget_order = COALESCE(excluded.widget_order, widget_order),
            hidden_widgets = COALESCE(excluded.hidden_widgets, hidden_widgets),
            bg_chart_window = COALESCE(excluded.bg_chart_window, bg_chart_window),
            include_base_phase = COALESCE(excluded.include_base_phase, include_base_phase),
            warmth_preference = COALESCE(excluded.warmth_preference, warmth_preference),
            sugar_mode = COALESCE(excluded.sugar_mode, sugar_mode),
            display_name = COALESCE(excluded.display_name, display_name),
            run_days = COALESCE(excluded.run_days, run_days),
            onboarding_complete = COALESCE(excluded.onboarding_complete, onboarding_complete)`,
    args: [
      email,
      partial.raceDate ?? null,
      partial.raceName ?? null,
      partial.raceDist ?? null,
      partial.totalWeeks ?? null,
      partial.startKm ?? null,
      partial.widgetOrder ? JSON.stringify(partial.widgetOrder) : null,
      partial.hiddenWidgets ? JSON.stringify(partial.hiddenWidgets) : null,
      partial.bgChartWindow ?? null,
      partial.includeBasePhase !== undefined ? (partial.includeBasePhase ? 1 : 0) : null,
      partial.warmthPreference ?? null,
      partial.sugarMode !== undefined ? (partial.sugarMode ? 1 : 0) : 0,
      partial.displayName ?? null,
      partial.runDays ? JSON.stringify(partial.runDays) : null,
      partial.onboardingComplete !== undefined ? (partial.onboardingComplete ? 1 : 0) : 0,
    ],
  });
}
