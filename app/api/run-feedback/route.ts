import { auth } from "@/lib/auth";
import { getUserSettings } from "@/lib/settings";
import { getRunFeedback, getRunFeedbackByActivity, saveRunFeedback, updateFeedbackCarbsByActivity } from "@/lib/feedbackDb";
import { fetchRunContext, type RunContext } from "@/lib/intervalsHelpers";
import { updateActivityCarbs, updateActivityPreRunCarbs, fetchActivityById, authHeader } from "@/lib/intervalsApi";
import { API_BASE } from "@/lib/constants";
import { NextResponse } from "next/server";
import type { IntervalsActivity } from "@/lib/types";

const MS_PER_HOUR = 3_600_000;

async function fetchActivityContext(
  email: string,
  ts: number,
): Promise<RunContext | null> {
  try {
    const settings = await getUserSettings(email);
    if (!settings.intervalsApiKey) return null;
    return await fetchRunContext(settings.intervalsApiKey, new Date(ts));
  } catch {
    return null;
  }
}

/** Compute prescribed carbs for a given activity by looking up WORKOUT events on that date. */
async function computePrescribedCarbs(
  apiKey: string,
  activity: IntervalsActivity,
): Promise<number | null> {
  const dateStr = (activity.start_date_local ?? activity.start_date).slice(0, 10);
  const movingTimeMs = activity.moving_time != null ? activity.moving_time * 1000 : null;
  if (!movingTimeMs) return null;

  try {
    const res = await fetch(
      `${API_BASE}/athlete/0/events?oldest=${dateStr}T00:00:00&newest=${dateStr}T23:59:59`,
      { headers: { Authorization: authHeader(apiKey) } },
    );
    if (!res.ok) return null;
    const events = (await res.json()) as { category: string; carbs_per_hour?: number }[];
    const planned = events.find((e) => e.category === "WORKOUT" && e.carbs_per_hour != null);
    if (!planned?.carbs_per_hour) return null;
    return Math.round(planned.carbs_per_hour * (movingTimeMs / MS_PER_HOUR));
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const ts = searchParams.get("ts");
  const activityIdParam = searchParams.get("activityId");

  if (!ts && !activityIdParam) {
    return NextResponse.json({ error: "Missing ts or activityId" }, { status: 400 });
  }

  // Branch: activityId-based lookup (from unrated run banner)
  if (activityIdParam) {
    const settings = await getUserSettings(session.user.email);
    if (!settings.intervalsApiKey) {
      return NextResponse.json({ error: "No API key" }, { status: 400 });
    }

    const activity = await fetchActivityById(settings.intervalsApiKey, activityIdParam);
    if (!activity) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }

    const feedback = await getRunFeedbackByActivity(session.user.email, activityIdParam);
    const prescribedCarbsG = await computePrescribedCarbs(settings.intervalsApiKey, activity);
    const movingTimeMs = activity.moving_time != null ? activity.moving_time * 1000 : null;
    const avgHr = activity.average_hr ?? activity.average_heartrate ?? null;

    return NextResponse.json({
      createdAt: new Date(activity.start_date_local ?? activity.start_date).getTime(),
      rating: feedback?.rating ?? null,
      comment: feedback?.comment ?? null,
      carbsG: feedback?.carbsG ?? null,
      distance: activity.distance ?? undefined,
      duration: movingTimeMs ?? undefined,
      avgHr: avgHr ?? undefined,
      activityId: activityIdParam,
      prescribedCarbsG,
      preRunCarbsG: activity.PreRunCarbsG ?? null,
      preRunCarbsMin: activity.PreRunCarbsMin ?? null,
    });
  }

  // Branch: ts-based lookup (from push notification)
  const ctx = await fetchActivityContext(session.user.email, Number(ts));
  const feedback = await getRunFeedback(session.user.email, Number(ts));

  return NextResponse.json({
    createdAt: Number(ts),
    rating: feedback?.rating ?? null,
    comment: feedback?.comment ?? null,
    carbsG: feedback?.carbsG ?? null,
    distance: ctx?.distance ?? undefined,
    duration: ctx?.movingTimeMs ?? undefined,
    avgHr: ctx?.avgHr ?? undefined,
    activityId: ctx?.activityId ?? null,
    prescribedCarbsG: ctx?.prescribedCarbsG ?? null,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    ts: number;
    rating: string;
    comment?: string;
    carbsG?: number;
    preRunCarbsG?: number;
    preRunCarbsMin?: number;
    activityId?: string;
  };
  const { ts, rating, comment, carbsG, preRunCarbsG, preRunCarbsMin, activityId } = body;

  if (!ts || !rating) {
    return NextResponse.json({ error: "Missing ts or rating" }, { status: 400 });
  }

  await saveRunFeedback(session.user.email, ts, rating, comment, carbsG, activityId);

  // Sync carbs to Intervals.icu if we have both
  if (activityId && (carbsG != null || preRunCarbsG != null || preRunCarbsMin != null)) {
    try {
      const settings = await getUserSettings(session.user.email);
      if (settings.intervalsApiKey) {
        if (carbsG != null) {
          await updateActivityCarbs(settings.intervalsApiKey, activityId, carbsG);
        }
        if (preRunCarbsG != null || preRunCarbsMin != null) {
          await updateActivityPreRunCarbs(
            settings.intervalsApiKey,
            activityId,
            preRunCarbsG ?? null,
            preRunCarbsMin ?? null,
          );
        }
      }
    } catch {
      // Non-critical — carbs saved locally, Intervals.icu sync failed
    }
  }

  return NextResponse.json({ ok: true });
}

/** Sync carbs from EventModal back to feedback DB. */
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { activityId?: string; carbsG?: number };
  const { activityId, carbsG } = body;

  if (!activityId || carbsG == null) {
    return NextResponse.json({ error: "Missing activityId or carbsG" }, { status: 400 });
  }

  await updateFeedbackCarbsByActivity(session.user.email, activityId, carbsG);
  return NextResponse.json({ ok: true });
}
