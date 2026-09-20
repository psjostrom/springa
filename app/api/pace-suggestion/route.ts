import { NextResponse } from "next/server";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { getUserSettings } from "@/lib/settings";
import { getActivityStreams } from "@/lib/activityStreamsDb";
import { fetchCalendarDataReadOnly, fetchPaceCurves, fetchAthleteProfile } from "@/lib/intervalsApi";
import { getUserWorkoutEstimationContext, resolveHeartRateZones } from "@/lib/workoutEstimationContext";
import { extractZoneSegments } from "@/lib/paceCalibration";
import { generatePaceSuggestion } from "@/lib/paceInsight";

export async function GET(req: Request) {
  let email: string;
  try {
    email = await requireAuth({ headerList: req.headers });
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  try {
    const settings = await getUserSettings(email);
    if (!settings.currentAbilitySecs || !settings.currentAbilityDist) {
      return NextResponse.json({ suggestion: null });
    }

    const creds = await getUserCredentials(email);
    if (!creds?.intervalsApiKey) {
      return NextResponse.json({ suggestion: null });
    }

    const profile = await fetchAthleteProfile(creds.intervalsApiKey);
    const hrZones = resolveHeartRateZones(settings, profile);
    if (!hrZones) {
      return NextResponse.json({ suggestion: null });
    }

    const cached = await getActivityStreams(email);
    if (!cached.length) {
      return NextResponse.json({ suggestion: null });
    }

    const allSegments = cached.flatMap((a) =>
      (a.pace?.length ?? 0) > 0 && a.hr.length > 0 && a.pace
        ? extractZoneSegments(a.hr, a.pace, hrZones, a.activityId, a.activityDate ?? "")
        : [],
    );

    const workoutContext = await getUserWorkoutEstimationContext(
      email,
      creds.intervalsApiKey,
      settings,
      profile,
    );

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const events = await fetchCalendarDataReadOnly(
      creds.intervalsApiKey,
      ninetyDaysAgo,
      new Date(),
      workoutContext,
    );

    const paceCurves = await fetchPaceCurves(creds.intervalsApiKey, "all").catch(() => null);

    const suggestion = generatePaceSuggestion({
      segments: allSegments,
      events,
      currentAbilitySecs: settings.currentAbilitySecs,
      currentAbilityDist: settings.currentAbilityDist,
      paceSuggestionDismissedAt: settings.paceSuggestionDismissedAt,
      bestEfforts: paceCurves?.bestEfforts,
    });

    return NextResponse.json({ suggestion });
  } catch (err) {
    console.error("[pace-suggestion]", err);
    return NextResponse.json({ error: "Failed to generate pace suggestion" }, { status: 500 });
  }
}
