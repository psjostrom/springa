import { NextResponse } from "next/server";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { buildCompletedWorkoutOverview } from "@/lib/completedOverview";
import { getUserCredentials } from "@/lib/credentials";
import { IntervalsApiError } from "@/lib/intervalsApi";
import { getUserSettings } from "@/lib/settings";
import { getWorkoutProtocol } from "@/lib/workoutProtocolDb";

const ACTIVITY_ID_PATTERN = /^[a-zA-Z0-9_:-]+$/;

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

  const creds = await getUserCredentials(email);
  if (!creds?.intervalsApiKey) {
    return NextResponse.json(
      { error: "Intervals.icu not configured" },
      { status: 400 },
    );
  }

  const { id } = await params;
  if (!ACTIVITY_ID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid activity ID" }, { status: 400 });
  }

  if (
    process.env.NODE_ENV !== "production" &&
    process.env.QA_AUTH_EMAIL &&
    email === process.env.QA_AUTH_EMAIL &&
    id === "qa-act-today"
  ) {
    const protocol = await getWorkoutProtocol(email, "qa-act-today");
    return NextResponse.json({
      activityId: "qa-act-today",
      reportCard: {
        bg: {
          rating: "good",
          startBG: 7.2,
          minBG: 5.4,
          hypo: false,
          worstRate: -0.4,
          lbgi: 1.1,
        },
        hrZone: {
          rating: "good",
          targetZone: "z2",
          pctInTarget: 82,
          expectedRepSec: 180,
        },
        entryTrend: {
          rating: "good",
          slope30m: 0.2,
          stability: 1.5,
          label: "Stable",
        },
        recovery: {
          rating: "good",
          drop30m: -0.5,
          nadir: 5.8,
          postHypo: false,
          label: "Smooth",
        },
      },
      splits: [
        { km: 1, paceMinPerKm: 5.4, avgHr: 138, elevationChangeM: 2 },
        { km: 2, paceMinPerKm: 5.3, avgHr: 142, elevationChangeM: -1 },
        { km: 3, paceMinPerKm: 5.35, avgHr: 145, elevationChangeM: 4 },
      ],
      preRunCarbs: {
        grams: 20,
        source: "activity",
        fallbackEventId: null,
      },
      protocol,
      feel: 4,
      rpe: 6,
    });
  }

  const settings = await getUserSettings(email);

  try {
    const overview = await buildCompletedWorkoutOverview({
      email,
      apiKey: creds.intervalsApiKey,
      activityId: id,
      diabetesMode: settings.diabetesMode === true,
    });
    return NextResponse.json(overview);
  } catch (err) {
    console.error("[intervals/activity/overview]", err);
    if (err instanceof IntervalsApiError) {
      const notFound = err.status === 404;
      return NextResponse.json(
        { error: notFound ? "Activity not found" : "Failed to fetch activity" },
        { status: notFound ? 404 : 502 },
      );
    }
    return NextResponse.json(
      { error: "Failed to load activity overview" },
      { status: 502 },
    );
  }
}
