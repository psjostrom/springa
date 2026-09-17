import { db } from "./db";

export type CamAPSMode = "disconnected" | "auto" | "manual";
export type CamAPSAutoSubmode = "ease_off" | "normal" | "boost";
export type ProtocolTiming = ">2h" | "1-2h" | "<30m" | "at_start";

export interface WorkoutProtocol {
  activityId: string;
  beforeMode: CamAPSMode;
  beforeAutoSubmode: CamAPSAutoSubmode | null;
  beforeTargetBg: number | null;
  beforeManualUh: number | null;
  beforeTiming: ProtocolTiming;
  duringSame: boolean;
  duringMode: CamAPSMode | null;
  duringAutoSubmode: CamAPSAutoSubmode | null;
  duringTargetBg: number | null;
  duringManualUh: number | null;
  preRunCarbsG: number | null;
  rescueCarbsG: number | null;
  note: string | null;
  updatedAt: number;
}

export interface WorkoutProtocolInput {
  beforeMode: CamAPSMode;
  beforeAutoSubmode?: CamAPSAutoSubmode | null;
  beforeTargetBg?: number | null;
  beforeManualUh?: number | null;
  beforeTiming: ProtocolTiming;
  duringSame: boolean;
  duringMode?: CamAPSMode | null;
  duringAutoSubmode?: CamAPSAutoSubmode | null;
  duringTargetBg?: number | null;
  duringManualUh?: number | null;
  preRunCarbsG?: number | null;
  rescueCarbsG?: number | null;
  note?: string | null;
}

export async function getWorkoutProtocol(
  email: string,
  activityId: string,
): Promise<WorkoutProtocol | null> {
  const result = await db().execute({
    sql: `SELECT
      activity_id, before_mode, before_auto_submode, before_target_bg, before_manual_uh,
      before_timing, during_same, during_mode, during_auto_submode, during_target_bg,
      during_manual_uh, pre_run_carbs_g, rescue_carbs_g, note, updated_at
    FROM workout_protocols
    WHERE email = ? AND activity_id = ?`,
    args: [email, activityId],
  });

  if (result.rows.length === 0) return null;
  const row = result.rows[0];

  return {
    activityId: row.activity_id as string,
    beforeMode: row.before_mode as CamAPSMode,
    beforeAutoSubmode: row.before_auto_submode != null ? (row.before_auto_submode as CamAPSAutoSubmode) : null,
    beforeTargetBg: row.before_target_bg != null ? Number(row.before_target_bg) : null,
    beforeManualUh: row.before_manual_uh != null ? Number(row.before_manual_uh) : null,
    beforeTiming: row.before_timing as ProtocolTiming,
    duringSame: Boolean(row.during_same),
    duringMode: row.during_mode != null ? (row.during_mode as CamAPSMode) : null,
    duringAutoSubmode: row.during_auto_submode != null ? (row.during_auto_submode as CamAPSAutoSubmode) : null,
    duringTargetBg: row.during_target_bg != null ? Number(row.during_target_bg) : null,
    duringManualUh: row.during_manual_uh != null ? Number(row.during_manual_uh) : null,
    preRunCarbsG: row.pre_run_carbs_g != null ? Number(row.pre_run_carbs_g) : null,
    rescueCarbsG: row.rescue_carbs_g != null ? Number(row.rescue_carbs_g) : null,
    note: typeof row.note === "string" ? row.note : null,
    updatedAt: Number(row.updated_at),
  };
}

export async function saveWorkoutProtocol(
  email: string,
  activityId: string,
  input: WorkoutProtocolInput,
): Promise<WorkoutProtocol> {
  const updatedAt = Date.now();
  const protocol: WorkoutProtocol = {
    activityId,
    beforeMode: input.beforeMode,
    beforeAutoSubmode: input.beforeAutoSubmode ?? null,
    beforeTargetBg: input.beforeTargetBg ?? null,
    beforeManualUh: input.beforeManualUh ?? null,
    beforeTiming: input.beforeTiming,
    duringSame: input.duringSame,
    duringMode: input.duringSame ? null : (input.duringMode ?? null),
    duringAutoSubmode: input.duringSame ? null : (input.duringAutoSubmode ?? null),
    duringTargetBg: input.duringSame ? null : (input.duringTargetBg ?? null),
    duringManualUh: input.duringSame ? null : (input.duringManualUh ?? null),
    preRunCarbsG: input.preRunCarbsG ?? null,
    rescueCarbsG: input.rescueCarbsG ?? null,
    note: input.note ? input.note.trim() : null,
    updatedAt,
  };

  await db().execute({
    sql: `INSERT OR REPLACE INTO workout_protocols (
      email, activity_id, before_mode, before_auto_submode, before_target_bg, before_manual_uh,
      before_timing, during_same, during_mode, during_auto_submode, during_target_bg,
      during_manual_uh, pre_run_carbs_g, rescue_carbs_g, note, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      email,
      activityId,
      protocol.beforeMode,
      protocol.beforeAutoSubmode,
      protocol.beforeTargetBg,
      protocol.beforeManualUh,
      protocol.beforeTiming,
      protocol.duringSame ? 1 : 0,
      protocol.duringMode,
      protocol.duringAutoSubmode,
      protocol.duringTargetBg,
      protocol.duringManualUh,
      protocol.preRunCarbsG,
      protocol.rescueCarbsG,
      protocol.note,
      protocol.updatedAt,
    ],
  });

  return protocol;
}

export async function getLatestWorkoutProtocol(
  email: string,
): Promise<WorkoutProtocol | null> {
  const result = await db().execute({
    sql: `SELECT
      activity_id, before_mode, before_auto_submode, before_target_bg, before_manual_uh,
      before_timing, during_same, during_mode, during_auto_submode, during_target_bg,
      during_manual_uh, pre_run_carbs_g, rescue_carbs_g, note, updated_at
    FROM workout_protocols
    WHERE email = ?
    ORDER BY updated_at DESC
    LIMIT 1`,
    args: [email],
  });

  if (result.rows.length === 0) return null;
  const row = result.rows[0];

  return {
    activityId: row.activity_id as string,
    beforeMode: row.before_mode as CamAPSMode,
    beforeAutoSubmode: row.before_auto_submode != null ? (row.before_auto_submode as CamAPSAutoSubmode) : null,
    beforeTargetBg: row.before_target_bg != null ? Number(row.before_target_bg) : null,
    beforeManualUh: row.before_manual_uh != null ? Number(row.before_manual_uh) : null,
    beforeTiming: row.before_timing as ProtocolTiming,
    duringSame: Boolean(row.during_same),
    duringMode: row.during_mode != null ? (row.during_mode as CamAPSMode) : null,
    duringAutoSubmode: row.during_auto_submode != null ? (row.during_auto_submode as CamAPSAutoSubmode) : null,
    duringTargetBg: row.during_target_bg != null ? Number(row.during_target_bg) : null,
    duringManualUh: row.during_manual_uh != null ? Number(row.during_manual_uh) : null,
    preRunCarbsG: row.pre_run_carbs_g != null ? Number(row.pre_run_carbs_g) : null,
    rescueCarbsG: row.rescue_carbs_g != null ? Number(row.rescue_carbs_g) : null,
    note: typeof row.note === "string" ? row.note : null,
    updatedAt: Number(row.updated_at),
  };
}
