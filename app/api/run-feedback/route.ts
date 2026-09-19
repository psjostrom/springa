import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import {
  fetchActivityById,
  fetchActivitiesByDateRange,
  updateActivityCarbs,
} from "@/lib/intervalsApi";
import { nonEmpty } from "@/lib/format";
import { NextResponse } from "next/server";
import type { IntervalsActivity } from "@/lib/types";
import type { WorkoutEstimationContext } from "@/lib/workoutMath";
import { getUserSettings } from "@/lib/settings";
import { getUserWorkoutEstimationContext } from "@/lib/workoutEstimationContext";
import { findCompletedActivityMatch } from "@/lib/completedActivityMatch";
import { calculateCanonicalPlannedPrescription } from "@/lib/workoutPrescriptions";
import { getPreRunCarbs } from "@/lib/prerunCarbs";
import {
  getWorkoutProtocol,
  saveWorkoutProtocol,
  type WorkoutProtocol,
  type WorkoutProtocolInput,
} from "@/lib/workoutProtocolDb";

async function resolveMatchedPrescription(
  apiKey: string,
  activity: IntervalsActivity,
  context: WorkoutEstimationContext,
) {
  try {
    const { event, eventId } = await findCompletedActivityMatch(apiKey, activity);
    return {
      eventId,
      prescribedCarbsG: event
        ? calculateCanonicalPlannedPrescription(
            event.description,
            event.carbs_per_hour,
            context,
          )
        : null,
    };
  } catch (error) {
    console.error("Failed to resolve matched prescription:", activity.id, error);
    return { eventId: null, prescribedCarbsG: null };
  }
}

/** Find the latest unrated Run activity from the last 2 days. */
async function findLatestUnratedRun(
  apiKey: string,
  email: string,
): Promise<{ activity: IntervalsActivity; protocol: WorkoutProtocol | null } | null> {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const oldest = sevenDaysAgo.toISOString().slice(0, 10);
  const newest = tomorrow.toISOString().slice(0, 10);

  const activities = await fetchActivitiesByDateRange(apiKey, oldest, newest);
  const candidates = activities
    .filter((a) => a.type === "Run" || a.type === "VirtualRun")
    .sort(
      (a, b) =>
        new Date(b.start_date_local ?? b.start_date).getTime() -
        new Date(a.start_date_local ?? a.start_date).getTime(),
    );

  for (const activity of candidates) {
    if (activity.Rating) continue;
    const protocol = await getWorkoutProtocol(email, activity.id);
    if (protocol?.status === "rated" || protocol?.status === "skipped") continue;
    return { activity, protocol };
  }
  return null;
}

function unsetIfZero(val?: number | null): number | null {
  return val ?? null;
}

interface PreRunCarbsFallback {
  carbsG: number | null;
}

function buildResponse(
  activity: IntervalsActivity,
  prescribedCarbsG: number | null,
  preRunFallback?: PreRunCarbsFallback,
  protocol?: WorkoutProtocol | null,
) {
  const movingTimeMs =
    activity.moving_time != null ? activity.moving_time * 1000 : null;
  const avgHr = activity.average_hr ?? activity.average_heartrate ?? null;
  const isRated = protocol?.status === "rated" || protocol?.status === "skipped" || Boolean(activity.Rating);
  const feel = protocol?.status === "rated" ? (protocol.feel ?? activity.feel ?? null) : (activity.feel ?? null);
  const rpe = protocol?.status === "rated" ? (protocol.rpe ?? activity.icu_rpe ?? activity.rpe ?? null) : (activity.icu_rpe ?? activity.rpe ?? null);
  const preRunCarbs =
    protocol?.preRunCarbsG ??
    unsetIfZero(activity.PreRunCarbsG) ??
    preRunFallback?.carbsG ??
    null;

  return {
    createdAt: new Date(
      activity.start_date_local ?? activity.start_date,
    ).getTime(),
    isRated,
    rating: isRated ? (protocol?.status === "skipped" ? "skipped" : "rated") : null,
    comment: protocol?.note ?? nonEmpty(activity.FeedbackComment),
    carbsG: activity.carbs_ingested ?? null,
    distance: activity.distance ?? undefined,
    duration: movingTimeMs ?? undefined,
    avgHr: avgHr ?? undefined,
    activityId: activity.id,
    prescribedCarbsG,
    preRunCarbsG: preRunCarbs,
    feel,
    rpe,
    protocol: protocol?.hasProtocol ? protocol : null,
    hasFeedback: isRated,
  };
}

