import { NextResponse } from "next/server";
import { ensureUserSettings } from "@/lib/auth";
import { signMobileToken, verifyGoogleIdToken } from "@/lib/mobileAuth";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const idToken =
    typeof body === "object" &&
    body !== null &&
    "idToken" in body &&
    typeof (body as { idToken: unknown }).idToken === "string"
      ? (body as { idToken: string }).idToken
      : null;

  if (!idToken) {
    return NextResponse.json({ error: "idToken required" }, { status: 400 });
  }

  try {
    const { email } = await verifyGoogleIdToken(idToken);
    await ensureUserSettings(email);
    const { token, expiresAt } = await signMobileToken(email);
    return NextResponse.json({ token, expiresAt, user: { email } });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
