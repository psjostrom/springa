import { NextResponse } from "next/server";
import {
  errorResponse,
  replacementErrorStatus,
  requireAuth,
  unauthorized,
  AuthError,
  type AuthSource,
} from "@/lib/apiHelpers";
import { parseCalendarEventId } from "@/lib/calendarEventId";
import { getUserCredentials } from "@/lib/credentials";
import { replaceWorkoutOnDate } from "@/lib/intervalsApi";
import { deletePreRunCarbs } from "@/lib/prerunCarbs";
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

export async function POST(req: Request) {
  let email: string;
  let authSource: AuthSource;
  try {
    const auth = await requireAuth({
      headerList: req.headers,
      withSource: true,
    });
    email = auth.email;
    authSource = auth.source;
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const creds = await getUserCredentials(email);
  if (!creds?.intervalsApiKey) {
    return errorResponse(
      "Intervals.icu not configured",
      "MISSING_CREDENTIALS",
      400,
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
  const isBearer = authSource === "bearer";
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
        "Failed to replace workout",
        "UPSTREAM_ERROR",
        502,
      );
    }
  }

  const legacyBody = input as {
    existingEventId?: unknown;
    workout?: WorkoutEvent;
  };
  const hasExistingEventId = Object.hasOwn(input, "existingEventId");
  let existingEventId: number | undefined;
  if (hasExistingEventId) {
    const parsedEventId = parseCalendarEventId(legacyBody.existingEventId);
    if (parsedEventId == null) {
      return errorResponse("Invalid input", "INVALID_INPUT", 400);
    }
    existingEventId = parsedEventId;
  }
  const rawWorkout = legacyBody.workout;

  if (!rawWorkout) {
    return NextResponse.json({ error: "Missing workout" }, { status: 400 });
  }

  const workout = {
    ...rawWorkout,
    start_date_local: new Date(rawWorkout.start_date_local),
  };

  let newId: number;
  try {
    newId = await replaceWorkoutOnDate(
      creds.intervalsApiKey,
      existingEventId,
      workout,
    );
  } catch (err) {
    console.error("[intervals/events/replace]", err);
    return errorResponse(
      "Failed to replace workout",
      "UPSTREAM_ERROR",
      502,
    );
  }

  if (existingEventId != null) {
    try {
      await deletePreRunCarbs(email, existingEventId);
    } catch (err) {
      console.error("[intervals/events/replace]", err);
      return errorResponse(
        "Failed to clean up event",
        "LOCAL_CLEANUP_FAILED",
        500,
      );
    }
  }

  return NextResponse.json({ newId });
}
