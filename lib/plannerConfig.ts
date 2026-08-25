import { addWeeks, differenceInCalendarWeeks, format, isValid, parseISO, startOfWeek } from "date-fns";
import { createHash } from "node:crypto";
import {
  buildDefaultNewProgramDraft,
  buildProgramConfigKeyFromSettings,
  classifyProgramConfigDirty,
  getNewProgramTimelineWarning,
  getProgramWeeks,
  MIN_NEW_PROGRAM_WEEKS,
} from "./programs";
import { MIN_NORMAL_PLAN_WEEKS, supportsBasePhase } from "./periodization";
import { DISTANCE_OPTIONS, getDefaultGoalTime, getSliderRange } from "./paceTable";
import { canUseHeartRateMetric, normalizeEffortMetric, type EffortMetric } from "./effortMetric";
import type { UserSettings } from "./settings";
import type { CalendarEvent, WorkoutEvent } from "./types";
import type { ResolvedWorkoutMetrics } from "./workoutMath";

export type PlannerWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type PlannerClubType = "long" | "speed" | "varies";

export const PLANNER_CONFIG_VERSION = 4;
export const RACE_DISTANCE_RANGE = { min: 1, max: 100 } as const;
export const START_DISTANCE_RANGE = { min: 2, max: 42 } as const;
export const FITNESS_DISTANCES = [5, 10, 21.1, 42.2] as const;

export interface PlannerConfig {
  raceName: string;
  raceDist: number;
  raceDate: string;
  currentAbilityDist: number;
  currentAbilitySecs: number;
  runDays: PlannerWeekday[];
  longRunDay: PlannerWeekday;
  clubDay: PlannerWeekday | null;
  clubType: PlannerClubType | null;
  totalWeeks: number;
  startKm: number;
  includeBasePhase: boolean;
  effortMetric: EffortMetric;
}

export interface PlannerFitnessOption {
  label: "5K" | "10K" | "Half" | "Marathon";
  distanceKm: number;
  defaultSeconds: number;
  minSeconds: number;
  maxSeconds: number;
  stepSeconds: number;
}

interface PlannerSyncValue {
  status: "unknown" | "synced" | "dirty";
  dirtyKind: "target-only" | "structural" | null;
}
export type PlannerSync = PlannerSyncValue | null;

export interface PlannerFuelRate {
  gramsPerHour: number;
  source: "learned" | "default";
}

interface PlannerConstraints {
  raceDistanceKm: { min: 1; max: 100 };
  startDistanceKm: { min: 2; max: 42 };
  minimumWeeks: 8;
  minimumNormalWeeks: 10;
  recommendedWeeks: 12;
  basePhaseMinimumWeeks: 11;
}

interface PlannerPlanState {
  status: "none" | "active" | "complete";
  sync: PlannerSync;
  weeksToGo: number | null;
  futureWorkoutCount: number;
}

export interface PlannerState {
  currentConfig: PlannerConfig | null;
  newProgramDraft: PlannerConfig;
  fitnessOptions: PlannerFitnessOption[];
  constraints: PlannerConstraints;
  plan: PlannerPlanState;
  fuelRates: null | {
    easy: PlannerFuelRate;
    long: PlannerFuelRate;
    interval: PlannerFuelRate;
  };
}

export interface PlannerWarning {
  kind: "compressed" | "very-compressed";
  title: string;
  message: string;
}

export interface PlannerPreviewWorkout {
  key: string;
  week: number;
  date: string;
  name: string;
  category: "easy" | "long" | "interval" | "race" | "other";
  distanceKm: number | null;
  durationMinutes: number | null;
  fuelRateGPerHour: number | null;
}

export interface PlannerPreview {
  intent: "start" | "update";
  action: "replace-plan" | "update-targets";
  config: PlannerConfig;
  previewHash: string;
  warning: PlannerWarning | null;
  summary: {
    workoutCount: number;
    planWeeks: number;
    firstWorkoutDate: string | null;
    raceDate: string;
    totalDistanceKm: number;
  };
  weeks: {
    week: number;
    startsOn: string;
    distanceKm: number;
    workoutCount: number;
  }[];
  workouts: PlannerPreviewWorkout[];
}

