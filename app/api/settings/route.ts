import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import {
  getUserSettings,
  saveUserSettings,
  type UserSettings,
} from "@/lib/settings";
import { getUserCredentials, updateCredentials } from "@/lib/credentials";
import { fetchAthleteRaw, fetchAthleteProfile } from "@/lib/intervalsApi";
import { validateNSConnection, fetchBGFromNS } from "@/lib/nightscout";
import { computeMaxHRZones, DEFAULT_MAX_HR } from "@/lib/constants";
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
    settings.intervalsConnected = true;
    try {
      const profile = await fetchAthleteProfile(creds.intervalsApiKey);
      // Always compute our own 5-zone HR boundaries from maxHR (Runna model).
      // Ignores profile.hrZones intentionally — fresh accounts have 7-zone LTHR arrays
      // that fail length === 5 checks, and we want consistent zones across platforms.
      const maxHr = profile.maxHr ?? DEFAULT_MAX_HR;
      settings.maxHr = maxHr;
      settings.hrZones = computeMaxHRZones(maxHr);
      if (profile.lthr) settings.lthr = profile.lthr;
      if (profile.restingHr) settings.restingHr = profile.restingHr;
      if (profile.sportSettingsId) settings.sportSettingsId = profile.sportSettingsId;
    } catch {
      console.warn("[settings] Failed to fetch athlete profile");
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
    nightscoutUrl?: string | null;
    nightscoutSecret?: string | null;
    timezone?: string;
    displayName?: string;
    runDays?: number[];
    onboardingComplete?: boolean;
  };

  // Validate Intervals.icu API key if provided
  if (body.intervalsApiKey) {
    const athlete = await fetchAthleteRaw(body.intervalsApiKey);
    if (!athlete) {
      return NextResponse.json(
        { error: "Failed to validate Intervals.icu API key" },
        { status: 400 },
      );
    }
  }

  // Validate Nightscout connection only when URL is being set/changed
  if (body.nightscoutUrl) {
    if (body.nightscoutSecret) {
      // When both URL and secret are provided, test with an authenticated fetch
      try {
        await fetchBGFromNS(body.nightscoutUrl, body.nightscoutSecret, { count: 1 });
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Failed to connect to Nightscout server" },
          { status: 400 }
        );
      }
    } else {
      // URL-only change: validate with the public status endpoint
      const validation = await validateNSConnection(body.nightscoutUrl);
      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.error ?? "Failed to connect to Nightscout server" },
          { status: 400 }
        );
      }
    }
  }

  // Settings fields (COALESCE pattern via saveUserSettings)
  const allowed: Partial<UserSettings> = {};
  if (body.raceDate !== undefined) allowed.raceDate = body.raceDate;
  if (body.raceName !== undefined) allowed.raceName = body.raceName;
  if (body.raceDist !== undefined) allowed.raceDist = body.raceDist;
  if (body.currentAbilitySecs !== undefined) allowed.currentAbilitySecs = body.currentAbilitySecs;
  if (body.currentAbilityDist !== undefined) allowed.currentAbilityDist = body.currentAbilityDist;
  if (body.totalWeeks !== undefined) allowed.totalWeeks = body.totalWeeks;
  if (body.startKm !== undefined) allowed.startKm = body.startKm;
  if (body.widgetOrder !== undefined) allowed.widgetOrder = body.widgetOrder;
  if (body.hiddenWidgets !== undefined) allowed.hiddenWidgets = body.hiddenWidgets;
  if (body.bgChartWindow !== undefined) allowed.bgChartWindow = body.bgChartWindow;
  if (body.includeBasePhase !== undefined) allowed.includeBasePhase = body.includeBasePhase;
  if (body.warmthPreference !== undefined) allowed.warmthPreference = body.warmthPreference;
  if (body.diabetesMode !== undefined) allowed.diabetesMode = body.diabetesMode;
  if (body.displayName !== undefined) allowed.displayName = body.displayName;
  if (body.runDays !== undefined) allowed.runDays = body.runDays;
  if (body.longRunDay !== undefined) allowed.longRunDay = body.longRunDay;
  if (body.clubDay !== undefined) allowed.clubDay = body.clubDay;
  if (body.clubType !== undefined) allowed.clubType = body.clubType;
  if (body.onboardingComplete !== undefined) allowed.onboardingComplete = body.onboardingComplete;
  if (body.insulinType !== undefined) allowed.insulinType = body.insulinType;
  if (body.paceSuggestionDismissedAt !== undefined) allowed.paceSuggestionDismissedAt = body.paceSuggestionDismissedAt;

  if (Object.keys(allowed).length > 0) {
    await saveUserSettings(email, allowed);
  }

  // Credential fields (explicit SET via updateCredentials)
  const credUpdates: Parameters<typeof updateCredentials>[1] = {};
  if ("intervalsApiKey" in body) credUpdates.intervalsApiKey = body.intervalsApiKey;
  if ("nightscoutUrl" in body) credUpdates.nightscoutUrl = body.nightscoutUrl;
  if ("nightscoutSecret" in body) credUpdates.nightscoutSecret = body.nightscoutSecret;
  if ("timezone" in body) credUpdates.timezone = body.timezone;

  if (Object.keys(credUpdates).length > 0) {
    await updateCredentials(email, credUpdates);
  }

  return NextResponse.json({ ok: true });
}
