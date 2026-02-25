import { createHash } from "crypto";
import { db } from "./db";
import { saveUserSettings } from "./settings";
import type { XdripReading } from "./xdrip";

export function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

export async function saveXdripAuth(
  email: string,
  secret: string,
): Promise<void> {
  const hash = sha1(secret);
  await db().batch(
    [
      { sql: "DELETE FROM xdrip_auth WHERE email = ?", args: [email] },
      {
        sql: "INSERT INTO xdrip_auth (secret_hash, email) VALUES (?, ?)",
        args: [hash, email],
      },
    ],
    "write",
  );
  await saveUserSettings(email, { xdripSecret: secret });
}

export async function lookupXdripUser(
  apiSecretHash: string,
): Promise<string | null> {
  const result = await db().execute({
    sql: "SELECT email FROM xdrip_auth WHERE secret_hash = ?",
    args: [apiSecretHash],
  });
  return result.rows.length > 0 ? (result.rows[0].email as string) : null;
}

/** Month key in YYYY-MM format from a timestamp in ms. */
export function monthKey(tsMs: number): string {
  const date = new Date(tsMs);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** Read readings for specific months. Defaults to current + previous month. */
export async function getXdripReadings(
  email: string,
  months?: string[],
): Promise<XdripReading[]> {
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
    sql: "SELECT ts, mmol, sgv, direction FROM xdrip_readings WHERE email = ? AND ts >= ? AND ts < ? ORDER BY ts",
    args: [email, minTs, maxTs],
  });

  return result.rows.map((row) => ({
    ts: row.ts as number,
    mmol: row.mmol as number,
    sgv: row.sgv as number,
    direction: row.direction as string,
  }));
}

/** Save readings. Uses INSERT OR REPLACE for dedup by (email, ts). */
export async function saveXdripReadings(
  email: string,
  readings: XdripReading[],
): Promise<void> {
  if (readings.length === 0) return;

  const BATCH_SIZE = 100;
  for (let i = 0; i < readings.length; i += BATCH_SIZE) {
    const chunk = readings.slice(i, i + BATCH_SIZE);
    await db().batch(
      chunk.map((r) => ({
        sql: `INSERT OR REPLACE INTO xdrip_readings (email, ts, mmol, sgv, direction)
              VALUES (?, ?, ?, ?, ?)`,
        args: [email, r.ts, r.mmol, r.sgv, r.direction],
      })),
      "write",
    );
  }
}

/** Fetch only recent xDrip readings (default: last 30 minutes). */
export async function getRecentXdripReadings(
  email: string,
  withinMs: number = 30 * 60 * 1000,
): Promise<XdripReading[]> {
  const cutoff = Date.now() - withinMs;
  const result = await db().execute({
    sql: "SELECT ts, mmol, sgv, direction FROM xdrip_readings WHERE email = ? AND ts >= ? ORDER BY ts",
    args: [email, cutoff],
  });
  return result.rows.map((row) => ({
    ts: row.ts as number,
    mmol: row.mmol as number,
    sgv: row.sgv as number,
    direction: row.direction as string,
  }));
}
