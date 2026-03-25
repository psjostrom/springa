import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/apiHelpers";
import { validateApiSecretFromDB } from "@/lib/credentials";
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
  const apiSecret = req.headers.get("api-secret");
  const email = await validateApiSecretFromDB(apiSecret);
  if (!email) {
    const prefix = apiSecret ? apiSecret.slice(0, 8) + "…" : "(empty)";
    console.warn(`[entries] GET auth failed — api-secret prefix: ${prefix}`);
    return unauthorized();
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
    sql: `SELECT ts, mmol, sgv, direction, delta FROM bg_readings WHERE ${conditions.join(" AND ")} ORDER BY ts DESC LIMIT ?`,
    args,
  });

  const entries = readings.rows.map((row) => ({
    sgv: Number(row.sgv),
    date: Number(row.ts),
    dateString: new Date(Number(row.ts)).toISOString(),
    delta: Number(row.delta),
    direction: row.direction as string,
    type: "sgv" as const,
    device: "Springa",
  }));


  return NextResponse.json(entries, {
    headers: { "Cache-Control": "no-cache, no-store" },
  });
}

export async function POST(req: Request) {
  const postSecret = req.headers.get("api-secret");
  const email = await validateApiSecretFromDB(postSecret);
  if (!email) {
    const prefix = postSecret ? postSecret.slice(0, 8) + "…" : "(empty)";
    console.warn(`[entries] POST auth failed — api-secret prefix: ${prefix}`);
    return unauthorized();
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

  // Snapshot existing state so we can diff after recompute
  const existingState = new Map(existing.map((r) => [r.ts, { direction: r.direction, delta: r.delta }]));

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

  // Recompute direction and delta from sgv values — xDrip+ companion mode
  // returns stale/wrong direction fields (issue #3787)
  recomputeDirections(deduped);

  // Only write readings that are new or whose direction/delta changed
  const toWrite = deduped.filter((r) => {
    const prev = existingState.get(r.ts);
    if (!prev) return true;
    return prev.direction !== r.direction || prev.delta !== r.delta;
  });

  if (toWrite.length > 0) {
    await saveBGReadings(email, toWrite);
  }

  return NextResponse.json({
    ok: true,
    received: newReadings.length,
    written: toWrite.length,
  });
}
