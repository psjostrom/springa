import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { updateAthleteHRZones } from "@/lib/intervalsApi";
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

  const body = (await req.json()) as {
    sportSettingsId: number;
    hrZones: number[];
    restingHr?: number;
    maxHr?: number;
  };

  if (!body.sportSettingsId || !Array.isArray(body.hrZones) || body.hrZones.length !== 5) {
    return NextResponse.json({ error: "Invalid HR zone data" }, { status: 400 });
  }

  try {
    await updateAthleteHRZones(creds.intervalsApiKey, body.sportSettingsId, body.hrZones, body.restingHr, body.maxHr);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to update Intervals.icu" }, { status: 502 });
  }
}
