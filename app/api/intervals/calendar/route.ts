import { NextResponse } from "next/server";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { getUserSettings } from "@/lib/settings";
import { fetchCalendarData } from "@/lib/intervalsApi";
import { getUserWorkoutEstimationContext } from "@/lib/workoutEstimationContext";
import { enrichEventsWithWorkoutEventPrescriptions } from "@/lib/workoutPrescriptions";

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
    return NextResponse.json({ error: "Intervals.icu not configured" }, { status: 400 });
  }

  const url = new URL(req.url);
  const oldest = url.searchParams.get("oldest");
  const newest = url.searchParams.get("newest");

  if (!oldest || !newest) {
    return NextResponse.json({ error: "Missing oldest or newest parameter" }, { status: 400 });
  }

  try {
    const data = await fetchCalendarData(creds.intervalsApiKey, new Date(oldest), new Date(newest));
    const settings = await getUserSettings(email);
    const workoutContext = await getUserWorkoutEstimationContext(
      email,
      creds.intervalsApiKey,
      settings,
    );
    const enriched = await enrichEventsWithWorkoutEventPrescriptions(email, data, workoutContext);
    return NextResponse.json(enriched);
  } catch (err) {
    console.error("[intervals/calendar]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch calendar data" },
      { status: 502 },
    );
  }
}