export async function GET(req: Request) {
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
  const apiKey = creds.intervalsApiKey;

  const { searchParams } = new URL(req.url);
  const activityIdParam = searchParams.get("activityId");

  const settingsPromise = getUserSettings(email);
  let activity: IntervalsActivity | null;
  if (activityIdParam) {
    const [resolvedActivity, settings, protocol] = await Promise.all([
      fetchActivityById(apiKey, activityIdParam),
      settingsPromise,
      getWorkoutProtocol(email, activityIdParam),
    ]);
    activity = resolvedActivity;
    if (!activity) {
      return NextResponse.json(
        { error: "Activity not found" },
        { status: 404 },
      );
    }
    const workoutContext = await getUserWorkoutEstimationContext(
      email,
      apiKey,
      settings,
    );

    const { prescribedCarbsG, eventId: matchedEventId } =
      await resolveMatchedPrescription(apiKey, activity, workoutContext);

    let preRunFallback: PreRunCarbsFallback | undefined;
    if (unsetIfZero(activity.PreRunCarbsG) == null && protocol?.preRunCarbsG == null) {
      const lookupEventId = activity.paired_event_id ?? matchedEventId;
      if (lookupEventId != null) {
        preRunFallback = {
          carbsG: await getPreRunCarbs(email, lookupEventId),
        };
      }
    }

    return NextResponse.json(
      buildResponse(activity, prescribedCarbsG, preRunFallback, protocol),
    );
  } else {
    const [latestRun, settings] = await Promise.all([
      findLatestUnratedRun(apiKey, email),
      settingsPromise,
    ]);
    if (!latestRun) {
      return NextResponse.json(
        { error: "No unrated run found", retry: true },
        { status: 404 },
      );
    }
    activity = latestRun.activity;
    const protocol = latestRun.protocol;

    const workoutContext = await getUserWorkoutEstimationContext(
      email,
      apiKey,
      settings,
    );

    const { prescribedCarbsG, eventId: matchedEventId } =
      await resolveMatchedPrescription(apiKey, activity, workoutContext);

    let preRunFallback: PreRunCarbsFallback | undefined;
    if (unsetIfZero(activity.PreRunCarbsG) == null && protocol?.preRunCarbsG == null) {
      const lookupEventId = activity.paired_event_id ?? matchedEventId;
      if (lookupEventId != null) {
        preRunFallback = {
          carbsG: await getPreRunCarbs(email, lookupEventId),
        };
      }
    }

    return NextResponse.json(
      buildResponse(activity, prescribedCarbsG, preRunFallback, protocol),
    );
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

  let body: {
    activityId: string;
    status?: "rated" | "skipped";
    rating?: string;
    feel?: number;
    rpe?: number;
    comment?: string;
    carbsG?: number;
    preRunCarbsG?: number;
    protocol?: Record<string, unknown>;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Invalid or empty request body" },
      { status: 400 },
    );
  }

  const { activityId, status, rating, feel, rpe, comment, carbsG, preRunCarbsG, protocol } = body;

  if (typeof activityId !== "string" || !activityId) {
    return NextResponse.json(
      { error: "Missing activityId or rating" },
      { status: 400 },
    );
  }

  if (feel != null && (!Number.isInteger(feel) || feel < 1 || feel > 5)) {
    return NextResponse.json(
      { error: "feel must be an integer from 1 to 5" },
      { status: 400 },
    );
  }

  if (rpe != null && (!Number.isInteger(rpe) || rpe < 1 || rpe > 10)) {
    return NextResponse.json(
      { error: "rpe must be an integer from 1 to 10" },
      { status: 400 },
    );
  }

  const isSkipped = status === "skipped" || rating === "skipped";

  if (
    !isSkipped &&
    !rating &&
    feel == null &&
    rpe == null &&
    !protocol &&
    carbsG == null &&
    preRunCarbsG == null &&
    comment == null
  ) {
    return NextResponse.json(
      { error: "Missing feedback data" },
      { status: 400 },
    );
  }

  if (protocol) {
    const validModes: readonly string[] = ["disconnected", "auto", "manual"];
    const validTimings: readonly string[] = [">2h", "1-2h", "<30m", "at_start"];
    if (protocol.note != null && typeof protocol.note !== "string") {
      return NextResponse.json(
        { error: "Invalid protocol schema" },
        { status: 400 },
      );
    }
    if (
      typeof protocol.beforeMode !== "string" ||
      !validModes.includes(protocol.beforeMode) ||
      typeof protocol.beforeTiming !== "string" ||
      !validTimings.includes(protocol.beforeTiming) ||
      typeof protocol.duringSame !== "boolean"
    ) {
      return NextResponse.json(
        { error: "Invalid protocol schema" },
        { status: 400 },
      );
    }
  }

  const creds = await getUserCredentials(email);
  if (!creds?.intervalsApiKey) {
    return NextResponse.json(
      { error: "Intervals.icu not configured" },
      { status: 400 },
    );
  }
  const apiKey = creds.intervalsApiKey;

  try {
    const existing = await getWorkoutProtocol(email, activityId);
    const trimmedComment =
      typeof comment === "string" ? comment.trim() || null : undefined;

    if (isSkipped) {
      await saveWorkoutProtocol(email, activityId, {
        hasProtocol: false,
        status: "skipped",
        feel: null,
        rpe: null,
        note: trimmedComment ?? existing?.note ?? null,
      });
      return NextResponse.json({ ok: true });
    }

    if (protocol) {
      const protocolInput = protocol as unknown as WorkoutProtocolInput;
      protocolInput.hasProtocol = true;
      protocolInput.status = "rated";
      protocolInput.feel = feel ?? protocolInput.feel ?? existing?.feel ?? null;
      protocolInput.rpe = rpe ?? protocolInput.rpe ?? existing?.rpe ?? null;
      if (preRunCarbsG != null) protocolInput.preRunCarbsG = preRunCarbsG;

      if (trimmedComment !== undefined) {
        protocolInput.note = trimmedComment;
      } else if (protocolInput.note === undefined && existing?.note) {
        protocolInput.note = existing.note;
      }
      await saveWorkoutProtocol(email, activityId, protocolInput);
    } else if (feel != null || rpe != null || trimmedComment !== undefined || preRunCarbsG != null) {
      if (existing) {
        await saveWorkoutProtocol(email, activityId, {
          ...existing,
          status: "rated",
          feel: feel ?? existing.feel,
          rpe: rpe ?? existing.rpe,
          note: trimmedComment !== undefined ? trimmedComment : existing.note,
          preRunCarbsG: preRunCarbsG ?? existing.preRunCarbsG,
        });
      } else {
        await saveWorkoutProtocol(email, activityId, {
          hasProtocol: false,
          status: "rated",
          feel: feel ?? null,
          rpe: rpe ?? null,
          note: trimmedComment ?? null,
          preRunCarbsG: preRunCarbsG ?? null,
        });
      }
    }

    const isMockQaActivity =
      process.env.NODE_ENV !== "production" && activityId.startsWith("qa-");

    if (carbsG != null) {
      try {
        await updateActivityCarbs(apiKey, activityId, carbsG);
      } catch (err) {
        if (!isMockQaActivity) throw err;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save feedback" },
      { status: 502 },
    );
  }
}
