import { db } from "./db";

export interface PlannerMetadata {
  generatedPlanConfig: string | null;
  dirty: boolean;
}

const EMPTY_METADATA: PlannerMetadata = {
  generatedPlanConfig: null,
  dirty: false,
};

export async function getPlannerMetadata(
  email: string,
): Promise<PlannerMetadata> {
  const result = await db().execute({
    sql: "SELECT generated_plan_config, planner_config_dirty FROM user_settings WHERE email = ?",
    args: [email],
  });
  if (result.rows.length === 0) return { ...EMPTY_METADATA };

  const row = result.rows[0];
  return {
    generatedPlanConfig: (row.generated_plan_config as string | null) ?? null,
    dirty: row.planner_config_dirty === 1,
  };
}

export async function savePlannerMetadata(
  email: string,
  metadata: PlannerMetadata,
): Promise<void> {
  await db().execute({
    sql: "INSERT OR IGNORE INTO user_settings (email) VALUES (?)",
    args: [email],
  });
  await db().execute({
    sql: "UPDATE user_settings SET generated_plan_config = ?, planner_config_dirty = ? WHERE email = ?",
    args: [metadata.generatedPlanConfig, metadata.dirty ? 1 : 0, email],
  });
}
