import { NextResponse } from "next/server";
import { lookupXdripUser, saveRunFeedback, sha1 } from "@/lib/settings";
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

  const body = await req.json();
  const distance = body.distance as number | undefined;
  const duration = body.duration as number | undefined;
  const avgHr = body.avgHr as number | undefined;

  const createdAt = Date.now();
  await saveRunFeedback(email, { createdAt, distance, duration, avgHr });

  // Build notification body
  const parts: string[] = [];
  if (distance != null) {
    parts.push((distance / 1000).toFixed(1) + " km");
  }
  if (duration != null) {
    const totalSec = Math.round(duration / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    parts.push(min + ":" + String(sec).padStart(2, "0"));
  }
  if (avgHr != null) {
    parts.push("\u2764\uFE0F " + Math.round(avgHr));
  }

  await sendPushToUser(email, {
    title: "How was the run?",
    body: parts.join(" \u2022 ") || "Run complete!",
    url: "/feedback?ts=" + createdAt,
    ts: createdAt,
  });

  return NextResponse.json({ ok: true, ts: createdAt });
}
