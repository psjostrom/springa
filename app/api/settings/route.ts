import { auth } from "@/lib/auth";
import {
  getUserSettings,
  saveUserSettings,
  shouldSyncProfile,
  markProfileSynced,
  type UserSettings,
} from "@/lib/settings";
import { fetchAthleteProfile } from "@/lib/intervalsApi";
import { saveXdripAuth } from "@/lib/xdripDb";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getUserSettings(session.user.email);

  // Auto-sync athlete profile from Intervals.icu (at most once per 24h)
  if (settings.intervalsApiKey) {
    try {
      const needsSync = await shouldSyncProfile(session.user.email);
      if (needsSync) {
        const profile = await fetchAthleteProfile(settings.intervalsApiKey);
        const updates: Partial<UserSettings> = {};
        if (profile.lthr && profile.lthr !== settings.lthr) updates.lthr = profile.lthr;
        if (profile.maxHr && profile.maxHr !== settings.maxHr) updates.maxHr = profile.maxHr;
        if (profile.hrZones && JSON.stringify(profile.hrZones) !== JSON.stringify(settings.hrZones)) updates.hrZones = profile.hrZones;
        if (Object.keys(updates).length > 0) {
          await saveUserSettings(session.user.email, updates);
          Object.assign(settings, updates);
        }
        await markProfileSynced(session.user.email);
      }
    } catch {
      // Intervals.icu unavailable — serve cached settings
    }
  }

  return NextResponse.json(settings);
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Partial<UserSettings>;

  // xDrip secret needs special handling for reverse auth mapping
  if (body.xdripSecret) {
    await saveXdripAuth(session.user.email, body.xdripSecret);
    delete body.xdripSecret;
  }

  if (Object.keys(body).length > 0) {
    await saveUserSettings(session.user.email, body);
  }

  return NextResponse.json({ ok: true });
}
