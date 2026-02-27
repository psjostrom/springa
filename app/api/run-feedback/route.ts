import { auth } from "@/lib/auth";
import { getUserSettings } from "@/lib/settings";
import { getRunFeedback, saveRunFeedback, updateFeedbackCarbsByActivity } from "@/lib/feedbackDb";
import { fetchRunContext, type RunContext } from "@/lib/intervalsHelpers";
import { updateActivityCarbs } from "@/lib/intervalsApi";
import { NextResponse } from "next/server";

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

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const ts = searchParams.get("ts");
  if (!ts) {
    return NextResponse.json({ error: "Missing ts" }, { status: 400 });
  }

  // Fetch activity data from Intervals.icu (source of truth)
  const ctx = await fetchActivityContext(session.user.email, Number(ts));

  // Check if user already submitted feedback for this run
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

  const body = await req.json();
  const { ts, rating, comment, carbsG, activityId } = body as {
    ts: number;
    rating: string;
    comment?: string;
    carbsG?: number;
    activityId?: string;
  };

  if (!ts || !rating) {
    return NextResponse.json({ error: "Missing ts or rating" }, { status: 400 });
  }

  await saveRunFeedback(session.user.email, ts, rating, comment, carbsG, activityId);

  // Sync carbs to Intervals.icu if we have both
  if (carbsG != null && activityId) {
    try {
      const settings = await getUserSettings(session.user.email);
      if (settings.intervalsApiKey) {
        await updateActivityCarbs(settings.intervalsApiKey, activityId, carbsG);
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

  const body = await req.json();
  const { activityId, carbsG } = body as { activityId?: string; carbsG?: number };

  if (!activityId || carbsG == null) {
    return NextResponse.json({ error: "Missing activityId or carbsG" }, { status: 400 });
  }

  await updateFeedbackCarbsByActivity(session.user.email, activityId, carbsG);
  return NextResponse.json({ ok: true });
}
