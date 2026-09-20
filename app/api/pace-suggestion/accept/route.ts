import { NextResponse } from "next/server";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { saveUserSettings } from "@/lib/settings";
import { fetchAthleteProfile, updateThresholdPace, updatePaceZones } from "@/lib/intervalsApi";
import { getThresholdPace } from "@/lib/paceTable";

export async function POST(req: Request) {
  let email: string;
  try {
    email = await requireAuth({ headerList: req.headers });
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const body = (rawBody && typeof rawBody === "object" ? rawBody : {}) as {
    suggestedAbilitySecs?: number;
    currentAbilityDist?: number;
  };

  if (!body.suggestedAbilitySecs || !body.currentAbilityDist) {
    return NextResponse.json({ error: "Missing suggestedAbilitySecs or currentAbilityDist" }, { status: 400 });
  }

  try {
    await saveUserSettings(email, {
      currentAbilitySecs: body.suggestedAbilitySecs,
      paceSuggestionDismissedAt: Date.now(),
    });

    const newThreshold = getThresholdPace(body.currentAbilityDist, body.suggestedAbilitySecs);
    if (newThreshold) {
      const creds = await getUserCredentials(email);
      if (creds?.intervalsApiKey) {
        const profile = await fetchAthleteProfile(creds.intervalsApiKey);
        if (profile.sportSettingsId) {
          try {
            await updateThresholdPace(creds.intervalsApiKey, profile.sportSettingsId, newThreshold);
            await updatePaceZones(creds.intervalsApiKey, profile.sportSettingsId);
          } catch (err) {
            console.error("[pace-suggestion/accept] Failed to update intervals threshold pace:", err);
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[pace-suggestion/accept]", err);
    return NextResponse.json({ error: "Failed to accept pace suggestion" }, { status: 500 });
  }
}
