import { createHash } from "crypto";
import { db } from "./db";
import type { BGReading } from "./cgm";

export function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

/** Month key in YYYY-MM format from a timestamp in ms. */
export function monthKey(tsMs: number): string {
  const date = new Date(tsMs);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** Read readings for specific months. Defaults to current + previous month. */
export async function getBGReadings(
  email: string,
  months?: string[],
): Promise<BGReading[]> {
  if (!months) {
    const now = Date.now();
    const cur = monthKey(now);
    const prev = monthKey(now - 30 * 24 * 60 * 60 * 1000);
    months = cur === prev ? [cur] : [prev, cur];
  }

  const ranges = months.map((m) => {
    const [y, mo] = m.split("-").map(Number);
    const start = Date.UTC(y, mo - 1, 1);
    const end = Date.UTC(y, mo, 1);
    return { start, end };
  });

  const minTs = Math.min(...ranges.map((r) => r.start));
  const maxTs = Math.max(...ranges.map((r) => r.end));

  const result = await db().execute({
    sql: "SELECT ts, mmol, sgv, direction, delta FROM bg_readings WHERE email = ? AND ts >= ? AND ts < ? ORDER BY ts",
    args: [email, minTs, maxTs],
  });

  return result.rows.map((row) => ({
    ts: row.ts as number,
    mmol: row.mmol as number,
    sgv: row.sgv as number,
    direction: row.direction as string,
    delta: row.delta as number,
  }));
}

/** Save readings. Uses INSERT OR REPLACE for dedup by (email, ts). */
export async function saveBGReadings(
  email: string,
  readings: BGReading[],
): Promise<void> {
  if (readings.length === 0) return;

  const BATCH_SIZE = 100;
  for (let i = 0; i < readings.length; i += BATCH_SIZE) {
    const chunk = readings.slice(i, i + BATCH_SIZE);
    await db().batch(
      chunk.map((r) => ({
        sql: `INSERT OR REPLACE INTO bg_readings (email, ts, mmol, sgv, direction, delta)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [email, r.ts, r.mmol, r.sgv, r.direction, r.delta],
      })),
      "write",
    );
  }
}

/** Fetch only recent CGM readings (default: last 30 minutes). */
export async function getRecentBGReadings(
  email: string,
  withinMs: number = 30 * 60 * 1000,
): Promise<BGReading[]> {
  const cutoff = Date.now() - withinMs;
  const result = await db().execute({
    sql: "SELECT ts, mmol, sgv, direction, delta FROM bg_readings WHERE email = ? AND ts >= ? ORDER BY ts",
    args: [email, cutoff],
  });
  return result.rows.map((row) => ({
    ts: row.ts as number,
    mmol: row.mmol as number,
    sgv: row.sgv as number,
    direction: row.direction as string,
    delta: row.delta as number,
  }));
}

/** Padding before/after run window to enable interpolation at boundaries. */
const RUN_WINDOW_PADDING_MS = 10 * 60 * 1000; // 10 minutes

/** Fetch CGM readings for a timestamp range with 10-min padding on each side. */
export async function getBGReadingsForRange(
  email: string,
  startMs: number,
  endMs: number,
): Promise<BGReading[]> {
  const paddedStart = startMs - RUN_WINDOW_PADDING_MS;
  const paddedEnd = endMs + RUN_WINDOW_PADDING_MS;
  const result = await db().execute({
    sql: "SELECT ts, mmol, sgv, direction, delta FROM bg_readings WHERE email = ? AND ts >= ? AND ts <= ? ORDER BY ts",
    args: [email, paddedStart, paddedEnd],
  });
  return result.rows.map((row) => ({
    ts: row.ts as number,
    mmol: row.mmol as number,
    sgv: row.sgv as number,
    direction: row.direction as string,
    delta: row.delta as number,
  }));
}

/** Fetch CGM readings for a run window, with padding for interpolation. */
export async function getBGReadingsForRun(
  email: string,
  runStartMs: number,
  runEndMs: number,
): Promise<BGReading[]> {
  const paddedStart = runStartMs - RUN_WINDOW_PADDING_MS;
  const paddedEnd = runEndMs + RUN_WINDOW_PADDING_MS;

  const result = await db().execute({
    sql: "SELECT ts, mmol, sgv, direction, delta FROM bg_readings WHERE email = ? AND ts >= ? AND ts <= ? ORDER BY ts",
    args: [email, paddedStart, paddedEnd],
  });

  return result.rows.map((row) => ({
    ts: row.ts as number,
    mmol: row.mmol as number,
    sgv: row.sgv as number,
    direction: row.direction as string,
    delta: row.delta as number,
  }));
}
