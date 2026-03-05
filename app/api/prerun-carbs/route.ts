import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");

  if (!eventId) {
    return NextResponse.json({ error: "Missing eventId" }, { status: 400 });
  }

  const result = await db().execute({
    sql: "SELECT carbs_g, minutes_before FROM prerun_carbs WHERE email = ? AND event_id = ?",
    args: [session.user.email, eventId],
  });

  if (result.rows.length === 0) {
    return NextResponse.json({ carbsG: null, minutesBefore: null });
  }

  const row = result.rows[0];
  return NextResponse.json({
    carbsG: row.carbs_g as number | null,
    minutesBefore: row.minutes_before as number | null,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    eventId: string;
    carbsG?: number | null;
    minutesBefore?: number | null;
  };

  const { eventId, carbsG, minutesBefore } = body;

  if (!eventId) {
    return NextResponse.json({ error: "Missing eventId" }, { status: 400 });
  }

  await db().execute({
    sql: `INSERT INTO prerun_carbs (email, event_id, carbs_g, minutes_before, created_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (email, event_id) DO UPDATE SET
            carbs_g = excluded.carbs_g,
            minutes_before = excluded.minutes_before,
            created_at = excluded.created_at`,
    args: [session.user.email, eventId, carbsG ?? null, minutesBefore ?? null, Date.now()],
  });

  return NextResponse.json({ ok: true });
}
