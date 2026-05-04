import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import {
  fetchActivityById,
  fetchActivitiesByDateRange,
  updateActivityFeedback,
  updateActivityCarbs,
  updateActivityPreRunCarbs,
  authHeader,
} from "@/lib/intervalsApi";
import { API_BASE } from "@/lib/constants";
import { nonEmpty } from "@/lib/format";
import { NextResponse } from "next/server";
import type { IntervalsActivity, IntervalsEvent } from "@/lib/types";
import { db } from "@/lib/db";
import type { WorkoutEstimationContext } from "@/lib/workoutMath";
import { getUserSettings } from "@/lib/settings";
import { getUserWorkoutEstimationContext } from "@/lib/workoutEstimationContext";
import { findAuthoritativeWorkoutEventMatch } from "@/lib/workoutEventMatching";
import {
  loadWorkoutEventPrescriptions,
  calculateCanonicalPlannedPrescription,
} from "@/lib/workoutPrescriptions";

interface MatchedEvent {
  prescribedCarbsG: number | null;
  eventId: number | null;
}

function shiftDateString(dateStr: string, dayOffset: number): string {
  const date = new Date(`${dateStr}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

/** Find the matching WORKOUT event for this activity date and compute prescribed carbs
 *  from the description (the prescription). Never derive from event time fields —
 *  Intervals.icu overwrites those with actual run time after pairing.
 *
 *  The full workout estimation context must come from the same resolver the UI uses —
 *  otherwise the post-run screen drifts from the pre-run prescription. */
async function findMatchingEvent(
  email: string,
  apiKey: string,
  activity: IntervalsActivity,
  context: WorkoutEstimationContext,
): Promise<MatchedEvent> {
  const dateStr = (activity.start_date_local ?? activity.start_date).slice(
    0,
    10,
  );
  const oldest = shiftDateString(dateStr, -3);
  const newest = shiftDateString(dateStr, 3);

  try {
    const res = await fetch(
      `${API_BASE}/athlete/0/events?oldest=${oldest}T00:00:00&newest=${newest}T23:59:59`,
      { headers: { Authorization: authHeader(apiKey) } },
    );
    if (!res.ok) return { prescribedCarbsG: null, eventId: null };
    const events = (await res.json()) as IntervalsEvent[];
    const planned = findAuthoritativeWorkoutEventMatch(activity, events);
    if (!planned) return { prescribedCarbsG: null, eventId: null };

    const eventId = String(planned.id);
    const stored = await loadWorkoutEventPrescriptions(email, [eventId]);
    if (stored.has(eventId)) {
      return {
        prescribedCarbsG: stored.get(eventId)?.prescribedCarbsG ?? null,
        eventId: planned.id,
      };
    }

    // No stored prescription: return null rather than lazy backfill.
    // No stored prescription (pre-PR run): compute a read-only best-effort fallback
    // using the activity's actual duration. This does NOT write to DB.
    return {
      prescribedCarbsG: calculateCanonicalPlannedPrescription(
        planned.description,
        planned.carbs_per_hour,
        activity.moving_time ?? null,
        context,
      ),
      eventId: planned.id,
    };
  } catch (err) {
    console.error(
      "Failed to find matching event for activity:",
      activity.id,
      err,
    );
    return { prescribedCarbsG: null, eventId: null };
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
      await findMatchingEvent(email, apiKey, activity, workoutContext);

    // Fetch pre-run carbs from Turso if activity doesn't have PreRunCarbsG.
    // Use paired_event_id if available, otherwise use the event we matched above.
    let preRunFallback: PreRunCarbsFallback | undefined;
    if (activity.PreRunCarbsG == null) {
      const lookupEventId = activity.paired_event_id ?? matchedEventId;
      if (lookupEventId != null) {
        const result = await db().execute({
          sql: "SELECT carbs_g FROM prerun_carbs WHERE email = ? AND event_id = ?",
          args: [email, String(lookupEventId)],
        });
        if (result.rows.length > 0) {
          preRunFallback = {
            carbsG: result.rows[0].carbs_g as number | null,
          };
        }
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
      await findMatchingEvent(email, apiKey, activity, workoutContext);

    // Fetch pre-run carbs from Turso if activity doesn't have PreRunCarbsG.
    // Use paired_event_id if available, otherwise use the event we matched above.
    let preRunFallback: PreRunCarbsFallback | undefined;
    if (activity.PreRunCarbsG == null) {
      const lookupEventId = activity.paired_event_id ?? matchedEventId;
      if (lookupEventId != null) {
        const result = await db().execute({
          sql: "SELECT carbs_g FROM prerun_carbs WHERE email = ? AND event_id = ?",
          args: [email, String(lookupEventId)],
        });
        if (result.rows.length > 0) {
          preRunFallback = {
            carbsG: result.rows[0].carbs_g as number | null,
          };
        }
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
    email = await requireAuth();
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

  // Write Rating + FeedbackComment to Intervals.icu
  await updateActivityFeedback(apiKey, activityId, rating, comment);

  // Sync carbs to Intervals.icu if provided
  if (carbsG != null) {
    await updateActivityCarbs(apiKey, activityId, carbsG);
  }
  if (preRunCarbsG != null) {
    await updateActivityPreRunCarbs(apiKey, activityId, preRunCarbsG);
  }

  return NextResponse.json({ ok: true });
}
