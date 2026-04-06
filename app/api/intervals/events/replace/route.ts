import { NextResponse } from "next/server";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { replaceWorkoutOnDate } from "@/lib/intervalsApi";
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

  const body = (await req.json()) as {
    existingEventId?: number;
    workout?: WorkoutEvent;
  };
  const existingEventId = body.existingEventId;
  const rawWorkout = body.workout;

  if (!rawWorkout) {
    return NextResponse.json({ error: "Missing workout" }, { status: 400 });
  }

  const workout = {
    ...rawWorkout,
    start_date_local: new Date(rawWorkout.start_date_local),
  };

  try {
    const newId = await replaceWorkoutOnDate(creds.intervalsApiKey, existingEventId, workout);
    return NextResponse.json({ newId });
  } catch (err) {
    console.error("[intervals/events/replace]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to replace workout" },
      { status: 502 },
    );
  }
}
