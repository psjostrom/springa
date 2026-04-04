import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { fetchBGFromNS, validateNSConnection } from "@/lib/nightscout";
import { NextResponse } from "next/server";

/**
 * POST /api/settings/validate-ns
 * Tests a Nightscout connection without persisting credentials.
 */
export async function POST(req: Request) {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const body = (await req.json()) as {
    nightscoutUrl?: string;
    nightscoutSecret?: string;
  };

  if (!body.nightscoutUrl || !body.nightscoutSecret) {
    return NextResponse.json(
      { error: "Both URL and API secret are required" },
      { status: 400 },
    );
  }

  // First validate the URL is reachable via the public status endpoint
  const validation = await validateNSConnection(body.nightscoutUrl);
  if (!validation.valid) {
    return NextResponse.json(
      { valid: false, error: validation.error || "Failed to connect to Nightscout server" },
      { status: 200 },
    );
  }

  // Then test the secret with an authenticated fetch
  try {
    await fetchBGFromNS(body.nightscoutUrl, body.nightscoutSecret, { count: 1 });
    return NextResponse.json({ valid: true, name: validation.name });
  } catch (err) {
    return NextResponse.json({
      valid: false,
      error: err instanceof Error ? err.message : "Authentication failed",
    });
  }
}
