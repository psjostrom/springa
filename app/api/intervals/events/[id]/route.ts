import { NextResponse } from "next/server";
import { addDays } from "date-fns";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { updateEvent, deleteEvent, fetchCalendarData } from "@/lib/intervalsApi";
import { getUserSettings } from "@/lib/settings";
import { getUserWorkoutEstimationContext } from "@/lib/workoutEstimationContext";
import {
  deleteWorkoutEventPrescriptions,
  syncWorkoutEventPrescriptions,
} from "@/lib/workoutPrescriptions";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isFinite(eventId)) {
    return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
  }
  const body = (await req.json()) as {
    start_date_local?: string;
    name?: string;
    description?: string;
    carbs_per_hour?: number;
  };

  const updates: {
    start_date_local?: string;
    name?: string;
    description?: string;
    carbs_per_hour?: number;
  } = {};

  if (body.start_date_local !== undefined) updates.start_date_local = body.start_date_local;
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.carbs_per_hour !== undefined) updates.carbs_per_hour = body.carbs_per_hour;

  try {
    await updateEvent(creds.intervalsApiKey, eventId, updates);

    // If description or carbs_per_hour changed, re-sync the prescription.
    if (updates.description !== undefined || updates.carbs_per_hour !== undefined) {
      const settings = await getUserSettings(email);
      const workoutContext = await getUserWorkoutEstimationContext(
        email,
        creds.intervalsApiKey,
        settings,
      );
      const today = new Date();
      const horizon = addDays(today, 365);
      const calendarEvents = await fetchCalendarData(creds.intervalsApiKey, today, horizon);
      const event = calendarEvents.find((e) => e.id === `event-${eventId}`);
      if (event) {
        await syncWorkoutEventPrescriptions(email, [event], workoutContext);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[intervals/events]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update event" },
      { status: 502 },
    );
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isFinite(eventId)) {
    return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
  }

  try {
    await deleteEvent(creds.intervalsApiKey, eventId);
    await deleteWorkoutEventPrescriptions(email, [String(eventId)]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[intervals/events]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete event" },
      { status: 502 },
    );
  }
}
