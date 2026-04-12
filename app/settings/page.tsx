import { redirect } from "next/navigation";
import { requireAuth, AuthError } from "@/lib/apiHelpers";
import { getUserSettings } from "@/lib/settings";
import { getUserCredentials } from "@/lib/credentials";
import { fetchAthleteProfile } from "@/lib/intervalsApi";
import { computeMaxHRZones, DEFAULT_MAX_HR } from "@/lib/constants";
import { SettingsPage } from "./SettingsPage";

export default async function Settings() {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) redirect("/api/auth/signin");
    throw e;
  }

  const settings = await getUserSettings(email);
  if (!settings.onboardingComplete) redirect("/setup");

  const creds = await getUserCredentials(email);
  if (creds?.intervalsApiKey) {
    settings.intervalsConnected = true;
    try {
      const profile = await fetchAthleteProfile(creds.intervalsApiKey);
      const maxHr = profile.maxHr ?? DEFAULT_MAX_HR;
      settings.maxHr = maxHr;
      settings.hrZones = computeMaxHRZones(maxHr);
      if (profile.lthr) settings.lthr = profile.lthr;
      if (profile.restingHr) settings.restingHr = profile.restingHr;
      if (profile.sportSettingsId) settings.sportSettingsId = profile.sportSettingsId;
    } catch {
      // proceed without
    }
  }

  if (creds?.nightscoutUrl) {
    settings.nightscoutUrl = creds.nightscoutUrl;
  }

  return <SettingsPage email={email} initialSettings={settings} />;
}
