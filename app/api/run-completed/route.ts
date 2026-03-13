import { NextResponse } from "next/server";
import { validateXdripSecret, unauthorized } from "@/lib/apiHelpers";
import { db } from "@/lib/db";
import { sendPushToUser } from "@/lib/push";

export async function POST(req: Request) {
  if (!validateXdripSecret(req.headers.get("api-secret"))) {
    return unauthorized();
  }

  const result = await db().execute({ sql: "SELECT email FROM user_settings LIMIT 1", args: [] });
  const email = result.rows[0]?.email as string;
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
