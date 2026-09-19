import { db } from "./db";

export type CamAPSMode = "disconnected" | "auto" | "manual";
export type CamAPSAutoSubmode = "ease_off" | "normal" | "boost";
export type ProtocolTiming = ">2h" | "1-2h" | "<30m" | "at_start";

export type WorkoutFeedbackStatus = "unrated" | "rated" | "skipped";

export interface WorkoutProtocol {
  activityId: string;
  category?: string | null;
  hasProtocol: boolean;
  status: WorkoutFeedbackStatus;
  beforeMode: CamAPSMode | null;
  beforeAutoSubmode: CamAPSAutoSubmode | null;
  beforeTargetBg: number | null;
  beforeManualUh: number | null;
  beforeTiming: ProtocolTiming | null;
  duringSame: boolean;
  duringMode: CamAPSMode | null;
  duringAutoSubmode: CamAPSAutoSubmode | null;
  duringTargetBg: number | null;
  duringManualUh: number | null;
  preRunCarbsG: number | null;
  rescueCarbsG: number | null;
  feel: number | null;
  rpe: number | null;
  note: string | null;
  updatedAt: number;
}

export interface WorkoutProtocolInput {
  category?: string | null;
  hasProtocol?: boolean;
  status?: WorkoutFeedbackStatus;
  beforeMode?: CamAPSMode | null;
  beforeAutoSubmode?: CamAPSAutoSubmode | null;
  beforeTargetBg?: number | null;
  beforeManualUh?: number | null;
  beforeTiming?: ProtocolTiming | null;
  duringSame?: boolean;
  duringMode?: CamAPSMode | null;
  duringAutoSubmode?: CamAPSAutoSubmode | null;
  duringTargetBg?: number | null;
  duringManualUh?: number | null;
  preRunCarbsG?: number | null;
  rescueCarbsG?: number | null;
  feel?: number | null;
  rpe?: number | null;
  note?: string | null;
}

export async function getWorkoutProtocol(
  email: string,
  activityId: string,
): Promise<WorkoutProtocol | null> {
  const result = await db().execute({
    sql: `SELECT
      activity_id, category, has_protocol, status, before_mode, before_auto_submode, before_target_bg, before_manual_uh,
      before_timing, during_same, during_mode, during_auto_submode, during_target_bg,
      during_manual_uh, pre_run_carbs_g, rescue_carbs_g, feel, rpe, note, updated_at
    FROM workout_protocols
    WHERE email = ? AND activity_id = ?`,
    args: [email, activityId],
  });

  if (result.rows.length === 0) return null;
  const row = result.rows[0];

  const parseNum = (val: unknown): number | null =>
    val != null && val !== "" && !Number.isNaN(Number(val)) ? Number(val) : null;

  const hasProtocol =
    row.has_protocol != null
      ? Boolean(row.has_protocol)
      : Boolean(row.before_mode && row.before_mode !== "none" && row.before_mode !== "");

  const status: WorkoutFeedbackStatus =
    row.status === "skipped" ? "skipped" : row.status === "rated" ? "rated" : "unrated";

  return {
    activityId: row.activity_id as string,
    category: typeof row.category === "string" ? row.category : null,
    hasProtocol,
    status,
    beforeMode: hasProtocol && row.before_mode && row.before_mode !== "none" ? (row.before_mode as CamAPSMode) : null,
    beforeAutoSubmode: hasProtocol && row.before_auto_submode != null ? (row.before_auto_submode as CamAPSAutoSubmode) : null,
    beforeTargetBg: hasProtocol ? parseNum(row.before_target_bg) : null,
    beforeManualUh: hasProtocol ? parseNum(row.before_manual_uh) : null,
    beforeTiming: hasProtocol && row.before_timing && row.before_timing !== "none" ? (row.before_timing as ProtocolTiming) : null,
    duringSame: Boolean(row.during_same),
    duringMode: hasProtocol && row.during_mode != null ? (row.during_mode as CamAPSMode) : null,
    duringAutoSubmode: hasProtocol && row.during_auto_submode != null ? (row.during_auto_submode as CamAPSAutoSubmode) : null,
    duringTargetBg: hasProtocol ? parseNum(row.during_target_bg) : null,
    duringManualUh: hasProtocol ? parseNum(row.during_manual_uh) : null,
    preRunCarbsG: parseNum(row.pre_run_carbs_g),
    rescueCarbsG: parseNum(row.rescue_carbs_g),
    feel: parseNum(row.feel),
    rpe: parseNum(row.rpe),
    note: typeof row.note === "string" && row.note.trim() ? row.note.trim() : null,
    updatedAt: Number(row.updated_at),
  };
}