export interface PlannerPreviewRequest {
  intent: "start" | "update";
  config: PlannerConfig;
}

export type PlannerApplyRequest = PlannerPreviewRequest & { previewHash: string };

export type PlannerErrorCode =
  | "PLANNER_CONFIG_INVALID"
  | "INTERVALS_NOT_CONNECTED"
  | "HR_ZONES_REQUIRED"
  | "PLAN_PREVIEW_STALE"
  | "INTERVALS_UPSTREAM_ERROR"
  | "PLANNER_APPLY_PARTIAL"
  | "PLANNER_STATE_FINALIZE_FAILED";

export class PlannerError extends Error {
  constructor(
    public readonly code: PlannerErrorCode,
    message: string,
    public readonly fields?: Partial<Record<keyof PlannerConfig, string>>,
    public readonly details?: {
      appliedWorkoutCount?: number;
      failures?: { id: string; name: string; error: string }[];
    },
  ) {
    super(message);
    this.name = "PlannerError";
  }
}

export interface PlannerValidation {
  fields: Partial<Record<keyof PlannerConfig, string>>;
  warning: PlannerWarning | null;
}

const CONFIG_KEYS = [
  "raceName",
  "raceDist",
  "raceDate",
  "currentAbilityDist",
  "currentAbilitySecs",
  "runDays",
  "longRunDay",
  "clubDay",
  "clubType",
  "totalWeeks",
  "startKm",
  "includeBasePhase",
  "effortMetric",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function localDateString(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateIsValid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    isValid(parseISO(value))
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isWeekday(value: unknown): value is PlannerWeekday {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 6;
}

function isClubType(value: unknown): value is PlannerClubType {
  return value === "long" || value === "speed" || value === "varies";
}

function getRawWeeksForDate(raceDate: string, now: Date, timezone: string): number {
  const today = parseISO(localDateString(now, timezone));
  return differenceInCalendarWeeks(parseISO(raceDate), today, { weekStartsOn: 1 }) + 1;
}

function getWeeksForDate(raceDate: string, now: Date, timezone: string): number {
  return Math.max(MIN_NEW_PROGRAM_WEEKS, getRawWeeksForDate(raceDate, now, timezone));
}

function nearestFitnessDistance(distance: number): number {
  return FITNESS_DISTANCES.reduce((nearest, candidate) =>
    Math.abs(candidate - distance) < Math.abs(nearest - distance) ? candidate : nearest,
  );
}

function toPlannerConfig(source: {
  raceName?: string;
  raceDist?: number;
  raceDate?: string;
  currentAbilityDist?: number;
  currentAbilitySecs?: number;
  runDays?: number[];
  longRunDay?: number;
  clubDay?: number;
  clubType?: string;
  totalWeeks?: number;
  startKm?: number;
  includeBasePhase?: boolean;
  effortMetric?: EffortMetric;
}): PlannerConfig | null {
  if (
    !source.raceDate ||
    !isFiniteNumber(source.raceDist) ||
    !isFiniteNumber(source.currentAbilityDist) ||
    !isFiniteNumber(source.currentAbilitySecs)
  ) {
    return null;
  }
  const runDays = source.runDays?.length ? source.runDays : [2, 4, 6, 0];
  const configuredLongRunDay = source.longRunDay;
  const longRunDay = configuredLongRunDay != null && runDays.includes(configuredLongRunDay)
    ? configuredLongRunDay
    : runDays.includes(0)
      ? 0
      : runDays[runDays.length - 1];
  const clubDay = source.clubDay != null && runDays.includes(source.clubDay)
    ? source.clubDay
    : null;
  const clubType = clubDay == null || !isClubType(source.clubType) ? null : source.clubType;
  const totalWeeks = source.totalWeeks ?? getProgramWeeks(source.raceDate);
  return {
    raceName: source.raceName?.trim() ?? "",
    raceDist: source.raceDist,
    raceDate: source.raceDate,
    currentAbilityDist: nearestFitnessDistance(source.currentAbilityDist),
    currentAbilitySecs: source.currentAbilitySecs,
    runDays: [...new Set(runDays)].sort((a, b) => a - b) as PlannerWeekday[],
    longRunDay: longRunDay as PlannerWeekday,
    clubDay: clubDay as PlannerWeekday | null,
    clubType,
    totalWeeks,
    startKm: source.startKm ?? 8,
    includeBasePhase: Boolean(source.includeBasePhase),
    effortMetric: normalizeEffortMetric(source.effortMetric),
  };
}

export function plannerConfigFromSettings(settings: UserSettings): PlannerConfig | null {
  return toPlannerConfig(settings);
}

export function buildPlannerDefaults(settings: UserSettings, now = new Date()): PlannerConfig {
  const draft = buildDefaultNewProgramDraft(settings, now);
  const distance = nearestFitnessDistance(draft.currentAbilityDist);
  return {
    raceName: draft.raceName.trim(),
    raceDist: draft.raceDist,
    raceDate: draft.raceDate,
    currentAbilityDist: distance,
    currentAbilitySecs:
      draft.currentAbilityDist === distance
        ? draft.currentAbilitySecs
        : getDefaultGoalTime(distance, "intermediate"),
    runDays: [...new Set(draft.runDays)].sort((a, b) => a - b) as PlannerWeekday[],
    longRunDay: (draft.longRunDay ?? 0) as PlannerWeekday,
    clubDay: (draft.clubDay ?? null) as PlannerWeekday | null,
    clubType: (draft.clubType && isClubType(draft.clubType) ? draft.clubType : null),
    totalWeeks: getWeeksForDate(draft.raceDate, now, settings.timezone ?? "Europe/Stockholm"),
    startKm: draft.startKm,
    includeBasePhase: supportsBasePhase(draft.totalWeeks) && draft.includeBasePhase,
    effortMetric: normalizeEffortMetric(draft.effortMetric),
  };
}

export function normalizePlannerConfig(
  config: PlannerConfig,
  now = new Date(),
  timezone = "Europe/Stockholm",
): PlannerConfig {
  const raceDate = config.raceDate;
  const totalWeeks = dateIsValid(raceDate)
    ? getWeeksForDate(raceDate, now, timezone)
    : config.totalWeeks;
  const runDays = [...new Set(config.runDays)].sort((a, b) => a - b);
  const longRunDay = runDays.includes(config.longRunDay)
    ? config.longRunDay
    : (runDays[runDays.length - 1] ?? config.longRunDay);
  const clubDay = config.clubDay != null && runDays.includes(config.clubDay)
    ? config.clubDay
    : null;
  const clubType = clubDay == null ? null : config.clubType;
  return {
    ...config,
    raceName: config.raceName.trim(),
    runDays,
    longRunDay,
    clubDay,
    clubType,
    totalWeeks,
    includeBasePhase: supportsBasePhase(totalWeeks) && config.includeBasePhase,
    effortMetric: normalizeEffortMetric(config.effortMetric),
  };
}

export function validatePlannerConfig(
  config: PlannerConfig,
  now = new Date(),
  timezone = "Europe/Stockholm",
  hrContext: { lthr?: number; hrZones?: number[] } = {},
): PlannerValidation {
  const fields: Partial<Record<keyof PlannerConfig, string>> = {};
  if (!isFiniteNumber(config.raceDist) || config.raceDist < 1 || config.raceDist > 100)
    fields.raceDist = "Race distance must be between 1 and 100 km.";
  if (!dateIsValid(config.raceDate)) fields.raceDate = "Race date must be a valid date.";

  const rawWeeks = dateIsValid(config.raceDate)
    ? getRawWeeksForDate(config.raceDate, now, timezone)
    : config.totalWeeks;
  const totalWeeks = dateIsValid(config.raceDate)
    ? Math.max(MIN_NEW_PROGRAM_WEEKS, rawWeeks)
    : config.totalWeeks;
  if (
    !isFiniteNumber(config.totalWeeks) ||
    config.totalWeeks < MIN_NEW_PROGRAM_WEEKS ||
    rawWeeks < MIN_NEW_PROGRAM_WEEKS
  )
    fields.totalWeeks = `Plan length must be at least ${MIN_NEW_PROGRAM_WEEKS} weeks.`;
  else if (config.totalWeeks !== totalWeeks)
    fields.totalWeeks = "Plan length must match the race date.";
  if (!FITNESS_DISTANCES.some((distance) => distance === config.currentAbilityDist))
    fields.currentAbilityDist = "Choose a supported fitness distance.";
  else {
    const range = getSliderRange(config.currentAbilityDist);
    if (!isFiniteNumber(config.currentAbilitySecs) || config.currentAbilitySecs < range.min || config.currentAbilitySecs > range.max)
      fields.currentAbilitySecs = "Fitness time is outside the supported range.";
  }
  if (
    !Array.isArray(config.runDays) ||
    config.runDays.length < 2 ||
    config.runDays.some((day) => !isWeekday(day)) ||
    new Set(config.runDays).size !== config.runDays.length
  ) {
    fields.runDays = "Choose at least two unique run days.";
  }
  if (!isWeekday(config.longRunDay) || !config.runDays.includes(config.longRunDay))
    fields.longRunDay = "Long run day must be one of your run days.";
  if (config.clubDay != null && (!isWeekday(config.clubDay) || !config.runDays.includes(config.clubDay)))
    fields.clubDay = "Club run day must be one of your run days.";
  if (config.clubDay == null ? config.clubType != null : !isClubType(config.clubType))
    fields.clubType = "Club day and type must be configured together.";
  if (
    config.clubDay != null &&
    config.clubType !== "long" &&
    config.clubDay === config.longRunDay
  ) {
    fields.clubDay = "Club run day must differ from long run day unless it is the long run.";
  }
  if (!isFiniteNumber(config.startKm) || config.startKm < 2 || config.startKm > 42)
    fields.startKm = "Starting distance must be between 2 and 42 km.";
  if (config.includeBasePhase && !supportsBasePhase(totalWeeks))
    fields.includeBasePhase = "Base phase requires at least 11 weeks.";
  if (!isFiniteNumber(config.raceDist) || config.raceDist < 1 || config.raceDist > 100) {
    // Already reported above; keep branch explicit for malformed direct calls.
  }
  if (!["pace", "hr", "feel"].includes(config.effortMetric))
    fields.effortMetric = "Choose pace, heart rate, or feel.";
  else if (
    config.effortMetric === "hr" &&
    !canUseHeartRateMetric(hrContext.lthr, hrContext.hrZones)
  ) {
    fields.effortMetric = "Heart-rate zones are required for heart-rate workouts.";
  }

  const warning = dateIsValid(config.raceDate)
    ? getPlannerTimelineWarning(config.raceDate, now, timezone)
    : null;
  return { fields, warning };
}

function getPlannerTimelineWarning(
  raceDate: string,
  now: Date,
  timezone: string,
): PlannerWarning | null {
  const weeks = getWeeksForDate(raceDate, now, timezone);
  const warning = getNewProgramTimelineWarning({ raceDate }, now);
  if (!warning || weeks >= 12) return null;
  return {
    kind: weeks < MIN_NORMAL_PLAN_WEEKS ? "very-compressed" : "compressed",
    title: warning.title,
    message: warning.message,
  };
}

export function buildFitnessOptions(): PlannerFitnessOption[] {
  return DISTANCE_OPTIONS.map((option) => {
    const range = getSliderRange(option.km);
    return {
      label: option.label,
      distanceKm: option.km,
      defaultSeconds: getDefaultGoalTime(option.km, "intermediate"),
      minSeconds: range.min,
      maxSeconds: range.max,
      stepSeconds: range.step,
    };
  });
}

export function canonicalPlannerConfig(config: PlannerConfig): string {
  return JSON.stringify({
    version: PLANNER_CONFIG_VERSION,
    raceDist: config.raceDist,
    raceDate: config.raceDate,
    currentAbilityDist: config.currentAbilityDist,
    currentAbilitySecs: config.currentAbilitySecs,
    runDays: [...new Set(config.runDays)].sort((a, b) => a - b),
    longRunDay: config.longRunDay,
    clubDay: config.clubDay,
    clubType: config.clubType,
    totalWeeks: config.totalWeeks,
    startKm: config.startKm,
    includeBasePhase: config.includeBasePhase,
    effortMetric: normalizeEffortMetric(config.effortMetric),
  });
}

export function classifyPlannerDirty(
  currentCanonical: string | null,
  storedCanonical: string | null,
): "none" | "target-only" | "structural" {
  if (!currentCanonical || !storedCanonical) return "structural";
  return classifyProgramConfigDirty(currentCanonical, storedCanonical);
}

export function parsePlannerPreviewRequest(value: unknown): PlannerPreviewRequest {
  if (!isRecord(value)) throw new PlannerError("PLANNER_CONFIG_INVALID", "Planner request must be an object");
  if (Object.keys(value).sort().join(",") !== "config,intent")
    throw new PlannerError("PLANNER_CONFIG_INVALID", "Planner request has unexpected fields");
  const intent = value.intent;
  if (intent !== "start" && intent !== "update")
    throw new PlannerError("PLANNER_CONFIG_INVALID", "Planner intent is invalid");
  return { intent, config: parsePlannerConfig(value.config) };
}

export function parsePlannerApplyRequest(value: unknown): PlannerApplyRequest {
  if (!isRecord(value)) throw new PlannerError("PLANNER_CONFIG_INVALID", "Planner request must be an object");
  if (Object.keys(value).sort().join(",") !== "config,intent,previewHash")
    throw new PlannerError("PLANNER_CONFIG_INVALID", "Planner request has unexpected fields");
  if (value.intent !== "start" && value.intent !== "update")
    throw new PlannerError("PLANNER_CONFIG_INVALID", "Planner intent is invalid");
  if (typeof value.previewHash !== "string" || !/^[0-9a-f]{64}$/.test(value.previewHash))
    throw new PlannerError("PLANNER_CONFIG_INVALID", "Preview hash is invalid");
  return {
    intent: value.intent,
    config: parsePlannerConfig(value.config),
    previewHash: value.previewHash,
  };
}

function parsePlannerConfig(value: unknown): PlannerConfig {
  if (!isRecord(value)) throw new PlannerError("PLANNER_CONFIG_INVALID", "Planner config must be an object");
  if (Object.keys(value).sort().join(",") !== [...CONFIG_KEYS].sort().join(","))
    throw new PlannerError("PLANNER_CONFIG_INVALID", "Planner config has unexpected or missing fields");
  const runDays = value.runDays;
  if (!Array.isArray(runDays)) throw new PlannerError("PLANNER_CONFIG_INVALID", "Run days are invalid");
  const config: PlannerConfig = {
    raceName: value.raceName as string,
    raceDist: value.raceDist as number,
    raceDate: value.raceDate as string,
    currentAbilityDist: value.currentAbilityDist as number,
    currentAbilitySecs: value.currentAbilitySecs as number,
    runDays: runDays as PlannerWeekday[],
    longRunDay: value.longRunDay as PlannerWeekday,
    clubDay: value.clubDay as PlannerWeekday | null,
    clubType: value.clubType as PlannerClubType | null,
    totalWeeks: value.totalWeeks as number,
    startKm: value.startKm as number,
    includeBasePhase: value.includeBasePhase as boolean,
    effortMetric: value.effortMetric as EffortMetric,
  };
  if (
    typeof config.raceName !== "string" ||
    !isFiniteNumber(config.raceDist) ||
    !dateIsValid(config.raceDate) ||
    !isFiniteNumber(config.currentAbilityDist) ||
    !isFiniteNumber(config.currentAbilitySecs) ||
    !runDays.every(isWeekday) ||
    !isWeekday(config.longRunDay) ||
    (config.clubDay !== null && !isWeekday(config.clubDay)) ||
    (config.clubType !== null && !isClubType(config.clubType)) ||
    !isFiniteNumber(config.totalWeeks) ||
    !isFiniteNumber(config.startKm) ||
    typeof config.includeBasePhase !== "boolean" ||
    !["pace", "hr", "feel"].includes(config.effortMetric)
  ) {
    throw new PlannerError("PLANNER_CONFIG_INVALID", "Planner config contains invalid values");
  }
  return config;
}

function categoryFromEvent(event: WorkoutEvent | CalendarEvent): PlannerPreviewWorkout["category"] {
  if ("category" in event) return event.category;
  const externalId = "external_id" in event ? event.external_id : "";
  if (externalId.startsWith("long-")) return "long";
  if (externalId.startsWith("speed-") || externalId.startsWith("interval-")) return "interval";
  if (externalId.startsWith("race-")) return "race";
  if (/^(easy|club)-/.test(externalId)) return externalId.startsWith("easy-") ? "easy" : "other";
  return "other";
}

export function projectWorkout(
  event: WorkoutEvent,
  week: number,
  metrics: ResolvedWorkoutMetrics,
): PlannerPreviewWorkout {
  return {
    key: event.external_id,
    week,
    date: format(event.start_date_local, "yyyy-MM-dd"),
    name: event.name,
    category: categoryFromEvent(event),
    distanceKm: metrics.distance?.km ?? event.distance ?? null,
    durationMinutes: metrics.duration?.minutes ?? null,
    fuelRateGPerHour: event.fuelRate ?? null,
  };
}

export function summarizePreview(
  config: PlannerConfig,
  workouts: PlannerPreviewWorkout[],
): Pick<PlannerPreview, "summary" | "weeks"> {
  const raceWeekMonday = startOfWeek(parseISO(config.raceDate), { weekStartsOn: 1 });
  const planStart = addWeeks(raceWeekMonday, -(config.totalWeeks - 1));
  const byWeek = new Map<number, PlannerPreviewWorkout[]>();
  for (const workout of workouts) {
    const rows = byWeek.get(workout.week) ?? [];
    rows.push(workout);
    byWeek.set(workout.week, rows);
  }
  const weeks = Array.from({ length: config.totalWeeks }, (_, index) => {
    const week = index + 1;
    const rows = byWeek.get(week) ?? [];
    return {
      week,
      startsOn: format(addWeeks(planStart, index), "yyyy-MM-dd"),
      distanceKm: Math.round(rows.reduce((sum, row) => sum + (row.distanceKm ?? 0), 0) * 10) / 10,
      workoutCount: rows.length,
    };
  });
  return {
    summary: {
      workoutCount: workouts.length,
      planWeeks: config.totalWeeks,
      firstWorkoutDate: workouts[0]?.date ?? null,
      raceDate: config.raceDate,
      totalDistanceKm: Math.round(weeks.reduce((sum, week) => sum + week.distanceKm, 0) * 10) / 10,
    },
    weeks,
  };
}

export function getPlannerWarning(
  config: PlannerConfig,
  now = new Date(),
  timezone = "Europe/Stockholm",
): PlannerWarning | null {
  return getPlannerTimelineWarning(config.raceDate, now, timezone);
}

export function plannerConfigKeyFromSettings(settings: UserSettings): string | null {
  const config = plannerConfigFromSettings(settings);
  return config ? canonicalPlannerConfig(config) : buildProgramConfigKeyFromSettings(settings);
}

export function hashPlannerConfig(config: PlannerConfig): string {
  return createHash("sha256").update(canonicalPlannerConfig(config)).digest("hex");
}
