import { NextResponse } from "next/server";
import { PlannerError } from "@/lib/plannerConfig";

export function plannerErrorResponse(error: PlannerError): NextResponse {
  const body: Record<string, unknown> = {
    error: error.message,
    code: error.code,
  };
  if (error.fields && Object.keys(error.fields).length > 0) body.fields = error.fields;
  if (error.details?.appliedWorkoutCount != null) {
    body.appliedWorkoutCount = error.details.appliedWorkoutCount;
  }
  if (error.details?.failures) body.failures = error.details.failures;
  const statusByCode: Record<PlannerError["code"], number> = {
    PLANNER_CONFIG_INVALID: 400,
    INTERVALS_NOT_CONNECTED: 409,
    HR_ZONES_REQUIRED: 409,
    PLAN_PREVIEW_STALE: 409,
    INTERVALS_UPSTREAM_ERROR: 502,
    PLANNER_APPLY_PARTIAL: 502,
    PLANNER_STATE_FINALIZE_FAILED: 500,
  };
  const status = (Reflect.get(statusByCode, error.code) as number | undefined) ?? 500;
  return NextResponse.json(body, { status });
}

export function invalidPlannerBody(): PlannerError {
  return new PlannerError("PLANNER_CONFIG_INVALID", "Invalid or empty request body");
}
