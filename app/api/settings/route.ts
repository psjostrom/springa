import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import {
  getUserSettings,
  saveUserSettings,
  WRITABLE_SETTINGS_KEYS,
  type UserSettings,
} from "@/lib/settings";
import { getUserCredentials, updateCredentials } from "@/lib/credentials";
import { fetchAthleteRaw, fetchAthleteProfile } from "@/lib/intervalsApi";
import { validateNSConnection, fetchBGFromNS } from "@/lib/nightscout";
import { computeMaxHRZones, DEFAULT_MAX_HR } from "@/lib/constants";
import {
  PLANNER_CONFIG_KEYS,
  plannerConfigFromSettings,
  REQUIRED_PLANNER_CONFIG_KEYS,
  resolvePlannerConfig,
  validatePlannerConfig,
  PlannerError,
} from "@/lib/plannerConfig";
import { getPlannerMetadata } from "@/lib/plannerMetadata";
import { NextResponse } from "next/server";

export async function GET(req?: Request) {
  let email: string;
  try {
    email = await requireAuth({ headerList: req?.headers });
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
    email = await requireAuth({ headerList: req.headers });
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  let body: Partial<UserSettings> & {
    intervalsApiKey?: string | null;
    nightscoutUrl?: string | null;
    nightscoutSecret?: string | null;
    timezone?: string;
    displayName?: string;
    runDays?: number[];
    onboardingComplete?: boolean;
    plannerIntent?: "start" | "update";
  };

  try {
    body = (await req.json()) as Partial<UserSettings> & {
      intervalsApiKey?: string | null;
      nightscoutUrl?: string | null;
      nightscoutSecret?: string | null;
      timezone?: string;
      displayName?: string;
      runDays?: number[];
      onboardingComplete?: boolean;
      plannerIntent?: "start" | "update";
    };
  } catch {
    return NextResponse.json({ error: "Invalid or empty request body" }, { status: 400 });
  }

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

  // Pick only client-writable fields (WRITABLE_SETTINGS_KEYS is the single source of truth)
  const allowed: Partial<UserSettings> = {};
  for (const key of WRITABLE_SETTINGS_KEYS) {
    if (body[key] !== undefined) {
      Object.assign(allowed, { [key]: body[key] });
    }
  }

  const plannerChangeRequested = PLANNER_CONFIG_KEYS.some((key) => body[key] !== undefined);
  const rawPlannerIntent = (body as { plannerIntent?: unknown }).plannerIntent;
  if (rawPlannerIntent !== undefined && rawPlannerIntent !== "start" && rawPlannerIntent !== "update") {
    return NextResponse.json(
      { error: "Planner intent is invalid", code: "PLANNER_CONFIG_INVALID" },
      { status: 400 },
    );
  }
  const plannerIntent = rawPlannerIntent ?? "update";
  let incompletePlannerFields: readonly (keyof typeof body)[] = [];
  if (plannerChangeRequested) {
    const currentSettings = await getUserSettings(email);
    const mergedSettings = { ...currentSettings, ...allowed };
    const currentConfig = plannerConfigFromSettings(mergedSettings);
    if (!currentConfig) {
      incompletePlannerFields = REQUIRED_PLANNER_CONFIG_KEYS.filter(
        (key) => mergedSettings[key] == null,
      );
      if (incompletePlannerFields.length === 0) {
        return NextResponse.json(
          {
            error: "Planner config is invalid",
            code: "PLANNER_CONFIG_INVALID",
          },
          { status: 400 },
        );
      }
      await saveUserSettings(email, allowed);
    } else {
      const effectiveTimezone = body.timezone ?? currentSettings.timezone ?? "Europe/Stockholm";
      const metadata = await getPlannerMetadata(email);
      const resolution = resolvePlannerConfig(
        currentConfig,
        plannerIntent,
        metadata.generatedPlanConfig,
        new Date(),
        effectiveTimezone,
      );
      const normalizedConfig = resolution.config;
      let hrContext: { lthr?: number; hrZones?: number[] } | undefined;
      if (normalizedConfig.effortMetric === "hr") {
        const credentials = await getUserCredentials(email);
        const intervalsApiKey = "intervalsApiKey" in body
          ? body.intervalsApiKey
          : credentials?.intervalsApiKey;
        if (!intervalsApiKey) {
          return NextResponse.json(
            {
              error: "Heart-rate zones are required for heart-rate workouts.",
              code: "PLANNER_CONFIG_INVALID",
              fields: { effortMetric: "Connect Intervals.icu with a running threshold first." },
            },
            { status: 400 },
          );
        }
        try {
          const profile = await fetchAthleteProfile(intervalsApiKey, { strict: true });
          hrContext = {
            lthr: profile.lthr,
            hrZones: profile.hrZones?.length === 5
              ? profile.hrZones
              : computeMaxHRZones(profile.maxHr ?? DEFAULT_MAX_HR),
          };
        } catch {
          return NextResponse.json(
            { error: "Failed to fetch athlete profile", code: "INTERVALS_UPSTREAM_ERROR" },
            { status: 502 },
          );
        }
      }
      const validation = validatePlannerConfig(
        normalizedConfig,
        new Date(),
        effectiveTimezone,
        hrContext,
        { allowShortTimeline: resolution.anchored },
      );
      if (Object.keys(validation.fields).length > 0) {
        const error = new PlannerError(
          "PLANNER_CONFIG_INVALID",
          "Planner config is invalid",
          validation.fields,
        );
        return NextResponse.json(
          { error: error.message, code: error.code, fields: error.fields },
          { status: 400 },
        );
      }
      for (const key of PLANNER_CONFIG_KEYS) {
        Object.assign(allowed, { [key]: normalizedConfig[key] });
      }
      if (body.raceName !== undefined) allowed.raceName = normalizedConfig.raceName;

      await saveUserSettings(email, allowed);
    }
  } else if (Object.keys(allowed).length > 0) {
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

  return NextResponse.json({
    ok: true,
    ...(incompletePlannerFields.length > 0 && { incompletePlannerFields }),
  });
}
