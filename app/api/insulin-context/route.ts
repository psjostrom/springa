import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { NextResponse } from "next/server";

/**
 * GET /api/insulin-context — Returns null.
 *
 * MyLife scraper has been removed. Insulin context (IOB, last bolus, etc.)
 * is no longer available. This route is preserved for backward compatibility
 * but always returns null.
 */
export async function GET() {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  return NextResponse.json(null);
}
