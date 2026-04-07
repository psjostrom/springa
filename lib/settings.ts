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
  diabetesMode?: boolean;
  displayName?: string;
  timezone?: string;
  runDays?: number[];
  onboardingComplete?: boolean;

  // Non-DB fields — populated by the settings API route, not stored in DB
  intervalsConnected?: boolean;
  nightscoutUrl?: string;
  nightscoutConnected?: boolean;
  lthr?: number;
  maxHr?: number;
  hrZones?: number[];
  restingHr?: number;
  sportSettingsId?: number;
}

// --- CRUD ---

export async function getUserSettings(email: string): Promise<UserSettings> {
  const result = await db().execute({
    sql: `SELECT race_date, race_name, race_dist, total_weeks, start_km, widget_order, hidden_widgets,
                 bg_chart_window, include_base_phase, warmth_preference,
                 diabetes_mode, display_name, timezone, run_days, onboarding_complete,
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
  settings.diabetesMode = (row.diabetes_mode as number | null ?? 0) === 1;
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
  // Step 1: Ensure user row exists (diabetes_mode and onboarding_complete use DEFAULT 0)
  await db().execute({
    sql: "INSERT OR IGNORE INTO user_settings (email) VALUES (?)",
    args: [email],
  });

  // Step 2: Update only the fields that were provided
  const sets: string[] = [];
  const args: (string | number | null)[] = [];

  if (partial.raceDate !== undefined) { sets.push("race_date = ?"); args.push(partial.raceDate ?? null); }
  if (partial.raceName !== undefined) { sets.push("race_name = ?"); args.push(partial.raceName ?? null); }
  if (partial.raceDist !== undefined) { sets.push("race_dist = ?"); args.push(partial.raceDist ?? null); }
  if (partial.totalWeeks !== undefined) { sets.push("total_weeks = ?"); args.push(partial.totalWeeks ?? null); }
  if (partial.startKm !== undefined) { sets.push("start_km = ?"); args.push(partial.startKm ?? null); }
  if (partial.widgetOrder !== undefined) { sets.push("widget_order = ?"); args.push(JSON.stringify(partial.widgetOrder)); }
  if (partial.hiddenWidgets !== undefined) { sets.push("hidden_widgets = ?"); args.push(JSON.stringify(partial.hiddenWidgets)); }
  if (partial.bgChartWindow !== undefined) { sets.push("bg_chart_window = ?"); args.push(partial.bgChartWindow ?? null); }
  if (partial.includeBasePhase !== undefined) { sets.push("include_base_phase = ?"); args.push(partial.includeBasePhase ? 1 : 0); }
  if (partial.warmthPreference !== undefined) { sets.push("warmth_preference = ?"); args.push(partial.warmthPreference); }
  if (partial.diabetesMode !== undefined) { sets.push("diabetes_mode = ?"); args.push(partial.diabetesMode ? 1 : 0); }
  if (partial.displayName !== undefined) { sets.push("display_name = ?"); args.push(partial.displayName ?? null); }
  if (partial.runDays !== undefined) { sets.push("run_days = ?"); args.push(JSON.stringify(partial.runDays)); }
  if (partial.onboardingComplete !== undefined) { sets.push("onboarding_complete = ?"); args.push(partial.onboardingComplete ? 1 : 0); }

  if (sets.length > 0) {
    args.push(email);
    await db().execute({
      sql: `UPDATE user_settings SET ${sets.join(", ")} WHERE email = ?`,
      args,
    });
  }
}
