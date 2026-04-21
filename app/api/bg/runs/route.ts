import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { fetchBGFromNS } from "@/lib/nightscout";
import { NextResponse } from "next/server";
import type { BGReading } from "@/lib/cgm";

interface RunWindow {
  activityId: string;
  start: number;
  end: number;
}

const PADDING_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const body = (await request.json()) as { windows?: RunWindow[] };
  const windows = body.windows;

  if (!Array.isArray(windows) || windows.length === 0) {
    return NextResponse.json(
      { error: "Missing or empty windows array" },
      { status: 400 },
    );
  }

  const creds = await getUserCredentials(email);
  if (!creds?.nightscoutUrl || !creds.nightscoutSecret) {
    return NextResponse.json({ readings: {} });
  }

  try {
    const minStart = Math.min(...windows.map((w) => w.start));
    const maxEnd = Math.max(...windows.map((w) => w.end));

    const allReadings = await fetchBGFromNS(
      creds.nightscoutUrl,
      creds.nightscoutSecret,
      {
        since: minStart - PADDING_MS,
        until: maxEnd + PADDING_MS,
        count: 50000,
      },
    );

    allReadings.sort((a, b) => a.ts - b.ts);

    const result: Record<string, BGReading[]> = {};
    for (const w of windows) {
      const windowStart = w.start - PADDING_MS;
      const windowEnd = w.end + PADDING_MS;
      result[w.activityId] = allReadings.filter(
        (r) => r.ts >= windowStart && r.ts <= windowEnd,
      );
    }

    return NextResponse.json({ readings: result });
  } catch (err) {
    console.error("[bg/runs] Failed to fetch from Nightscout:", err);
    return NextResponse.json({ readings: {} });
  }
}
