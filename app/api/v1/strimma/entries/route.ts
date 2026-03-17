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

  // Get the single user's email for DB operations
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

  // Determine which monthly shards are affected
  const affectedMonths = [...new Set(newReadings.map((r) => monthKey(r.ts)))];

  // Read existing data for affected shards only
  const existing = await getStrimmaReadings(email, affectedMonths);

  // Snapshot existing directions so we can diff after recompute
  const existingDir = new Map(existing.map((r) => [r.ts, r.direction]));

  // Deduplicate by timestamp — existing readings win (first in merged array)
  const merged = [...existing, ...newReadings];
  const seen = new Set<number>();
  const deduped = merged.filter((r) => {
    if (seen.has(r.ts)) return false;
    seen.add(r.ts);
    return true;
  });

  // Sort chronologically for direction computation
  deduped.sort((a, b) => a.ts - b.ts);

  // Recompute direction from sgv values — Strimma sends correct directions
  // but we recompute server-side as a safety net (belt and suspenders).
  // Any disagreement between Strimma's direction and Springa's recomputation
  // is a bug to investigate.
  recomputeDirections(deduped);

  // Only write readings that are new or whose direction changed
  const toWrite = deduped.filter((r) => {
    const prev = existingDir.get(r.ts);
    return prev === undefined || prev !== r.direction;
  });

  if (toWrite.length > 0) {
    await saveStrimmaReadings(email, toWrite);
  }

  return NextResponse.json({ ok: true, count: newReadings.length });
}
