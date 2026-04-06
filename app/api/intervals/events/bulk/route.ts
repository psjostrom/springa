import { NextResponse } from "next/server";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { uploadToIntervals } from "@/lib/intervalsApi";
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
    const count = await uploadToIntervals(creds.intervalsApiKey, events);
    return NextResponse.json({ count });
  } catch (err) {
    console.error("[intervals/events/bulk]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to upload events" },
      { status: 502 },
    );
  }
}
