import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");

  if (!eventId) {
    return NextResponse.json({ error: "Missing eventId" }, { status: 400 });
  }

  const result = await db().execute({
    sql: "SELECT carbs_g FROM prerun_carbs WHERE email = ? AND event_id = ?",
    args: [email, eventId],
  });

  if (result.rows.length === 0) {
    return NextResponse.json({ carbsG: null });
  }

  return NextResponse.json({
    carbsG: result.rows[0].carbs_g as number | null,
  });
}

export async function POST(req: Request) {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const body = (await req.json()) as {
    eventId: string;
    carbsG?: number | null;
  };

  const { eventId, carbsG } = body;

  if (!eventId) {
    return NextResponse.json({ error: "Missing eventId" }, { status: 400 });
  }

  await db().execute({
    sql: `INSERT INTO prerun_carbs (email, event_id, carbs_g, created_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (email, event_id) DO UPDATE SET
            carbs_g = excluded.carbs_g,
            created_at = excluded.created_at`,
    args: [email, eventId, carbsG ?? null, Date.now()],
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");

  if (!eventId) {
    return NextResponse.json({ error: "Missing eventId" }, { status: 400 });
  }

  await db().execute({
    sql: "DELETE FROM prerun_carbs WHERE email = ? AND event_id = ?",
    args: [email, eventId],
  });

  return NextResponse.json({ ok: true });
}
