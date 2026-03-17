import { NextResponse } from "next/server";
import { validateXdripSecret, unauthorized } from "@/lib/apiHelpers";
import {
  getStrimmaReadings,
  saveStrimmaReadings,
  monthKey,
} from "@/lib/xdripDb";
import { db } from "@/lib/db";
import { parseNightscoutEntries, recomputeDirections } from "@/lib/xdrip";

export async function POST(req: Request) {
  if (!validateXdripSecret(req.headers.get("api-secret"))) {
    return unauthorized();
  }

  const result = await db().execute({ sql: "SELECT email FROM user_settings LIMIT 1", args: [] });
  const email = result.rows[0]?.email as string;
  if (!email) {
    return NextResponse.json({ error: "No user configured" }, { status: 401 });
  }

  const body: unknown = await req.json();
  const newReadings = parseNightscoutEntries(body);
  if (newReadings.length === 0) {
    return NextResponse.json({ ok: true, count: 0 });
  }

  const affectedMonths = [...new Set(newReadings.map((r) => monthKey(r.ts)))];
  const existing = await getStrimmaReadings(email, affectedMonths);

  const existingDir = new Map(existing.map((r) => [r.ts, r.direction]));

  const merged = [...existing, ...newReadings];
  const seen = new Set<number>();
  const deduped = merged.filter((r) => {
    if (seen.has(r.ts)) return false;
    seen.add(r.ts);
    return true;
  });

  deduped.sort((a, b) => a.ts - b.ts);
  recomputeDirections(deduped);

  const toWrite = deduped.filter((r) => {
    const prev = existingDir.get(r.ts);
    return prev === undefined || prev !== r.direction;
  });

  if (toWrite.length > 0) {
    await saveStrimmaReadings(email, toWrite);
  }

  return NextResponse.json({ ok: true, count: newReadings.length });
}
