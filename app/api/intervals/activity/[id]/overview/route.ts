import { NextResponse } from "next/server";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { buildCompletedWorkoutOverview } from "@/lib/completedOverview";
import { getUserCredentials } from "@/lib/credentials";
import { IntervalsApiError } from "@/lib/intervalsApi";
import { getUserSettings } from "@/lib/settings";

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
