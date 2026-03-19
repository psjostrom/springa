import { NextRequest, NextResponse } from "next/server";
import { validateApiSecret, unauthorized } from "@/lib/apiHelpers";
import {
  getBGReadings,
  saveBGReadings,
  monthKey,
} from "@/lib/bgDb";
import { db } from "@/lib/db";
import { parseNightscoutEntries, recomputeDirections } from "@/lib/cgm";

async function getEmail(): Promise<string | null> {
  const result = await db().execute({ sql: "SELECT email FROM user_settings LIMIT 1", args: [] });
  const email = result.rows[0]?.email;
  return typeof email === "string" ? email : null;
}

export async function GET(req: NextRequest) {
  if (!validateApiSecret(req.headers.get("api-secret"))) {
    return unauthorized();
  }

  const email = await getEmail();
  if (!email) {
    return NextResponse.json({ error: "No user configured" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const since = Number(params.get("find[date][$gt]") ?? "0");
  const count = Math.min(Number(params.get("count") ?? "2016"), 10000);

  // Determine which monthly shards to read
  const now = Date.now();
  const startTs = since > 0 ? since : now - 30 * 24 * 60 * 60 * 1000;
  const months = new Set<string>();
  let cursor = startTs;
  while (cursor <= now) {
    months.add(monthKey(cursor));
    cursor += 28 * 24 * 60 * 60 * 1000;
  }
  months.add(monthKey(now));

  const readings = await getBGReadings(email, [...months]);
  const filtered = readings
    .filter((r) => r.ts > since)
    .slice(0, count);

  const entries = filtered.map((r) => ({
    sgv: r.sgv,
    date: r.ts,
    dateString: new Date(r.ts).toISOString(),
    direction: r.direction,
    type: "sgv" as const,
    device: "Springa",
  }));

  return NextResponse.json(entries);
}

export async function POST(req: Request) {
  if (!validateApiSecret(req.headers.get("api-secret"))) {
    return unauthorized();
  }

  const email = await getEmail();
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
