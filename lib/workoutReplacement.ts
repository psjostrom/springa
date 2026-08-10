import { format, isValid, parseISO } from "date-fns";
import { getActivityStreams } from "./activityStreamsDb";
import { buildBGModelFromCached } from "./bgModel";
import { computeMaxHRZones, DEFAULT_MAX_HR } from "./constants";
import { normalizeEffortMetric } from "./effortMetric";
import {
  fetchAthleteProfile,
  fetchEvent,
  IntervalsApiError,
  updateEvent,
} from "./intervalsApi";
import { deletePreRunCarbs } from "./prerunCarbs";
import { getUserSettings } from "./settings";
import type { IntervalsEvent } from "./types";
import {
  generateSingleWorkout,
  type OnDemandCategory,
  type PlanConfig,
} from "./workoutGenerators";

export type WorkoutReplacementErrorCode =
  | "EVENT_NOT_FOUND"
  | "UNSUPPORTED_EVENT"
  | "PLAN_SETTINGS_REQUIRED"
  | "DATE_OUTSIDE_PLAN"
  | "UPSTREAM_ERROR"
  | "LOCAL_CLEANUP_FAILED";

export class WorkoutReplacementError extends Error {
  constructor(
    public readonly code: WorkoutReplacementErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WorkoutReplacementError";
  }
}

export async function resolveReplacementPlanConfig(
  email: string,
  apiKey: string,
): Promise<PlanConfig> {
  const settings = await getUserSettings(email);
  const profile = await fetchAthleteProfile(apiKey);
  const cached = settings.diabetesMode ? await getActivityStreams(email) : [];

  if (!settings.raceDate || settings.totalWeeks == null || profile.lthr == null) {
    throw new WorkoutReplacementError(
      "PLAN_SETTINGS_REQUIRED",
      "Plan settings are required",
    );
  }

  return {
    bgModel:
      settings.diabetesMode && cached.length > 0
        ? buildBGModelFromCached(cached)
        : null,
    raceDateStr: settings.raceDate,
    raceDist: settings.raceDist ?? 16,
    totalWeeks: settings.totalWeeks,
    startKm: settings.startKm ?? 8,
    lthr: profile.lthr,
    hrZones: computeMaxHRZones(profile.maxHr ?? DEFAULT_MAX_HR),
    effortMetric: normalizeEffortMetric(settings.effortMetric),
    includeBasePhase: settings.includeBasePhase,
    diabetesMode: settings.diabetesMode,
    runDays: settings.runDays,
    longRunDay: settings.longRunDay,
    clubDay: settings.clubDay,
    clubType: settings.clubType,
    currentAbilitySecs: settings.currentAbilitySecs,
    currentAbilityDist: settings.currentAbilityDist,
  };
}

export async function replacePlannedWorkoutByIntent(input: {
  email: string;
  apiKey: string;
  existingEventId: number;
  category: OnDemandCategory;
}): Promise<number> {
  let event: IntervalsEvent;
  try {
    event = await fetchEvent(input.apiKey, input.existingEventId);
  } catch (error) {
    if (error instanceof IntervalsApiError && error.status === 404) {
      throw new WorkoutReplacementError("EVENT_NOT_FOUND", "Event not found");
    }
    throw new WorkoutReplacementError(
      "UPSTREAM_ERROR",
      "Failed to fetch event",
    );
  }
  if (
    event.category !== "WORKOUT" ||
    event.type !== "Run" ||
    event.paired_activity_id != null
  ) {
    throw new WorkoutReplacementError(
      "UNSUPPORTED_EVENT",
      "Event is not a planned workout",
    );
  }

  const targetDate = parseISO(event.start_date_local);
  if (!isValid(targetDate)) {
    throw new WorkoutReplacementError(
      "UPSTREAM_ERROR",
      "Event has an invalid local date",
    );
  }

  const config = await resolveReplacementPlanConfig(input.email, input.apiKey);
  const workout = generateSingleWorkout(input.category, targetDate, config);
  if (!workout) {
    throw new WorkoutReplacementError(
      "DATE_OUTSIDE_PLAN",
      "Event date is outside configured plan",
    );
  }

  try {
    await updateEvent(input.apiKey, input.existingEventId, {
      name: workout.name,
      description: workout.description,
      start_date_local: format(
        workout.start_date_local,
        "yyyy-MM-dd'T'HH:mm:ss",
      ),
      external_id: workout.external_id,
      type: workout.type,
      ...(workout.fuelRate != null && {
        carbs_per_hour: Math.round(workout.fuelRate),
      }),
    });
  } catch {
    throw new WorkoutReplacementError(
      "UPSTREAM_ERROR",
      "Failed to update event",
    );
  }

  try {
    await deletePreRunCarbs(input.email, input.existingEventId);
  } catch {
    throw new WorkoutReplacementError(
      "LOCAL_CLEANUP_FAILED",
      "Failed to clean up event",
    );
  }
  return input.existingEventId;
}
