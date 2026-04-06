import { NextResponse } from "next/server";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { fetchConnectionStatus } from "@/lib/intervalsApi";

export async function GET() {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const creds = await getUserCredentials(email);
  if (!creds?.intervalsApiKey) {
    return NextResponse.json({ error: "No Intervals.icu API key configured" }, { status: 400 });
  }

  const status = await fetchConnectionStatus(creds.intervalsApiKey);
  return NextResponse.json(status);
}
