import { NextResponse } from "next/server";
import {
  errorResponse,
  requireAuth,
  unauthorized,
  AuthError,
  type AuthSource,
} from "@/lib/apiHelpers";
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
import {
  getUserWorkoutEstimationContext,
  resolveHeartRateZones,
} from "@/lib/workoutEstimationContext";
import { deletePreRunCarbs, getPreRunCarbs } from "@/lib/prerunCarbs";
import {
  buildPlannedWorkoutDetail,
  UnsupportedPlannedWorkoutError,
} from "@/lib/plannedWorkoutDetail";
import { MAX_CARBS_PER_HOUR } from "@/lib/fuelRate";
import {
  canUseHeartRateMetric,
  isEffortMetric,
} from "@/lib/effortMetric";
import {
  reemitWorkoutDescription,
  reemitWorkoutName,
} from "@/lib/reemitWorkout";
import { categoryFromExternalId } from "@/lib/paceInsight";
import { todayInTimezone } from "@/lib/timezone";
import type { IntervalsEvent } from "@/lib/types";
import type { UserSettings } from "@/lib/settings";

type AthleteProfile = Awaited<ReturnType<typeof fetchAthleteProfile>>;

interface PlannedWorkoutDetailContext {
  event: IntervalsEvent;
  settings: UserSettings;
  profile: AthleteProfile;
  estimationContext: Awaited<ReturnType<typeof getUserWorkoutEstimationContext>>;
  hrZones?: number[];
  preRunCarbsG: number | null;
}

async function loadPlannedWorkoutDetailContext(
  email: string,
  apiKey: string,
  eventId: number,
): Promise<PlannedWorkoutDetailContext> {
  const settings = await getUserSettings(email);
  const [event, profile, preRunCarbsG] = await Promise.all([
    fetchEvent(apiKey, eventId),
    fetchAthleteProfile(apiKey, { strict: true }),
    getPreRunCarbs(email, eventId),
  ]);
  const estimationContext = await getUserWorkoutEstimationContext(
    email,
    apiKey,
    settings,
    profile,
  );

  return {
    event,
    settings,
    profile,
    estimationContext,
    hrZones: resolveHeartRateZones(settings, profile),
    preRunCarbsG,
  };
}

function buildDetailFromContext(
  context: PlannedWorkoutDetailContext,
  timezone: string,
  event = context.event,
) {
  return buildPlannedWorkoutDetail({
    event,
    lthr: context.profile.lthr,
    hrZones: context.hrZones,
    estimationContext: context.estimationContext,
    timezone,
    warmthPreference: context.settings.warmthPreference,
    preRunCarbsG: context.preRunCarbsG,
  });
}

function isRaceEvent(event: IntervalsEvent): boolean {
  const normalizedName = (event.name ?? "").trim().toLowerCase();
  return (
    (typeof event.category === "string" &&
      event.category.toLowerCase() === "race") ||
    categoryFromExternalId(event.external_id) === "race" ||
    /^race day\b/.test(normalizedName)
  );
}

function isEligibleEffortEvent(event: IntervalsEvent, timezone: string): boolean {
  const localDateTime = event.start_date_local;
  const localDate =
    typeof localDateTime === "string"
      ? localDateTime.slice(0, 10)
      : "";
  return (
    event.category === "WORKOUT" &&
    event.type === "Run" &&
    event.paired_activity_id == null &&
    !isRaceEvent(event) &&
    isLocalDateTime(localDateTime) &&
    localDate >= todayInTimezone(timezone)
  );
}

function detailErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof IntervalsApiError) {
    switch (error.resource) {
      case "athlete-profile":
        return errorResponse(
          "Failed to fetch athlete profile",
          "UPSTREAM_ERROR",
          502,
        );
      case "event":
        return error.status === 404
          ? errorResponse("Event not found", "EVENT_NOT_FOUND", 404)
          : errorResponse("Failed to fetch event", "UPSTREAM_ERROR", 502);
    }
  }
  if (error instanceof UnsupportedPlannedWorkoutError) {
    return errorResponse(error.message, "UNSUPPORTED_EVENT", 422);
  }
  return null;
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
    return errorResponse(
      "Intervals.icu not configured",
      "MISSING_CREDENTIALS",
      400,
    );
  }

  try {
    const context = await loadPlannedWorkoutDetailContext(
      email,
      creds.intervalsApiKey,
      eventId,
    );

    return NextResponse.json(
      await buildDetailFromContext(context, creds.timezone),
    );
  } catch (error) {
    const response = detailErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
  const isBearer = authSource === "bearer";
  const isEffortIntent =
    isBearer && keys.length === 1 && keys[0] === "effortMetric";
  if (isEffortIntent) {
    if (!isEffortMetric(input.effortMetric)) {
      return errorResponse("Invalid input", "INVALID_INPUT", 400);
    }

    let context: PlannedWorkoutDetailContext;
    try {
      context = await loadPlannedWorkoutDetailContext(
        email,
        creds.intervalsApiKey,
        eventId,
      );
    } catch (error) {
      const response = detailErrorResponse(error);
      if (response) return response;
      throw error;
    }

    if (!isEligibleEffortEvent(context.event, creds.timezone)) {
      return errorResponse(
        "Event is not a planned workout",
        "UNSUPPORTED_EVENT",
        422,
      );
    }
    if (
      input.effortMetric === "hr" &&
      !canUseHeartRateMetric(context.profile.lthr, context.hrZones)
    ) {
      return errorResponse(
        "Heart-rate effort metric requires LTHR and five HR zones",
        "PLAN_SETTINGS_REQUIRED",
        422,
      );
    }

    let currentDetail;
    try {
      currentDetail = await buildDetailFromContext(context, creds.timezone);
    } catch (error) {
      const response = detailErrorResponse(error);
      if (response) return response;
      throw error;
    }
    if (currentDetail.effortMetric === input.effortMetric) {
      return NextResponse.json(currentDetail);
    }

    let candidateDetail;
    let name: string;
    let description: string;
    try {
      const reemitContext = {
        lthr: context.profile.lthr ?? 0,
        hrZones: context.hrZones ?? [],
        thresholdPace: context.estimationContext.thresholdPace,
      };
      name = reemitWorkoutName(
        context.event.name ?? "",
        input.effortMetric,
      );
      description = reemitWorkoutDescription(
        context.event.description ?? "",
        input.effortMetric,
        reemitContext,
      );
      candidateDetail = await buildDetailFromContext(context, creds.timezone, {
        ...context.event,
        name,
        description,
      });
    } catch (error) {
      if (error instanceof UnsupportedPlannedWorkoutError) {
        return errorResponse(error.message, "UNSUPPORTED_EVENT", 422);
      }
      if (error instanceof Error && /re-emit|HR effortMetric/.test(error.message)) {
        return errorResponse(error.message, "UNSUPPORTED_EVENT", 422);
      }
      throw error;
    }
    if (candidateDetail.effortMetric !== input.effortMetric) {
      return errorResponse(
        "Generated workout does not match requested effort metric",
        "UNSUPPORTED_EVENT",
        422,
      );
    }

    try {
      await updateEvent(creds.intervalsApiKey, eventId, { name, description });
    } catch (error) {
      console.error("[intervals/events]", error);
      return errorResponse(
        "Failed to update event",
        "UPSTREAM_ERROR",
        502,
      );
    }
    return NextResponse.json(candidateDetail);
  }
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
      input.carbs_per_hour < 0 ||
      input.carbs_per_hour > MAX_CARBS_PER_HOUR
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
      "Failed to update event",
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
    return errorResponse(
      "Intervals.icu not configured",
      "MISSING_CREDENTIALS",
      400,
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
        "Failed to delete event",
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
