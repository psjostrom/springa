import { NextResponse } from "next/server";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { parseCalendarEventId } from "@/lib/calendarEventId";
import { getUserCredentials } from "@/lib/credentials";
import { replaceWorkoutOnDate } from "@/lib/intervalsApi";
import type { WorkoutEvent } from "@/lib/types";
import {
  replacePlannedWorkoutByIntent,
  WorkoutReplacementError,
} from "@/lib/workoutReplacement";
import type { OnDemandCategory } from "@/lib/workoutGenerators";

const CATEGORIES = new Set<OnDemandCategory>([
  "easy",
  "quality",
  "long",
  "club",
]);

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

function replacementErrorStatus(code: WorkoutReplacementError["code"]): number {
  switch (code) {
    case "EVENT_NOT_FOUND":
      return 404;
    case "UNSUPPORTED_EVENT":
    case "PLAN_SETTINGS_REQUIRED":
    case "DATE_OUTSIDE_PLAN":
      return 422;
    case "LOCAL_CLEANUP_FAILED":
      return 500;
    case "UPSTREAM_ERROR":
      return 502;
  }
}

export async function POST(req: Request) {
  let email: string;
  try {
    email = await requireAuth({ headerList: req.headers });
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const creds = await getUserCredentials(email);
  if (!creds?.intervalsApiKey) {
    return NextResponse.json(
      { error: "Intervals.icu not configured" },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON", "INVALID_INPUT", 400);
  }
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("Invalid input", "INVALID_INPUT", 400);
  }

  const input = body as Record<string, unknown>;
  const isBearer = /^Bearer\s+/i.test(
    req.headers.get("authorization") ?? "",
  );
  if (isBearer) {
    const keys = Object.keys(input);
    const existingEventId = parseCalendarEventId(input.existingEventId);
    const category = input.category;
    if (
      keys.length !== 2 ||
      !keys.includes("existingEventId") ||
      !keys.includes("category") ||
      existingEventId == null ||
      typeof category !== "string" ||
      !CATEGORIES.has(category as OnDemandCategory)
    ) {
      return errorResponse("Invalid input", "INVALID_INPUT", 400);
    }

    try {
      const newId = await replacePlannedWorkoutByIntent({
        email,
        apiKey: creds.intervalsApiKey,
        existingEventId,
        category: category as OnDemandCategory,
      });
      return NextResponse.json({ newId });
    } catch (err) {
      console.error("[intervals/events/replace]", err);
      if (err instanceof WorkoutReplacementError) {
        return errorResponse(
          err.message,
          err.code,
          replacementErrorStatus(err.code),
        );
      }
      return errorResponse(
        err instanceof Error ? err.message : "Failed to replace workout",
        "UPSTREAM_ERROR",
        502,
      );
    }
  }

  const legacyBody = input as {
    existingEventId?: number;
    workout?: WorkoutEvent;
  };
  const existingEventId = legacyBody.existingEventId;
  const rawWorkout = legacyBody.workout;

  if (!rawWorkout) {
    return NextResponse.json({ error: "Missing workout" }, { status: 400 });
  }

  const workout = {
    ...rawWorkout,
    start_date_local: new Date(rawWorkout.start_date_local),
  };

  try {
    const newId = await replaceWorkoutOnDate(
      creds.intervalsApiKey,
      existingEventId,
      workout,
    );
    return NextResponse.json({ newId });
  } catch (err) {
    console.error("[intervals/events/replace]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to replace workout",
      },
      { status: 502 },
    );
  }
}
