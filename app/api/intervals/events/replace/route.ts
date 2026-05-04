import { NextResponse } from "next/server";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { replaceWorkoutOnDate } from "@/lib/intervalsApi";
import { getUserSettings } from "@/lib/settings";
import { getUserWorkoutEstimationContext } from "@/lib/workoutEstimationContext";
import {
  deleteWorkoutEventPrescriptions,
  syncWorkoutEventPrescriptions,
} from "@/lib/workoutPrescriptions";
import type { CalendarEvent } from "@/lib/types";
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

    const settings = await getUserSettings(email);
    const workoutContext = await getUserWorkoutEstimationContext(
      email,
      creds.intervalsApiKey,
      settings,
    );
    const newPlannedEvent: CalendarEvent = {
      id: `event-${newId}`,
      date: workout.start_date_local,
      name: workout.name,
      description: workout.description,
      type: "planned",
      category: "other",
      fuelRate: workout.fuelRate ?? null,
    };
    await syncWorkoutEventPrescriptions(email, [newPlannedEvent], workoutContext);

    if (existingEventId != null) {
      await deleteWorkoutEventPrescriptions(email, [String(existingEventId)]);
    }

    return NextResponse.json({ newId });
  } catch (err) {
    console.error("[intervals/events/replace]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to replace workout" },
      { status: 502 },
    );
  }
}
