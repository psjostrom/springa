import { NextResponse } from "next/server";
import { sha1 } from "@/lib/xdripDb";
import { db } from "@/lib/db";
import { sendPushToUser } from "@/lib/push";

export async function POST(req: Request) {
  const apiSecret = req.headers.get("api-secret");
  if (!apiSecret) {
    return NextResponse.json({ error: "Missing api-secret" }, { status: 401 });
  }

  // SugarRun sends the raw secret; hash both for comparison
  if (!process.env.XDRIP_SECRET || sha1(apiSecret) !== sha1(process.env.XDRIP_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get the single user's email for DB operations
  const result = await db().execute({ sql: "SELECT email FROM user_settings LIMIT 1", args: [] });
  const email = result.rows[0]?.email as string;
  if (!email) {
    return NextResponse.json({ error: "No user configured" }, { status: 401 });
  }

  // Consume body (SugarRun sends empty JSON)
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
