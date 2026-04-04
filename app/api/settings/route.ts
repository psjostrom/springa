import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import {
  getUserSettings,
  saveUserSettings,
  type UserSettings,
} from "@/lib/settings";
import { getUserCredentials, updateCredentials } from "@/lib/credentials";
import { fetchAthleteProfile } from "@/lib/intervalsApi";
import { validateNSConnection } from "@/lib/nightscout";
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

  const creds = await getUserCredentials(email);
  if (creds?.intervalsApiKey) {
    settings.intervalsApiKey = creds.intervalsApiKey;
    try {
      const profile = await fetchAthleteProfile(creds.intervalsApiKey);
      if (profile.lthr) settings.lthr = profile.lthr;
      if (profile.maxHr) settings.maxHr = profile.maxHr;
      if (profile.hrZones) settings.hrZones = profile.hrZones;
    } catch (err) {
      console.warn("[settings] Failed to fetch athlete profile:", err);
    }
  }

  if (creds?.nightscoutUrl) {
    settings.nightscoutUrl = creds.nightscoutUrl;
  }

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

  const body = (await req.json()) as Partial<UserSettings> & {
    intervalsApiKey?: string | null;
    mylifeEmail?: string | null;
    mylifePassword?: string | null;
    nightscoutUrl?: string | null;
    nightscoutSecret?: string | null;
    timezone?: string;
  };

  // Validate Nightscout connection if URL or secret provided
  if (body.nightscoutUrl || body.nightscoutSecret) {
    const nsUrl = body.nightscoutUrl;
    const nsSecret = body.nightscoutSecret;

    if (!nsUrl || !nsSecret) {
      return NextResponse.json(
        { error: "Both nightscoutUrl and nightscoutSecret are required" },
        { status: 400 }
      );
    }

    const validation = await validateNSConnection(nsUrl);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error || "Failed to connect to Nightscout server" },
        { status: 400 }
      );
    }
  }

  // Settings fields (COALESCE pattern via saveUserSettings)
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

  // Credential fields (explicit SET via updateCredentials)
  const credUpdates: Parameters<typeof updateCredentials>[1] = {};
  if ("intervalsApiKey" in body) credUpdates.intervalsApiKey = body.intervalsApiKey;
  if ("mylifeEmail" in body) credUpdates.mylifeEmail = body.mylifeEmail;
  if ("mylifePassword" in body) credUpdates.mylifePassword = body.mylifePassword;
  if ("nightscoutUrl" in body) credUpdates.nightscoutUrl = body.nightscoutUrl;
  if ("nightscoutSecret" in body) credUpdates.nightscoutSecret = body.nightscoutSecret;
  if ("timezone" in body) credUpdates.timezone = body.timezone;

  if (Object.keys(credUpdates).length > 0) {
    await updateCredentials(email, credUpdates);
  }

  return NextResponse.json({ ok: true });
}
