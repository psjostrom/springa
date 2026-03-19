import { db } from "./db";

// --- Types ---

export interface Treatment {
  id: string;
  created_at: string; // ISO 8601
  event_type: string;
  insulin: number | null;
  carbs: number | null;
  basal_rate: number | null;
  duration: number | null;
  entered_by: string | null;
  ts: number; // created_at as ms epoch
}

// --- CRUD ---

/** Upsert treatments for a user. Uses INSERT OR REPLACE for dedup by (email, id). */
export async function saveTreatments(
  email: string,
  treatments: Treatment[],
): Promise<void> {
  if (treatments.length === 0) return;

  const BATCH_SIZE = 100;
  for (let i = 0; i < treatments.length; i += BATCH_SIZE) {
    const chunk = treatments.slice(i, i + BATCH_SIZE);
    await db().batch(
      chunk.map((t) => ({
        sql: `INSERT OR REPLACE INTO treatments
              (email, id, created_at, event_type, insulin, carbs, basal_rate, duration, entered_by, ts)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          email,
          t.id,
          t.created_at,
          t.event_type,
          t.insulin,
          t.carbs,
          t.basal_rate,
          t.duration,
          t.entered_by,
          t.ts,
        ],
      })),
      "write",
    );
  }
}

/** Query treatments with optional filters. Returns newest-first. */
export async function getTreatments(
  email: string,
  opts: {
    since?: number; // ms epoch lower bound (inclusive)
    until?: number; // ms epoch upper bound (inclusive)
    eventType?: string;
    count?: number; // max results (default 10, max 500)
  } = {},
): Promise<Treatment[]> {
  const conditions = ["email = ?"];
  const args: (string | number)[] = [email];

  if (opts.since != null) {
    conditions.push("ts >= ?");
    args.push(opts.since);
  }
  if (opts.until != null) {
    conditions.push("ts <= ?");
    args.push(opts.until);
  }
  if (opts.eventType) {
    conditions.push("event_type = ?");
    args.push(opts.eventType);
  }

  const limit = Math.min(Math.max(opts.count ?? 10, 1), 500);
  args.push(limit);

  const result = await db().execute({
    sql: `SELECT id, created_at, event_type, insulin, carbs, basal_rate, duration, entered_by, ts
          FROM treatments
          WHERE ${conditions.join(" AND ")}
          ORDER BY ts DESC
          LIMIT ?`,
    args,
  });

  return result.rows.map((row) => ({
    id: row.id as string,
    created_at: row.created_at as string,
    event_type: row.event_type as string,
    insulin: row.insulin as number | null,
    carbs: row.carbs as number | null,
    basal_rate: row.basal_rate as number | null,
    duration: row.duration as number | null,
    entered_by: row.entered_by as string | null,
    ts: row.ts as number,
  }));
}

/** Get the most recent treatment timestamp for a user (ms epoch), or null if none. */
export async function getLastTreatmentTs(email: string): Promise<number | null> {
  const result = await db().execute({
    sql: "SELECT MAX(ts) as max_ts FROM treatments WHERE email = ?",
    args: [email],
  });
  const val = result.rows[0]?.max_ts;
  return val != null ? (val as number) : null;
}
