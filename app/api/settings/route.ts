import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import {
  getUserSettings,
  saveUserSettings,
  type UserSettings,
} from "@/lib/settings";
import { fetchAthleteProfile } from "@/lib/intervalsApi";
import { NextResponse } from "next/server";

export async function GET() {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const settings = await getUserSettings(email);

  const apiKey = process.env.INTERVALS_API_KEY;
  if (apiKey) {
    settings.intervalsApiKey = apiKey;
    try {
      const profile = await fetchAthleteProfile(apiKey);
      if (profile.lthr) settings.lthr = profile.lthr;
      if (profile.maxHr) settings.maxHr = profile.maxHr;
      if (profile.hrZones) settings.hrZones = profile.hrZones;
    } catch (err) {
      console.warn("[settings] Failed to fetch athlete profile:", err);
    }
  }

  settings.cgmConnected = !!process.env.XDRIP_SECRET;
  settings.mylifeConnected = !!process.env.MYLIFE_EMAIL;

  return NextResponse.json(settings);
}

export async function PUT(req: Request) {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const body = (await req.json()) as Partial<UserSettings>;

  // Only accept race config + widget fields — credentials are env vars now
  const allowed: Partial<UserSettings> = {};
  if (body.raceDate !== undefined) allowed.raceDate = body.raceDate;
  if (body.raceName !== undefined) allowed.raceName = body.raceName;
  if (body.raceDist !== undefined) allowed.raceDist = body.raceDist;

  if (body.totalWeeks !== undefined) allowed.totalWeeks = body.totalWeeks;
  if (body.startKm !== undefined) allowed.startKm = body.startKm;
  if (body.widgetOrder !== undefined) allowed.widgetOrder = body.widgetOrder;
  if (body.hiddenWidgets !== undefined) allowed.hiddenWidgets = body.hiddenWidgets;
  if (body.bgChartWindow !== undefined) allowed.bgChartWindow = body.bgChartWindow;
  if (body.includeBasePhase !== undefined) allowed.includeBasePhase = body.includeBasePhase;
  if (body.warmthPreference !== undefined) allowed.warmthPreference = body.warmthPreference;

  if (Object.keys(allowed).length > 0) {
    await saveUserSettings(email, allowed);
  }

  return NextResponse.json({ ok: true });
}
