import { NextResponse } from "next/server";
import { validateApiSecret, unauthorized, getEmail } from "@/lib/apiHelpers";
import {
  getBGReadings,
  saveBGReadings,
  monthKey,
} from "@/lib/bgDb";
import { parseNightscoutEntries, recomputeDirections } from "@/lib/cgm";
import { db } from "@/lib/db";

/**
 * GET /api/v1/entries — Nightscout-compatible entries endpoint.
 *
 * Query params (all optional):
 *   count              — max entries to return (default 24, max 10000)
 *   find[date][$gt]    — entries after timestamp (ms, exclusive)
 *   find[date][$gte]   — entries at or after timestamp (ms, inclusive)
 *   find[date][$lt]    — entries before timestamp (ms, exclusive)
 *   find[date][$lte]   — entries at or before timestamp (ms, inclusive)
 *   find[type]         — filter by type (only "sgv" stored)
 *   find[sgv][$gte]    — SGV >= value
 *   find[sgv][$lte]    — SGV <= value
 */
export async function GET(req: Request) {
  if (!validateApiSecret(req.headers.get("api-secret"))) {
    return unauthorized();
  }

  const email = await getEmail();
  if (!email) {
    return NextResponse.json({ error: "No user configured" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const count = Math.min(
    Math.max(parseInt(params.get("count") ?? "24", 10) || 24, 1),
    10000,
  );

  // Date filters — null means not provided
  const hasDateGt = params.has("find[date][$gt]");
  const hasDateGte = params.has("find[date][$gte]");
  const dateGt = hasDateGt ? Number(params.get("find[date][$gt]")) : null;
  const dateGte = hasDateGte ? Number(params.get("find[date][$gte]")) : null;
  const dateLt = params.has("find[date][$lt]") ? Number(params.get("find[date][$lt]")) : null;
  const dateLte = params.has("find[date][$lte]") ? Number(params.get("find[date][$lte]")) : null;

  // SGV filters
  const sgvGte = params.has("find[sgv][$gte]") ? Number(params.get("find[sgv][$gte]")) : null;
  const sgvLte = params.has("find[sgv][$lte]") ? Number(params.get("find[sgv][$lte]")) : null;

  // Build SQL WHERE clauses
  const conditions = ["email = ?"];
  const args: (string | number)[] = [email];

  if (dateGt != null) {
    conditions.push("ts > ?");
    args.push(dateGt);
  }
  if (dateGte != null) {
    conditions.push("ts >= ?");
    args.push(dateGte);
  }
  if (dateLt != null) {
    conditions.push("ts < ?");
    args.push(dateLt);
  }
  if (dateLte != null) {
    conditions.push("ts <= ?");
    args.push(dateLte);
  }
  if (sgvGte != null) {
    conditions.push("sgv >= ?");
    args.push(sgvGte);
  }
  if (sgvLte != null) {
    conditions.push("sgv <= ?");
    args.push(sgvLte);
  }

  // Default time window: last 30 days if no date filter specified
  if (!hasDateGt && !hasDateGte) {
    const defaultStart = Date.now() - 30 * 24 * 60 * 60 * 1000;
    conditions.push("ts > ?");
    args.push(defaultStart);
  }

  args.push(count);

  const readings = await db().execute({
    sql: `SELECT ts, mmol, sgv, direction FROM bg_readings WHERE ${conditions.join(" AND ")} ORDER BY ts DESC LIMIT ?`,
    args,
  });

  const rows = readings.rows.map((row) => ({
    ts: Number(row.ts),
    sgv: Number(row.sgv),
    mmol: Number(row.mmol),
    direction: row.direction as string,
  }));

  // Compute smoothed delta (3-point average, 5-min window)
  const avgSgv = (idx: number) => {
    const lo = Math.max(0, idx - 1);
    const hi = Math.min(rows.length - 1, idx + 1);
    let sum = 0, n = 0;
    for (let j = lo; j <= hi; j++) { sum += rows[j].sgv; n++; }
    return sum / n;
  };

  const DELTA_WINDOW_MS = 5 * 60 * 1000;

  const entries = rows.map((row, i) => {
    let delta = 0;
    const targetTs = row.ts - DELTA_WINDOW_MS;
    let pastIdx: number | null = null;
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[j].ts <= targetTs) {
        const prev = j - 1 > i ? j - 1 : null;
        pastIdx = prev != null && Math.abs(rows[prev].ts - targetTs) < Math.abs(rows[j].ts - targetTs) ? prev : j;
        break;
      }
    }
    if (pastIdx != null && row.ts - rows[pastIdx].ts <= 600_000) {
      delta = avgSgv(i) - avgSgv(pastIdx);
    }

    return {
      sgv: row.sgv,
      date: row.ts,
      dateString: new Date(row.ts).toISOString(),
      delta: Math.round(delta * 1000) / 1000,
      direction: row.direction,
      type: "sgv" as const,
      device: "Springa",
    };
  });

  return NextResponse.json(entries, {
    headers: { "Cache-Control": "no-cache, no-store" },
  });
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
