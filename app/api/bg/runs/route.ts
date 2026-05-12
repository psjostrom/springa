import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { fetchBGBatchFromNS } from "@/lib/nightscout";
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

  // Build per-window batch input. Padded by PADDING_MS on each side so
  // alignment can use the closest reading even when the run starts/ends
  // between two CGM samples.
  const padded = windows.map((w) => ({
    activityId: w.activityId,
    windowStart: w.start - PADDING_MS,
    windowEnd: w.end + PADDING_MS,
  }));

  let trimmed: { ts: number; mmol: number }[] = [];
  try {
    trimmed = await fetchBGBatchFromNS(
      creds.nightscoutUrl,
      creds.nightscoutSecret,
      padded.map((w) => ({ since: w.windowStart, until: w.windowEnd })),
    );
  } catch (err) {
    console.error("[bg/runs] Scout batch fetch failed:", err);
    return NextResponse.json({ readings: {} });
  }

  // Hydrate trimmed payload (`ts`+`mmol`) back into BGReading shape. The
  // sgv/direction/delta fields aren't read by `useStreamCache` consumers
  // (alignment only needs ts and mmol), but the type contract requires them.
  const allReadings: BGReading[] = trimmed.map((r) => ({
    sgv: 0,
    mmol: r.mmol,
    ts: r.ts,
    direction: "NONE",
    delta: 0,
  }));
  allReadings.sort((a, b) => a.ts - b.ts);

  const result: Record<string, BGReading[]> = {};
  for (const w of padded) {
    result[w.activityId] = allReadings.filter(
      (r) => r.ts >= w.windowStart && r.ts <= w.windowEnd,
    );
  }

  return NextResponse.json({ readings: result });
}
