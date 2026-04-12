import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { fetchAthleteRaw, fetchAthleteProfile, updateThresholdPace, updatePaceZones } from "@/lib/intervalsApi";
import { NextResponse } from "next/server";

export async function PUT(req: Request) {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const creds = await getUserCredentials(email);
  if (!creds?.intervalsApiKey) {
    return NextResponse.json({ error: "Intervals.icu not connected" }, { status: 400 });
  }

  const body = (await req.json()) as { paceMinPerKm: number };
  if (typeof body.paceMinPerKm !== "number" || body.paceMinPerKm <= 0 || body.paceMinPerKm > 15) {
    return NextResponse.json({ error: "Invalid pace value" }, { status: 400 });
  }

  const raw = await fetchAthleteRaw(creds.intervalsApiKey);
  if (!raw) {
    return NextResponse.json({ error: "Failed to connect to Intervals.icu" }, { status: 502 });
  }

  const profile = await fetchAthleteProfile(creds.intervalsApiKey);
  if (!profile.sportSettingsId) {
    return NextResponse.json({ error: "No Run sport settings found in Intervals.icu" }, { status: 400 });
  }

  try {
    await updateThresholdPace(creds.intervalsApiKey, profile.sportSettingsId, body.paceMinPerKm);
  } catch {
    return NextResponse.json({ error: "Failed to update threshold pace" }, { status: 502 });
  }

  // Pace zones are derived from threshold — pushing both together ensures consistency.
  // Best-effort: if zones fail, threshold is already saved.
  try {
    await updatePaceZones(creds.intervalsApiKey, profile.sportSettingsId);
  } catch (e) { console.error("Pace zone sync failed (non-critical):", e); }

  return NextResponse.json({ ok: true });
}
