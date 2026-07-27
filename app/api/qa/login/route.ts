import { signIn } from "@/lib/auth";
import { isLocalQaAllowed, verifyQaToken } from "@/lib/qaAuth";
import { NextResponse } from "next/server";

/**
 * Dev-only: exchange QA_AUTH_TOKEN for a normal Auth.js session.
 * GET /api/qa/login?token=...&redirectTo=/
 *
 * 404 when QA auth is not allowed (production / missing env).
 */
export async function GET(request: Request) {
  if (!isLocalQaAllowed()) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!verifyQaToken(token)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const redirectTo = url.searchParams.get("redirectTo") ?? "/";
  // Safe relative redirects only
  const safeRedirect =
    redirectTo.startsWith("/") && !redirectTo.startsWith("//")
      ? redirectTo
      : "/";

  await signIn("qa", { token, redirectTo: safeRedirect });
}
