import { auth } from "@/lib/auth";
import {
  getUserSettings,
  saveUserSettings,
  clearGlookoCredentials,
  type UserSettings,
} from "@/lib/settings";
import { fetchAthleteProfile } from "@/lib/intervalsApi";
import { saveXdripAuth } from "@/lib/xdripDb";
import { signIn as glookoSignIn, clearSession as clearGlookoSession } from "@/lib/glooko";
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

  // Don't send Glooko password to the client — just indicate if it's configured
  const response: Record<string, unknown> = { ...settings };
  delete response.glookoPassword;
  response.glookoConnected = !!(settings.glookoEmail && settings.glookoPassword);

  return NextResponse.json(response);
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

  // Handle Glooko disconnect: empty email means clear both fields
  if ("glookoEmail" in body && !body.glookoEmail) {
    await clearGlookoCredentials(session.user.email);
    clearGlookoSession(body.glookoEmail ?? "");
    delete body.glookoEmail;
    delete body.glookoPassword;
  }

  // Verify Glooko credentials before saving
  let glookoError: string | undefined;
  if (body.glookoEmail && body.glookoPassword) {
    try {
      await glookoSignIn(body.glookoEmail, body.glookoPassword);
    } catch (err: unknown) {
      glookoError = err instanceof Error ? err.message : "Glooko sign-in failed";
      clearGlookoSession(body.glookoEmail);
      // Don't save invalid credentials
      delete body.glookoEmail;
      delete body.glookoPassword;
    }
  }

  if (Object.keys(body).length > 0) {
    await saveUserSettings(session.user.email, body);
  }

  const result: Record<string, unknown> = { ok: true };
  if (glookoError) result.glookoError = glookoError;
  return NextResponse.json(result);
}
