import { auth } from "@/lib/auth";
import {
  getUserSettings,
  saveUserSettings,
  type UserSettings,
} from "@/lib/settings";
import { fetchAthleteProfile } from "@/lib/intervalsApi";
import { saveXdripAuth } from "@/lib/xdripDb";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getUserSettings(session.user.email);

  // Fetch athlete profile from Intervals.icu on every request (no DB cache)
  if (settings.intervalsApiKey) {
    try {
      const profile = await fetchAthleteProfile(settings.intervalsApiKey);
      if (profile.lthr) settings.lthr = profile.lthr;
      if (profile.maxHr) settings.maxHr = profile.maxHr;
      if (profile.hrZones) settings.hrZones = profile.hrZones;
    } catch {
      // Intervals.icu unavailable — return settings without profile fields
    }
  }

  return NextResponse.json(settings);
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Partial<UserSettings>;

  // Profile fields are read-only from Intervals.icu — strip before saving
  delete body.lthr;
  delete body.maxHr;
  delete body.hrZones;

  // xDrip secret needs special handling for reverse auth mapping
  if (body.xdripSecret) {
    await saveXdripAuth(session.user.email, body.xdripSecret);
    delete body.xdripSecret;
  }

  if (Object.keys(body).length > 0) {
    await saveUserSettings(session.user.email, body);
  }

  return NextResponse.json({ ok: true });
}
