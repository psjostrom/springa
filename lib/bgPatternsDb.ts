import { db } from "./db";

export interface BGPatternsRow {
  latestActivityId: string;
  patternsText: string;
  analyzedAt: number;
}

export async function getBGPatterns(
  email: string,
): Promise<BGPatternsRow | null> {
  const result = await db().execute({
    sql: "SELECT latest_activity_id, patterns_text, analyzed_at FROM bg_patterns WHERE email = ? ORDER BY analyzed_at DESC LIMIT 1",
    args: [email],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    latestActivityId: row.latest_activity_id as string,
    patternsText: row.patterns_text as string,
    analyzedAt: row.analyzed_at as number,
  };
}

export async function saveBGPatterns(
  email: string,
  latestActivityId: string,
  patternsText: string,
  runCount: number,
): Promise<void> {
  await db().execute({
    sql: "INSERT INTO bg_patterns (email, latest_activity_id, run_count, patterns_text, analyzed_at) VALUES (?, ?, ?, ?, ?)",
    args: [email, latestActivityId, runCount, patternsText, Date.now()],
  });
}
