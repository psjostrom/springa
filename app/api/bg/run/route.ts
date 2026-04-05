import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { fetchBGFromNS } from "@/lib/nightscout";
import { NextResponse } from "next/server";

/**
 * GET /api/bg/run — Fetch BG readings for a run window from Nightscout.
 * Query params: start (ms), end (ms)
 */
export async function GET(request: Request) {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const { searchParams } = new URL(request.url);
  const startMs = searchParams.get("start");
  const endMs = searchParams.get("end");

  if (!startMs || !endMs) {
    return NextResponse.json(
      { error: "Missing start or end parameter" },
      { status: 400 },
    );
  }

  const start = parseInt(startMs, 10);
  const end = parseInt(endMs, 10);

  if (isNaN(start) || isNaN(end) || start >= end) {
    return NextResponse.json(
      { error: "Invalid start or end parameter" },
      { status: 400 },
    );
  }

  const creds = await getUserCredentials(email);
  if (!creds?.nightscoutUrl || !creds.nightscoutSecret) {
    return NextResponse.json({ readings: [] });
  }

  try {
    // Add 10-min padding for interpolation at boundaries
    const PADDING_MS = 10 * 60 * 1000;
    const readings = await fetchBGFromNS(creds.nightscoutUrl, creds.nightscoutSecret, {
      since: start - PADDING_MS,
      until: end + PADDING_MS,
    });

    return NextResponse.json({ readings });
  } catch (err) {
    console.error("[bg/run] Failed to fetch from Nightscout:", err);
    return NextResponse.json({ readings: [] });
  }
}
