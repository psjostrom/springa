import { NextResponse } from "next/server";
import {
  lookupXdripUser,
  getXdripReadings,
  saveXdripReadings,
  monthKey,
} from "@/lib/xdripDb";
import { parseNightscoutEntries, recomputeDirections } from "@/lib/xdrip";

export async function POST(req: Request) {
  const apiSecret = req.headers.get("api-secret");
  if (!apiSecret) {
    return NextResponse.json({ error: "Missing api-secret" }, { status: 401 });
  }

  const email = await lookupXdripUser(apiSecret);
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await req.json();
  const newReadings = parseNightscoutEntries(body);
  if (newReadings.length === 0) {
    return NextResponse.json({ ok: true, count: 0 });
  }

  // Determine which monthly shards are affected
  const affectedMonths = [...new Set(newReadings.map((r) => monthKey(r.ts)))];

  // Read existing data for affected shards only
  const existing = await getXdripReadings(email, affectedMonths);

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
    await saveXdripReadings(email, toWrite);
  }

  return NextResponse.json({ ok: true, count: newReadings.length });
}
