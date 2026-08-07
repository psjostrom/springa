import { NextResponse } from "next/server";
import { ensureUserSettings } from "@/lib/ensureUserSettings";
import { signMobileToken } from "@/lib/mobileAuth";
import {
  getQaAuthEmail,
  isLocalQaAllowed,
  verifyQaToken,
} from "@/lib/qaAuth";

/**
 * Dev-only: exchange QA_AUTH_TOKEN for a native mobile Bearer JWT.
 * POST /api/qa/mobile  { "token": "..." }
 *
 * 404 when QA auth is not allowed (production / missing env).
 * 401 when token is wrong.
 */
export async function POST(req: Request) {
  if (!isLocalQaAllowed()) {
    return new NextResponse("Not Found", { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token =
    typeof body === "object" &&
    body !== null &&
    "token" in body &&
    typeof (body as { token: unknown }).token === "string"
      ? (body as { token: string }).token
      : null;

  if (!verifyQaToken(token)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const email = getQaAuthEmail();
  if (!email) {
    return new NextResponse("Not Found", { status: 404 });
  }

  try {
    await ensureUserSettings(email);
    const { token: mobileToken, expiresAt } = await signMobileToken(email);
    return NextResponse.json({
      token: mobileToken,
      expiresAt,
      user: { email },
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
