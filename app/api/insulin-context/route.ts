import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { getUserSettings } from "@/lib/settings";
import { fetchIOB, tauForInsulin } from "@/lib/iob";
import { NextResponse } from "next/server";

export async function GET() {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const creds = await getUserCredentials(email);
  if (!creds?.nightscoutUrl || !creds.nightscoutSecret) {
    return NextResponse.json(null);
  }

  const settings = await getUserSettings(email);
  const tau = tauForInsulin(settings.insulinType);

  try {
    const iob = await fetchIOB(creds.nightscoutUrl, creds.nightscoutSecret, tau);
    return NextResponse.json({ iob });
  } catch (err) {
    console.error("[insulin-context] Failed to compute IOB:", err);
    return NextResponse.json(null);
  }
}
