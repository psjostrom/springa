import { NextResponse } from "next/server";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { saveUserSettings } from "@/lib/settings";

export async function POST(req: Request) {
  let email: string;
  try {
    email = await requireAuth({ headerList: req.headers });
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  try {
    await saveUserSettings(email, {
      paceSuggestionDismissedAt: Date.now(),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[pace-suggestion/dismiss]", err);
    return NextResponse.json({ error: "Failed to dismiss pace suggestion" }, { status: 500 });
  }
}
