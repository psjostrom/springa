import { auth } from "@/lib/auth";
import {
  getUserSettings,
  saveUserSettings,
  type UserSettings,
} from "@/lib/settings";
import { fetchAthleteProfile } from "@/lib/intervalsApi";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getUserSettings(session.user.email);

  const apiKey = process.env.INTERVALS_API_KEY;
  if (apiKey) {
    settings.intervalsApiKey = apiKey;
    try {
      const profile = await fetchAthleteProfile(apiKey);
      if (profile.lthr) settings.lthr = profile.lthr;
      if (profile.maxHr) settings.maxHr = profile.maxHr;
      if (profile.hrZones) settings.hrZones = profile.hrZones;
    } catch {
      // Intervals.icu unavailable — return settings without profile fields
    }
  }

  settings.xdripConnected = !!process.env.XDRIP_SECRET;
  settings.mylifeConnected = !!process.env.MYLIFE_EMAIL;

  return NextResponse.json(settings);
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Partial<UserSettings>;

  // Only accept race config + widget fields — credentials are env vars now
  const allowed: Partial<UserSettings> = {};
  if (body.raceDate !== undefined) allowed.raceDate = body.raceDate;
  if (body.raceName !== undefined) allowed.raceName = body.raceName;
  if (body.raceDist !== undefined) allowed.raceDist = body.raceDist;
  if (body.prefix !== undefined) allowed.prefix = body.prefix;
  if (body.totalWeeks !== undefined) allowed.totalWeeks = body.totalWeeks;
  if (body.startKm !== undefined) allowed.startKm = body.startKm;
  if (body.widgetOrder !== undefined) allowed.widgetOrder = body.widgetOrder;
  if (body.hiddenWidgets !== undefined) allowed.hiddenWidgets = body.hiddenWidgets;

  if (Object.keys(allowed).length > 0) {
    await saveUserSettings(session.user.email, allowed);
  }

  return NextResponse.json({ ok: true });
}
