import { NextResponse } from "next/server";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import {
  updateEvent,
  deleteEvent,
  fetchAthleteProfile,
  fetchEvent,
  IntervalsApiError,
} from "@/lib/intervalsApi";
import {
  isLocalDateTime,
  parseCalendarEventId,
} from "@/lib/calendarEventId";
import { getUserSettings } from "@/lib/settings";
import { getUserWorkoutEstimationContext } from "@/lib/workoutEstimationContext";
import { deletePreRunCarbs, getPreRunCarbs } from "@/lib/prerunCarbs";
import {
  buildPlannedWorkoutDetail,
  UnsupportedPlannedWorkoutError,
} from "@/lib/plannedWorkoutDetail";
import { computeMaxHRZones } from "@/lib/constants";

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let email: string;
  try {
    email = await requireAuth({ headerList: req.headers });
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const eventId = parseCalendarEventId((await params).id);
  if (eventId == null) {
    return errorResponse("Invalid event ID", "INVALID_INPUT", 400);
  }

  const creds = await getUserCredentials(email);
  if (!creds?.intervalsApiKey) {
    return NextResponse.json(
      { error: "Intervals.icu not configured" },
      { status: 400 },
    );
  }

  try {
    const settings = await getUserSettings(email);
    const [event, profile, preRunCarbsG] = await Promise.all([
      fetchEvent(creds.intervalsApiKey, eventId),
      fetchAthleteProfile(creds.intervalsApiKey, { strict: true }),
      getPreRunCarbs(email, eventId),
    ]);
    const estimationContext = await getUserWorkoutEstimationContext(
      email,
      creds.intervalsApiKey,
      settings,
      profile,
    );
    const maxHr = settings.maxHr ?? profile.maxHr;
    const hrZones =
      settings.hrZones?.length === 5
        ? settings.hrZones
        : profile.hrZones?.length === 5
          ? profile.hrZones
          : maxHr != null
            ? computeMaxHRZones(maxHr)
            : undefined;

    return NextResponse.json(
      await buildPlannedWorkoutDetail({
        event,
        lthr: profile.lthr,
        hrZones,
        estimationContext,
        timezone: creds.timezone,
        warmthPreference: settings.warmthPreference,
        preRunCarbsG,
      }),
    );
  } catch (error) {
    if (error instanceof IntervalsApiError) {
      if (error.message === "Failed to fetch athlete profile") {
        return errorResponse(error.message, "UPSTREAM_ERROR", 502);
      }
      return error.status === 404
        ? errorResponse("Event not found", "EVENT_NOT_FOUND", 404)
        : errorResponse("Failed to fetch event", "UPSTREAM_ERROR", 502);
    }
    if (error instanceof UnsupportedPlannedWorkoutError) {
      return errorResponse(error.message, "UNSUPPORTED_EVENT", 422);
    }
    throw error;
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const eventId = parseCalendarEventId((await params).id);
  if (eventId == null) {
    return errorResponse("Invalid event ID", "INVALID_INPUT", 400);
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
  const keys = Object.keys(input);
  const isBearer = /^Bearer\s+/i.test(
    req.headers.get("authorization") ?? "",
  );
  if (
    isBearer &&
    (keys.length !== 1 || keys[0] !== "start_date_local")
  ) {
    return errorResponse("Invalid input", "INVALID_INPUT", 400);
  }

  const updates: {
    start_date_local?: string;
    name?: string;
    description?: string;
    carbs_per_hour?: number;
  } = {};

  if ("start_date_local" in input) {
    if (!isLocalDateTime(input.start_date_local)) {
      return errorResponse("Invalid start date", "INVALID_INPUT", 400);
    }
    updates.start_date_local = input.start_date_local;
  }
  if ("name" in input) {
    if (typeof input.name !== "string") {
      return errorResponse("Invalid name", "INVALID_INPUT", 400);
    }
    updates.name = input.name;
  }
  if ("description" in input) {
    if (typeof input.description !== "string") {
      return errorResponse("Invalid description", "INVALID_INPUT", 400);
    }
    updates.description = input.description;
  }
  if ("carbs_per_hour" in input) {
    if (
      typeof input.carbs_per_hour !== "number" ||
      !Number.isFinite(input.carbs_per_hour) ||
      input.carbs_per_hour < 0
    ) {
      return errorResponse("Invalid carbs per hour", "INVALID_INPUT", 400);
    }
    updates.carbs_per_hour = input.carbs_per_hour;
  }

  try {
    await updateEvent(creds.intervalsApiKey, eventId, updates);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[intervals/events]", err);
    return errorResponse(
      err instanceof Error ? err.message : "Failed to update event",
      "UPSTREAM_ERROR",
      502,
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const eventId = parseCalendarEventId((await params).id);
  if (eventId == null) {
    return errorResponse("Invalid event ID", "INVALID_INPUT", 400);
  }

  try {
    await deleteEvent(creds.intervalsApiKey, eventId);
  } catch (err) {
    if (err instanceof IntervalsApiError && err.status === 404) {
      // Already deleted upstream; local cleanup still has to run.
    } else {
      console.error("[intervals/events]", err);
      return errorResponse(
        err instanceof Error ? err.message : "Failed to delete event",
        "UPSTREAM_ERROR",
        502,
      );
    }
  }

  try {
    await deletePreRunCarbs(email, eventId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[intervals/events]", err);
    return errorResponse(
      "Failed to clean up event",
      "LOCAL_CLEANUP_FAILED",
      500,
    );
  }
}
