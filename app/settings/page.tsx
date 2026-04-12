import { redirect } from "next/navigation";
import { requireAuth, AuthError } from "@/lib/apiHelpers";
import { getUserSettings } from "@/lib/settings";
import { getUserCredentials } from "@/lib/credentials";
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

  // Check connection status from credentials (no external API call)
  const creds = await getUserCredentials(email);
  if (creds?.intervalsApiKey) {
    settings.intervalsConnected = true;
  }
  if (creds?.nightscoutUrl) {
    settings.nightscoutUrl = creds.nightscoutUrl;
  }

  return <SettingsPage email={email} initialSettings={settings} />;
}