export async function getLastWorkoutProtocols(
  email: string,
): Promise<Record<string, WorkoutProtocol>> {
  const result = await db().execute({
    sql: `SELECT
      activity_id, category, has_protocol, status, before_mode, before_auto_submode, before_target_bg, before_manual_uh,
      before_timing, during_same, during_mode, during_auto_submode, during_target_bg,
      during_manual_uh, pre_run_carbs_g, rescue_carbs_g, feel, rpe, note, updated_at
    FROM workout_protocols
    WHERE email = ? AND status = 'rated' AND has_protocol = 1
    ORDER BY updated_at DESC`,
    args: [email],
  });

  const parseNum = (val: unknown): number | null =>
    val != null && val !== "" && !Number.isNaN(Number(val)) ? Number(val) : null;

  const byCategory: Record<string, WorkoutProtocol> = {};

  for (const row of result.rows) {
    const cat = typeof row.category === "string" ? row.category.toLowerCase() : null;
    if (!cat || byCategory[cat]) continue;

    byCategory[cat] = {
      activityId: row.activity_id as string,
      category: cat,
      hasProtocol: true,
      status: "rated",
      beforeMode: row.before_mode && row.before_mode !== "none" ? (row.before_mode as CamAPSMode) : null,
      beforeAutoSubmode: row.before_auto_submode != null ? (row.before_auto_submode as CamAPSAutoSubmode) : null,
      beforeTargetBg: parseNum(row.before_target_bg),
      beforeManualUh: parseNum(row.before_manual_uh),
      beforeTiming: row.before_timing && row.before_timing !== "none" ? (row.before_timing as ProtocolTiming) : null,
      duringSame: Boolean(row.during_same),
      duringMode: row.during_mode != null ? (row.during_mode as CamAPSMode) : null,
      duringAutoSubmode: row.during_auto_submode != null ? (row.during_auto_submode as CamAPSAutoSubmode) : null,
      duringTargetBg: parseNum(row.during_target_bg),
      duringManualUh: parseNum(row.during_manual_uh),
      preRunCarbsG: parseNum(row.pre_run_carbs_g),
      rescueCarbsG: parseNum(row.rescue_carbs_g),
      feel: parseNum(row.feel),
      rpe: parseNum(row.rpe),
      note: typeof row.note === "string" && row.note.trim() ? row.note.trim() : null,
      updatedAt: Number(row.updated_at),
    };
  }

  return byCategory;
}

export async function saveWorkoutProtocol(
  email: string,
  activityId: string,
  input: WorkoutProtocolInput,
): Promise<WorkoutProtocol> {
  const updatedAt = Date.now();
  const hasProtocol =
    input.hasProtocol ??
    Boolean(input.beforeMode && (input.beforeMode as string) !== "none");
  const beforeMode = hasProtocol && input.beforeMode ? input.beforeMode : null;
  const beforeTiming = hasProtocol && input.beforeTiming ? input.beforeTiming : null;
  const duringSame = hasProtocol ? Boolean(input.duringSame) : true;
  const status: WorkoutFeedbackStatus = input.status ?? "rated";
  const category = input.category ?? null;

  const protocol: WorkoutProtocol = {
    activityId,
    category,
    hasProtocol,
    status,
    beforeMode,
    beforeAutoSubmode: hasProtocol ? (input.beforeAutoSubmode ?? null) : null,
    beforeTargetBg: hasProtocol ? (input.beforeTargetBg ?? null) : null,
    beforeManualUh: hasProtocol ? (input.beforeManualUh ?? null) : null,
    beforeTiming,
    duringSame,
    duringMode: hasProtocol && !duringSame ? (input.duringMode ?? null) : null,
    duringAutoSubmode: hasProtocol && !duringSame ? (input.duringAutoSubmode ?? null) : null,
    duringTargetBg: hasProtocol && !duringSame ? (input.duringTargetBg ?? null) : null,
    duringManualUh: hasProtocol && !duringSame ? (input.duringManualUh ?? null) : null,
    preRunCarbsG: input.preRunCarbsG ?? null,
    rescueCarbsG: input.rescueCarbsG ?? null,
    feel: input.feel ?? null,
    rpe: input.rpe ?? null,
    note: input.note?.trim() ? input.note.trim() : null,
    updatedAt,
  };

  await db().execute({
    sql: `INSERT OR REPLACE INTO workout_protocols (
      email, activity_id, category, has_protocol, status, before_mode, before_auto_submode, before_target_bg, before_manual_uh,
      before_timing, during_same, during_mode, during_auto_submode, during_target_bg,
      during_manual_uh, pre_run_carbs_g, rescue_carbs_g, feel, rpe, note, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      email,
      activityId,
      category,
      protocol.hasProtocol ? 1 : 0,
      protocol.status,
      protocol.beforeMode ?? "none",
      protocol.beforeAutoSubmode,
      protocol.beforeTargetBg,
      protocol.beforeManualUh,
      protocol.beforeTiming ?? "none",
      protocol.duringSame ? 1 : 0,
      protocol.duringMode,
      protocol.duringAutoSubmode,
      protocol.duringTargetBg,
      protocol.duringManualUh,
      protocol.preRunCarbsG,
      protocol.rescueCarbsG,
      protocol.feel,
      protocol.rpe,
      protocol.note,
      protocol.updatedAt,
    ],
  });

  return protocol;
}
