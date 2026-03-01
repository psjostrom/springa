import { auth } from "@/lib/auth";
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
import type { IntervalsActivity } from "@/lib/types";

const MS_PER_HOUR = 3_600_000;

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

/** Find the latest unrated Run activity from the last 2 days. */
async function findLatestUnratedRun(apiKey: string): Promise<IntervalsActivity | null> {
  const now = new Date();
  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const oldest = twoDaysAgo.toISOString().slice(0, 10);
  const newest = tomorrow.toISOString().slice(0, 10);

  const activities = await fetchActivitiesByDateRange(apiKey, oldest, newest);
  return activities
    .filter((a) => a.type === "Run" && !a.Rating)
    .sort((a, b) =>
      new Date(b.start_date_local ?? b.start_date).getTime() -
      new Date(a.start_date_local ?? a.start_date).getTime(),
    )
    .at(0) ?? null;
}

function buildResponse(activity: IntervalsActivity, prescribedCarbsG: number | null) {
  const movingTimeMs = activity.moving_time != null ? activity.moving_time * 1000 : null;
  const avgHr = activity.average_hr ?? activity.average_heartrate ?? null;
  return {
    createdAt: new Date(activity.start_date_local ?? activity.start_date).getTime(),
    rating: nonEmpty(activity.Rating),
    comment: nonEmpty(activity.FeedbackComment),
    carbsG: activity.carbs_ingested ?? null,
    distance: activity.distance ?? undefined,
    duration: movingTimeMs ?? undefined,
    avgHr: avgHr ?? undefined,
    activityId: activity.id,
    prescribedCarbsG,
    preRunCarbsG: activity.PreRunCarbsG ?? null,
    preRunCarbsMin: activity.PreRunCarbsMin ?? null,
  };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.INTERVALS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "No API key" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const activityIdParam = searchParams.get("activityId");

  let activity: IntervalsActivity | null;
  if (activityIdParam) {
    activity = await fetchActivityById(apiKey, activityIdParam);
    if (!activity) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }
  } else {
    activity = await findLatestUnratedRun(apiKey);
    if (!activity) {
      return NextResponse.json({ error: "No unrated run found", retry: true }, { status: 404 });
    }
  }

  const prescribedCarbsG = await computePrescribedCarbs(apiKey, activity);
  return NextResponse.json(buildResponse(activity, prescribedCarbsG));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    activityId: string;
    rating: string;
    comment?: string;
    carbsG?: number;
    preRunCarbsG?: number;
    preRunCarbsMin?: number;
  };
  const { activityId, rating, comment, carbsG, preRunCarbsG, preRunCarbsMin } = body;

  if (!activityId || !rating) {
    return NextResponse.json({ error: "Missing activityId or rating" }, { status: 400 });
  }

  const apiKey = process.env.INTERVALS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "No API key" }, { status: 400 });
  }

  // Write Rating + FeedbackComment to Intervals.icu
  await updateActivityFeedback(apiKey, activityId, rating, comment);

  // Sync carbs to Intervals.icu if provided
  if (carbsG != null) {
    await updateActivityCarbs(apiKey, activityId, carbsG);
  }
  if (preRunCarbsG != null || preRunCarbsMin != null) {
    await updateActivityPreRunCarbs(
      apiKey,
      activityId,
      preRunCarbsG ?? null,
      preRunCarbsMin ?? null,
    );
  }

  return NextResponse.json({ ok: true });
}
