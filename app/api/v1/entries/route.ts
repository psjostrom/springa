import { NextResponse } from "next/server";
import { validateApiSecret, unauthorized } from "@/lib/apiHelpers";
import {
  getBGReadings,
  saveBGReadings,
  monthKey,
} from "@/lib/bgDb";
import { db } from "@/lib/db";
import { parseNightscoutEntries, recomputeDirections } from "@/lib/cgm";

export async function POST(req: Request) {
  if (!validateApiSecret(req.headers.get("api-secret"))) {
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
  const existing = await getBGReadings(email, affectedMonths);

  // Snapshot existing directions so we can diff after recompute
  const existingDir = new Map(existing.map((r) => [r.ts, r.direction]));

  const merged = [...existing, ...newReadings];

  // Deduplicate by timestamp
  const seen = new Set<number>();
  const deduped = merged.filter((r) => {
    if (seen.has(r.ts)) return false;
    seen.add(r.ts);
    return true;
  });

  // Sort chronologically
  deduped.sort((a, b) => a.ts - b.ts);

  // Recompute direction from sgv values — xDrip+ companion mode
  // returns stale/wrong direction fields (issue #3787)
  recomputeDirections(deduped);

  // Only write readings that are new or whose direction changed
  const toWrite = deduped.filter((r) => {
    const prev = existingDir.get(r.ts);
    return prev === undefined || prev !== r.direction;
  });

  if (toWrite.length > 0) {
    await saveBGReadings(email, toWrite);
  }

  return NextResponse.json({ ok: true, count: newReadings.length });
}
