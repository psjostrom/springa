import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { fetchAthleteProfile, updateThresholdPace } from "@/lib/intervalsApi";
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

  const body = (await req.json()) as { racePaceMinPerKm: number };
  if (typeof body.racePaceMinPerKm !== "number" || body.racePaceMinPerKm <= 0) {
    return NextResponse.json({ error: "Invalid pace value" }, { status: 400 });
  }

  const profile = await fetchAthleteProfile(creds.intervalsApiKey);
  if (!profile.sportSettingsId) {
    return NextResponse.json({ error: "No Run sport settings found in Intervals.icu" }, { status: 400 });
  }

  try {
    await updateThresholdPace(creds.intervalsApiKey, profile.sportSettingsId, body.racePaceMinPerKm);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to update Intervals.icu" }, { status: 502 });
  }
}
