import { format, isValid, parseISO } from "date-fns";
import { serializeFuelRate } from "./fuelRate";
import {
  fetchEvent,
  IntervalsApiError,
  updateEvent,
} from "./intervalsApi";
import { deletePreRunCarbs } from "./prerunCarbs";
import { resolvePlanContext, PlanContextError } from "./planContext";
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
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "WorkoutReplacementError";
  }
}

export async function resolveReplacementPlanConfig(
  email: string,
  apiKey: string,
): Promise<PlanConfig> {
  try {
    return (await resolvePlanContext(email, apiKey)).planConfig;
  } catch (error) {
    if (error instanceof PlanContextError) {
      throw new WorkoutReplacementError(
        error.code === "PLAN_SETTINGS_REQUIRED" ? "PLAN_SETTINGS_REQUIRED" : "UPSTREAM_ERROR",
        error.message,
        { cause: error },
      );
    }
    throw error;
  }
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

  const targetDate =
    typeof event.start_date_local === "string"
      ? parseISO(event.start_date_local)
      : new Date(NaN);
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
    const carbsPerHour = serializeFuelRate(workout.fuelRate);
    await updateEvent(input.apiKey, input.existingEventId, {
      name: workout.name,
      description: workout.description,
      start_date_local: format(
        workout.start_date_local,
        "yyyy-MM-dd'T'HH:mm:ss",
      ),
      external_id: workout.external_id,
      type: workout.type,
      ...(carbsPerHour !== undefined && { carbs_per_hour: carbsPerHour }),
    });
  } catch (error) {
    throw new WorkoutReplacementError(
      "UPSTREAM_ERROR",
      "Failed to update event",
      { cause: error },
    );
  }

  try {
    await deletePreRunCarbs(input.email, input.existingEventId);
  } catch (error) {
    throw new WorkoutReplacementError(
      "LOCAL_CLEANUP_FAILED",
      "Failed to clean up event",
      { cause: error },
    );
  }
  return input.existingEventId;
}
