import { NextResponse } from "next/server";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { uploadToIntervals, fetchCalendarData } from "@/lib/intervalsApi";
import { getUserSettings } from "@/lib/settings";
import { getUserWorkoutEstimationContext } from "@/lib/workoutEstimationContext";
import {
  deleteWorkoutEventPrescriptions,
  syncWorkoutEventPrescriptions,
} from "@/lib/workoutPrescriptions";
import { addDays } from "date-fns";
import type { WorkoutEvent } from "@/lib/types";

export async function POST(req: Request) {
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

  const body = (await req.json()) as { events?: WorkoutEvent[] };
  const rawEvents = body.events;

  if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
    return NextResponse.json({ error: "Missing or invalid events" }, { status: 400 });
  }

  const events = rawEvents.map((e) => ({
    ...e,
    start_date_local: new Date(e.start_date_local),
  }));

  try {
    const { count, staleDeletedEventIds } = await uploadToIntervals(creds.intervalsApiKey, events);

    const today = new Date();
    const horizon = addDays(today, 365);
    const [calendarEvents, settings] = await Promise.all([
      fetchCalendarData(creds.intervalsApiKey, today, horizon),
      getUserSettings(email),
    ]);
    const workoutContext = await getUserWorkoutEstimationContext(
      email,
      creds.intervalsApiKey,
      settings,
    );
    await syncWorkoutEventPrescriptions(email, calendarEvents, workoutContext);
    await deleteWorkoutEventPrescriptions(
      email,
      staleDeletedEventIds.map((eventId) => String(eventId)),
    );

    return NextResponse.json({ count });
  } catch (err) {
    console.error("[intervals/events/bulk]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to upload events" },
      { status: 502 },
    );
  }
}
