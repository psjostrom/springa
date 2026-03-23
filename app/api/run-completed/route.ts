import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/apiHelpers";
import { validateApiSecretFromDB } from "@/lib/credentials";
import { sendPushToUser } from "@/lib/push";

export async function POST(req: Request) {
  const email = await validateApiSecretFromDB(req.headers.get("api-secret"));
  if (!email) return unauthorized();

  try { await req.json(); } catch { /* tolerate missing/malformed body */ }

  try {
    await sendPushToUser(email, {
      title: "\uD83C\uDFC3 Run complete!",
      body: "How was it?",
      url: "/feedback",
      ts: Date.now(),
    });
  } catch (err) {
    console.warn("[run-completed] push failed:", err);
  }

  return NextResponse.json({ ok: true });
}
