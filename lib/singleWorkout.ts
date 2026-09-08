import { createHash } from "node:crypto";
import { format, parseISO } from "date-fns";
import { errorResponse } from "./apiHelpers";
import { isLocalDateTime } from "./calendarEventId";
import { serializeFuelRate } from "./fuelRate";
import { buildPlannedWorkoutPresentation } from "./plannedWorkoutDetail";
import { PlanContextError, resolvePlanContext } from "./planContext";
import { buildContext, generateSingleWorkout, getWeekPhase, suggestCategory, type OnDemandCategory } from "./workoutGenerators";
import { getWeekIdx } from "./workoutMath";

export function isWorkoutDate(value: unknown): value is string {
  return typeof value === "string" && isLocalDateTime(`${value}T12:00:00`);
}

export function isOnDemandCategory(value: unknown): value is OnDemandCategory {
  return value === "easy" || value === "quality" || value === "long" || value === "club";
}

export class SingleWorkoutError extends Error {
  constructor(public readonly code: "DATE_OUTSIDE_PLAN", message: string) {
    super(message);
  }
}

export function singleWorkoutErrorResponse(error: unknown) {
  if (error instanceof PlanContextError || error instanceof SingleWorkoutError) {
    const status = error.code === "UPSTREAM_ERROR" ? 502 : 422;
    return errorResponse(error.message, error.code, status);
  }
  console.error("[single-workout]", error);
  return errorResponse("Failed to generate or save workout", "UPSTREAM_ERROR", 502);
}

export async function previewSingleWorkout(email: string, apiKey: string, date: string, category?: OnDemandCategory) {
  const { planConfig, estimationContext } = await resolvePlanContext(email, apiKey);
  const targetDate = parseISO(date);
  const context = buildContext(planConfig);
  const weekIdx = getWeekIdx(targetDate, context.planStartMonday);
  if (weekIdx < 0 || weekIdx >= context.totalWeeks) {
    throw new SingleWorkoutError("DATE_OUTSIDE_PLAN", "Date is outside the training plan");
  }
  const suggestedCategory = suggestCategory(targetDate, getWeekPhase(context, weekIdx));
  const selectedCategory = category ?? suggestedCategory;
  const workout = generateSingleWorkout(selectedCategory, targetDate, planConfig);
  if (!workout) {
    throw new SingleWorkoutError("DATE_OUTSIDE_PLAN", "Date is outside the training plan");
  }
  const presentation = buildPlannedWorkoutPresentation({
    name: workout.name,
    description: workout.description,
    fuelRate: serializeFuelRate(workout.fuelRate),
    lthr: planConfig.lthr,
    hrZones: planConfig.hrZones,
    estimationContext,
  });
  const preview = {
    date,
    category: selectedCategory,
    suggestedCategory,
    workout: {
      name: workout.name,
      description: workout.description,
      startDateLocal: format(workout.start_date_local, "yyyy-MM-dd'T'HH:mm:ss"),
      structure: presentation.structure,
      metrics: presentation.metrics,
    },
  };
  const previewHash = createHash("sha256")
    .update(JSON.stringify({ preview, externalId: workout.external_id, type: workout.type }))
    .digest("hex");
  return { workout, preview: { ...preview, previewHash } };
}
