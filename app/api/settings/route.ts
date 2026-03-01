import { auth } from "@/lib/auth";
import {
  getUserSettings,
  saveUserSettings,
  clearMyLifeCredentials,
  type UserSettings,
} from "@/lib/settings";
import { fetchAthleteProfile } from "@/lib/intervalsApi";
import { saveXdripAuth } from "@/lib/xdripDb";
import { signIn as mylifeSignIn, clearSession as clearMyLifeSession } from "@/lib/mylife";
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

  // Don't send MyLife password to the client — just indicate if it's configured
  const response: Record<string, unknown> = { ...settings };
  delete response.mylifePassword;
  response.mylifeConnected = !!(settings.mylifeEmail && settings.mylifePassword);

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

  // Handle MyLife disconnect: empty email means clear both fields
  if ("mylifeEmail" in body && !body.mylifeEmail) {
    // Read current email to clear the correct cached session
    const current = await getUserSettings(session.user.email);
    if (current.mylifeEmail) {
      clearMyLifeSession(current.mylifeEmail);
    }
    await clearMyLifeCredentials(session.user.email);
    delete body.mylifeEmail;
    delete body.mylifePassword;
  }

  // Verify MyLife credentials before saving
  let mylifeError: string | undefined;
  if (body.mylifeEmail && body.mylifePassword) {
    try {
      await mylifeSignIn(body.mylifeEmail, body.mylifePassword);
    } catch (err: unknown) {
      mylifeError = err instanceof Error ? err.message : "MyLife sign-in failed";
      clearMyLifeSession(body.mylifeEmail);
      // Don't save invalid credentials
      delete body.mylifeEmail;
      delete body.mylifePassword;
    }
  }

  if (Object.keys(body).length > 0) {
    await saveUserSettings(session.user.email, body);
  }

  const result: Record<string, unknown> = { ok: true };
  if (mylifeError) result.mylifeError = mylifeError;
  return NextResponse.json(result);
}
