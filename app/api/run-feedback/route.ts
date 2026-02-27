import { auth } from "@/lib/auth";
import { getUserSettings } from "@/lib/settings";
import { getRunFeedback, updateRunFeedback, updateFeedbackCarbsByActivity } from "@/lib/feedbackDb";
import { fetchRunContext } from "@/lib/intervalsHelpers";
import { updateActivityCarbs } from "@/lib/intervalsApi";
import { NextResponse } from "next/server";

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

  const feedback = await getRunFeedback(session.user.email, Number(ts));
  if (!feedback) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch activityId and prescribed carbs from Intervals.icu
  let activityId: string | null = null;
  let prescribedCarbsG: number | null = null;
  try {
    if (feedback.duration != null) {
      const settings = await getUserSettings(session.user.email);
      if (settings.intervalsApiKey) {
        const ctx = await fetchRunContext(
          settings.intervalsApiKey,
          feedback.duration,
          new Date(Number(ts)),
        );
        activityId = ctx.activityId;
        prescribedCarbsG = ctx.prescribedCarbsG;
      }
    }
  } catch {
    // Intervals.icu unavailable — form will be disabled (no activityId), user can reload
  }

  return NextResponse.json({ ...feedback, activityId, prescribedCarbsG });
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

  await updateRunFeedback(session.user.email, ts, rating, comment, carbsG, activityId);

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
