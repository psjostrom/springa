import { NextResponse } from "next/server";
import { lookupXdripUser, sha1 } from "@/lib/xdripDb";
import { sendPushToUser } from "@/lib/push";

export async function POST(req: Request) {
  const apiSecret = req.headers.get("api-secret");
  if (!apiSecret) {
    return NextResponse.json({ error: "Missing api-secret" }, { status: 401 });
  }

  // SugarRun sends the raw secret; hash it for lookup
  const hash = sha1(apiSecret);
  const email = await lookupXdripUser(hash);
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Consume body (SugarRun sends empty JSON)
  await req.json();

  const ts = Date.now();
  await sendPushToUser(email, {
    title: "\uD83C\uDFC3 Run complete!",
    body: "How was it?",
    url: `/feedback?ts=${ts}`,
    ts,
  });

  return NextResponse.json({ ok: true, ts });
}
