import { buildBGModelFromCached, type BGResponseModel } from "./bgModel";
import { getActivityStreams } from "./activityStreamsDb";
import { computeMaxHRZones, DEFAULT_MAX_HR } from "./constants";
import { normalizeEffortMetric, canUseHeartRateMetric } from "./effortMetric";
import { fetchAthleteProfile } from "./intervalsApi";
import {
  getUserWorkoutEstimationContext,
  resolveHeartRateZones,
} from "./workoutEstimationContext";
import type { WorkoutEstimationContext } from "./workoutMath";
import { getUserSettings, type UserSettings } from "./settings";
import type { PlannerConfig } from "./plannerConfig";
import type { PlanConfig } from "./workoutGenerators";

export { resolveHeartRateZones } from "./workoutEstimationContext";

export type PlanContextErrorCode = "PLAN_SETTINGS_REQUIRED" | "UPSTREAM_ERROR" | "HR_ZONES_REQUIRED";

export class PlanContextError extends Error {
  constructor(public readonly code: PlanContextErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PlanContextError";
  }
}

export interface ResolvedPlanContext {
  settings: UserSettings;
  timezone: string;
  planConfig: PlanConfig;
  estimationContext: WorkoutEstimationContext;
  bgModel: BGResponseModel | null;
}

export async function resolvePlanContext(
  email: string,
  apiKey: string,
  override?: PlannerConfig,
): Promise<ResolvedPlanContext> {
  const settings = await getUserSettings(email);
  const raceDateStr = override?.raceDate ?? settings.raceDate;
  const totalWeeks = override?.totalWeeks ?? settings.totalWeeks;
  if (raceDateStr == null || totalWeeks == null) {
    throw new PlanContextError("PLAN_SETTINGS_REQUIRED", "Plan settings are required");
  }

  let profile: Awaited<ReturnType<typeof fetchAthleteProfile>>;
  try {
    profile = await fetchAthleteProfile(apiKey, { strict: true });
  } catch (error) {
    throw new PlanContextError("UPSTREAM_ERROR", "Failed to fetch athlete profile", {
      cause: error,
    });
  }

  if (!override && profile.lthr == null) {
    throw new PlanContextError("PLAN_SETTINGS_REQUIRED", "Plan settings are required");
  }

  // Stored replacement generation historically used provider max-HR zones;
  // Planner overrides use the shared cached/profile precedence.
  const hrZones = resolveHeartRateZones(
    override ? settings : { hrZones: undefined, maxHr: undefined },
    override ? profile : { hrZones: undefined, maxHr: profile.maxHr },
    override ? undefined : DEFAULT_MAX_HR,
  ) ?? computeMaxHRZones(DEFAULT_MAX_HR);
  const effortMetric = normalizeEffortMetric(override?.effortMetric ?? settings.effortMetric);
  if (effortMetric === "hr" && !canUseHeartRateMetric(profile.lthr, hrZones)) {
    throw new PlanContextError(
      "HR_ZONES_REQUIRED",
      "Heart-rate zones are required for heart-rate workouts",
    );
  }

  const cached = settings.diabetesMode ? await getActivityStreams(email) : [];
  const bgModel = settings.diabetesMode && cached.length > 0
    ? buildBGModelFromCached(cached)
    : null;
  const estimationContext = await getUserWorkoutEstimationContext(
    email,
    override ? apiKey : null,
    settings,
    profile,
  );

  const planConfig: PlanConfig = {
    bgModel,
    raceDateStr,
    raceDist: override?.raceDist ?? settings.raceDist ?? 16,
    totalWeeks,
    startKm: override?.startKm ?? settings.startKm ?? 8,
    lthr: profile.lthr ?? 0,
    hrZones,
    effortMetric,
    includeBasePhase: override?.includeBasePhase ?? settings.includeBasePhase,
    diabetesMode: settings.diabetesMode,
    runDays: override?.runDays ?? settings.runDays,
    longRunDay: override?.longRunDay ?? settings.longRunDay,
    clubDay: override?.clubDay ?? settings.clubDay,
    clubType: override?.clubType ?? settings.clubType,
    currentAbilitySecs: override?.currentAbilitySecs ?? settings.currentAbilitySecs,
    currentAbilityDist: override?.currentAbilityDist ?? settings.currentAbilityDist,
  };

  return {
    settings,
    timezone: settings.timezone ?? "Europe/Stockholm",
    planConfig,
    estimationContext,
    bgModel,
  };
}
