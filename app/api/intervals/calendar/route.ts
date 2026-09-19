import { NextResponse } from "next/server";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { getUserSettings } from "@/lib/settings";
import { fetchCalendarData } from "@/lib/intervalsApi";
import { getUserWorkoutEstimationContext } from "@/lib/workoutEstimationContext";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  let email: string;
  try {
    email = await requireAuth({ headerList: req.headers });
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
    const settings = await getUserSettings(email);
    const workoutContext = await getUserWorkoutEstimationContext(
      email,
      creds.intervalsApiKey,
      settings,
    );
    const data = await fetchCalendarData(
      creds.intervalsApiKey,
      new Date(oldest),
      new Date(newest),
      workoutContext,
    );

    try {
      const protocolsRes = await db().execute({
        sql: "SELECT activity_id, status, feel, rpe, note, pre_run_carbs_g FROM workout_protocols WHERE email = ?",
        args: [email],
      });
      if (protocolsRes.rows.length > 0) {
        const protocolMap = new Map(
          protocolsRes.rows.map((r) => [r.activity_id as string, r]),
        );
        for (const ev of data) {
          if (ev.type === "completed" && ev.activityId) {
            const p = protocolMap.get(ev.activityId);
            if (p) {
              ev.isRated = p.status === "skipped" || p.status === "rated" || p.status == null;
              if (p.feel != null) ev.feel = p.feel as number;
              if (p.rpe != null) ev.rpe = p.rpe as number;
              if (p.note) ev.feedbackComment = p.note as string;
              if (p.pre_run_carbs_g != null) ev.preRunCarbsG = p.pre_run_carbs_g as number;
            }
          }
        }
      }
    } catch (e) {
      console.warn("[calendar] Failed to overlay protocols from Turso:", e);
    }

    if (process.env.NODE_ENV !== "production" && process.env.QA_AUTH_EMAIL && email === process.env.QA_AUTH_EMAIL) {
      const qaCompletedEvent = {
        id: "completed-today-qa",
        date: new Date().toISOString(),
        name: "Morning Easy Run",
        description: "Easy run with Garmin telemetry",
        type: "completed",
        category: "easy",
        distance: 7200,
        duration: 2400,
        avgHr: 144,
        maxHr: 158,
        carbsIngested: 30,
        activityId: "qa-act-today",
        feel: 4,
        rpe: 6,
        rating: null,
        feedbackComment: null,
      };
      return NextResponse.json([qaCompletedEvent, ...data]);
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[intervals/calendar]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch calendar data" },
      { status: 502 },
    );
  }
}
