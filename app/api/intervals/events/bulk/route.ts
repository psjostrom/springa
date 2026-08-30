import { NextResponse } from "next/server";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { uploadToIntervals } from "@/lib/intervalsApi";
import { canonicalPlannerConfig, plannerConfigFromSettings } from "@/lib/plannerConfig";
import { savePlannerMetadata } from "@/lib/plannerMetadata";
import { getUserSettings } from "@/lib/settings";
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
    return NextResponse.json(
      { error: "Intervals.icu not configured" },
      { status: 400 },
    );
  }

  const body = (await req.json()) as {
    events?: WorkoutEvent[];
    recordPlannerMetadata?: boolean;
  };
  const rawEvents = body.events;

  if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
    return NextResponse.json(
      { error: "Missing or invalid events" },
      { status: 400 },
    );
  }

  const events = rawEvents.map((e) => ({
    ...e,
    start_date_local: new Date(e.start_date_local),
  }));

  try {
    const plannerConfig = body.recordPlannerMetadata
      ? plannerConfigFromSettings(await getUserSettings(email))
      : null;
    if (body.recordPlannerMetadata && !plannerConfig) {
      return NextResponse.json(
        { error: "Complete Planner settings required" },
        { status: 400 },
      );
    }

    const { count, staleDeleteFailures } = await uploadToIntervals(creds.intervalsApiKey, events);
    if (plannerConfig) {
      await savePlannerMetadata(email, {
        generatedPlanConfig: canonicalPlannerConfig(plannerConfig),
        dirty: staleDeleteFailures.length > 0,
      });
    }
    return NextResponse.json({ count });
  } catch (err) {
    console.error("[intervals/events/bulk]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to upload events" },
      { status: 502 },
    );
  }
}
