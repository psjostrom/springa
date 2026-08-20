import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import {
  fetchActivityById,
  fetchActivitiesByDateRange,
  updateActivityFeedback,
  updateActivityCarbs,
  updateActivityPreRunCarbs,
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
): Promise<IntervalsActivity | null> {
  const now = new Date();
  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const oldest = twoDaysAgo.toISOString().slice(0, 10);
  const newest = tomorrow.toISOString().slice(0, 10);

  const activities = await fetchActivitiesByDateRange(apiKey, oldest, newest);
  return (
    activities
      .filter((a) => (a.type === "Run" || a.type === "VirtualRun") && !a.Rating)
      .sort(
        (a, b) =>
          new Date(b.start_date_local ?? b.start_date).getTime() -
          new Date(a.start_date_local ?? a.start_date).getTime(),
      )
      .at(0) ?? null
  );
}

interface PreRunCarbsFallback {
  carbsG: number | null;
}

function buildResponse(
  activity: IntervalsActivity,
  prescribedCarbsG: number | null,
  preRunFallback?: PreRunCarbsFallback,
) {
  const movingTimeMs =
    activity.moving_time != null ? activity.moving_time * 1000 : null;
  const avgHr = activity.average_hr ?? activity.average_heartrate ?? null;
  return {
    createdAt: new Date(
      activity.start_date_local ?? activity.start_date,
    ).getTime(),
    rating: nonEmpty(activity.Rating),
    comment: nonEmpty(activity.FeedbackComment),
    carbsG: activity.carbs_ingested ?? null,
    distance: activity.distance ?? undefined,
    duration: movingTimeMs ?? undefined,
    avgHr: avgHr ?? undefined,
    activityId: activity.id,
    prescribedCarbsG,
    preRunCarbsG: activity.PreRunCarbsG ?? preRunFallback?.carbsG ?? null,
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
    const [resolvedActivity, settings] = await Promise.all([
      fetchActivityById(apiKey, activityIdParam),
      settingsPromise,
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

    // Fetch pre-run carbs from Turso if activity doesn't have PreRunCarbsG.
    // Use paired_event_id if available, otherwise use the event we matched above.
    let preRunFallback: PreRunCarbsFallback | undefined;
    if (activity.PreRunCarbsG == null) {
      const lookupEventId = activity.paired_event_id ?? matchedEventId;
      if (lookupEventId != null) {
        preRunFallback = {
          carbsG: await getPreRunCarbs(email, lookupEventId),
        };
      }
    }

    return NextResponse.json(
      buildResponse(activity, prescribedCarbsG, preRunFallback),
    );
  } else {
    const [resolvedActivity, settings] = await Promise.all([
      findLatestUnratedRun(apiKey),
      settingsPromise,
    ]);
    activity = resolvedActivity;
    if (!activity) {
      return NextResponse.json(
        { error: "No unrated run found", retry: true },
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

    // Fetch pre-run carbs from Turso if activity doesn't have PreRunCarbsG.
    // Use paired_event_id if available, otherwise use the event we matched above.
    let preRunFallback: PreRunCarbsFallback | undefined;
    if (activity.PreRunCarbsG == null) {
      const lookupEventId = activity.paired_event_id ?? matchedEventId;
      if (lookupEventId != null) {
        preRunFallback = {
          carbsG: await getPreRunCarbs(email, lookupEventId),
        };
      }
    }

    return NextResponse.json(
      buildResponse(activity, prescribedCarbsG, preRunFallback),
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
    rating: string;
    comment?: string;
    carbsG?: number;
    preRunCarbsG?: number;
  };

  try {
    body = (await req.json()) as {
      activityId: string;
      rating: string;
      comment?: string;
      carbsG?: number;
      preRunCarbsG?: number;
    };
  } catch {
    return NextResponse.json(
      { error: "Invalid or empty request body" },
      { status: 400 },
    );
  }

  const { activityId, rating, comment, carbsG, preRunCarbsG } = body;

  if (!activityId || !rating) {
    return NextResponse.json(
      { error: "Missing activityId or rating" },
      { status: 400 },
    );
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
    await updateActivityFeedback(apiKey, activityId, rating, comment);
    if (carbsG != null) {
      await updateActivityCarbs(apiKey, activityId, carbsG);
    }
    if (preRunCarbsG != null) {
      await updateActivityPreRunCarbs(apiKey, activityId, preRunCarbsG);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save feedback" },
      { status: 502 },
    );
  }
}
