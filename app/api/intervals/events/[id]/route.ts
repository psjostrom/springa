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
import { parseCalendarEventId } from "@/lib/calendarEventId";
import { getUserSettings } from "@/lib/settings";
import { getUserWorkoutEstimationContext } from "@/lib/workoutEstimationContext";
import { getPreRunCarbs } from "@/lib/prerunCarbs";
import {
  buildPlannedWorkoutDetail,
  UnsupportedPlannedWorkoutError,
} from "@/lib/plannedWorkoutDetail";
import {
  computeMaxHRZones,
  DEFAULT_LTHR,
  DEFAULT_MAX_HR,
} from "@/lib/constants";

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
    const [event, profile, estimationContext, preRunCarbsG] =
      await Promise.all([
        fetchEvent(creds.intervalsApiKey, eventId),
        fetchAthleteProfile(creds.intervalsApiKey),
        getUserWorkoutEstimationContext(
          email,
          creds.intervalsApiKey,
          settings,
        ),
        getPreRunCarbs(email, eventId),
      ]);
    const maxHr = settings.maxHr ?? profile.maxHr ?? DEFAULT_MAX_HR;
    const hrZones =
      settings.hrZones?.length === 5
        ? settings.hrZones
        : profile.hrZones?.length === 5
          ? profile.hrZones
          : computeMaxHRZones(maxHr);

    return NextResponse.json(
      await buildPlannedWorkoutDetail({
        event,
        lthr: profile.lthr ?? DEFAULT_LTHR,
        hrZones,
        estimationContext,
        timezone: creds.timezone,
        warmthPreference: settings.warmthPreference,
        preRunCarbsG,
      }),
    );
  } catch (error) {
    if (error instanceof IntervalsApiError) {
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
    email = await requireAuth();
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

  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isFinite(eventId)) {
    return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
  }
  const body = (await req.json()) as {
    start_date_local?: string;
    name?: string;
    description?: string;
    carbs_per_hour?: number;
  };

  const updates: {
    start_date_local?: string;
    name?: string;
    description?: string;
    carbs_per_hour?: number;
  } = {};

  if (body.start_date_local !== undefined)
    updates.start_date_local = body.start_date_local;
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.carbs_per_hour !== undefined)
    updates.carbs_per_hour = body.carbs_per_hour;

  try {
    await updateEvent(creds.intervalsApiKey, eventId, updates);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[intervals/events]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update event" },
      { status: 502 },
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let email: string;
  try {
    email = await requireAuth();
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

  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isFinite(eventId)) {
    return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
  }

  try {
    await deleteEvent(creds.intervalsApiKey, eventId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[intervals/events]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete event" },
      { status: 502 },
    );
  }
}
