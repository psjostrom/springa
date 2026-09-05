import { addDays, differenceInCalendarWeeks, format, parseISO, startOfDay, startOfWeek } from "date-fns";
import { createHash, timingSafeEqual } from "node:crypto";
import { buildBGModelFromCached, type BGResponseModel } from "./bgModel";
import { getActivityStreams } from "./activityStreamsDb";
import { getUserCredentials } from "./credentials";
import {
  deleteEvent,
  fetchFutureWorkoutEvents,
  findStaleSpringaWorkoutEvents,
  upsertWorkoutEvents,
} from "./intervalsApi";
import {
  buildFuturePlannedEffortPatches,
  resolveBulkEffortMetricTarget,
  type EffortMetricEventPatch,
  type EffortMetricPatchFailure,
} from "./applyEffortMetricToEvents";
import {
  buildPlannerDefaults,
  buildFitnessOptions,
  canonicalPlannerConfig,
  classifyPlannerDirty,
  getPlannerWarning,
  maxGeneratedPlanWeek,
  plannerConfigFromSettings,
  projectWorkout,
  resolvePlannerConfig,
  summarizePreview,
  validatePlannerConfig,
  PlannerError,
  type PlannerConfig,
  type PlannerApplyRequest,
  type PlannerPreview,
  type PlannerPreviewRequest,
  type PlannerState,
} from "./plannerConfig";
import { getPlannerMetadata, savePlannerMetadata, type PlannerMetadata } from "./plannerMetadata";
import { PlanContextError, resolvePlanContext } from "./planContext";
import { getCurrentFuelRate } from "./fuelRate";
import { categoryFromExternalId } from "./paceInsight";
import type { CalendarEvent, IntervalsEvent, WorkoutEvent } from "./types";
import { getWorkoutCategory } from "./constants";
import { resolveWorkoutMetrics } from "./workoutMath";
import {
  buildGoogleCalendarEventPayload,
  clearFutureGoogleEvents,
  findGoogleEvent,
  getGoogleCalendarContext,
  syncEventsToGoogle,
  updateGoogleEvent,
  type SyncEvent,
} from "./googleCalendar";
import {
  getUserSettings,
  saveUserSettings,
  type UserSettings,
  type UserSettingsUpdate,
} from "./settings";
import { getUserWorkoutEstimationContext } from "./workoutEstimationContext";

export interface PlannerPreviewHashInput {
  normalizedConfig: string;
  action: "replace-plan" | "update-targets";
  generated?: Record<string, unknown>[];
  patches?: Record<string, unknown>[];
  staleEventIds: number[];
  previousGeneratedConfig: string | null;
}

export interface PlannerPreviewBuild {
  response: PlannerPreview;
  operations:
    | {
        action: "replace-plan";
        generated: WorkoutEvent[];
        staleEventIds: number[];
      }
    | {
        action: "update-targets";
        patches: EffortMetricEventPatch[];
        events: WorkoutEvent[];
        buildFailures: EffortMetricPatchFailure[];
      };
  normalizedConfig: PlannerConfig;
  generatedSnapshot: string;
  previousMetadata: PlannerMetadata;
}

export interface PlannerApplyResponse {
  action: "replace-plan" | "update-targets";
  appliedWorkoutCount: number;
  warnings: PlannerApplyWarning[];
  state: PlannerState;
}

interface PlannerApplyWarning {
  code: "STALE_WORKOUTS_NOT_REMOVED" | "GOOGLE_CALENDAR_SYNC_FAILED";
  message: string;
}

const CONSTRAINTS: PlannerState["constraints"] = {
  raceDistanceKm: { min: 1, max: 100 },
  startDistanceKm: { min: 2, max: 42 },
  minimumWeeks: 8,
  minimumNormalWeeks: 10,
  recommendedWeeks: 12,
  basePhaseMinimumWeeks: 11,
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashPlannerPreview(input: PlannerPreviewHashInput): string {
  return createHash("sha256").update(canonicalJson(input)).digest("hex");
}

function mapContextError(error: unknown): PlannerError {
  if (error instanceof PlanContextError) {
    if (error.code === "HR_ZONES_REQUIRED") {
      return new PlannerError("HR_ZONES_REQUIRED", error.message);
    }
    return new PlannerError("INTERVALS_UPSTREAM_ERROR", error.message);
  }
  if (error instanceof PlannerError) return error;
  return new PlannerError(
    "INTERVALS_UPSTREAM_ERROR",
    error instanceof Error ? error.message : String(error),
  );
}

async function requireIntervals(email: string): Promise<{
  intervalsApiKey: string;
  timezone: string;
}> {
  const credentials = await getUserCredentials(email);
  if (!credentials?.intervalsApiKey) {
    throw new PlannerError(
      "INTERVALS_NOT_CONNECTED",
      "Connect Intervals.icu before using Planner.",
    );
  }
  return {
    intervalsApiKey: credentials.intervalsApiKey,
    timezone: credentials.timezone,
  };
}

function isOwnedFutureWorkout(event: IntervalsEvent): boolean {
  return (
    event.category === "WORKOUT" &&
    event.type === "Run" &&
    event.paired_activity_id == null &&
    categoryFromExternalId(event.external_id) !== null
  );
}

async function fetchOwnedFutureEvents(
  apiKey: string,
  now: Date,
  raceDate?: string,
): Promise<IntervalsEvent[]> {
  const newest = raceDate
    ? new Date(Math.max(addDays(now, 365).getTime(), addDays(parseISO(raceDate), 1).getTime()))
    : addDays(now, 365);
  const events = await fetchFutureWorkoutEvents(apiKey, startOfDay(now), newest);
  return events.filter(isOwnedFutureWorkout);
}

async function fetchOwnedFutureEventsMapped(
  apiKey: string,
  now: Date,
  raceDate?: string,
): Promise<IntervalsEvent[]> {
  try {
    return await fetchOwnedFutureEvents(apiKey, now, raceDate);
  } catch (error) {
    throw mapContextError(error);
  }
}

function resolvePlannerConfigForEvents(
  config: PlannerConfig,
  intent: PlannerPreviewRequest["intent"],
  metadata: PlannerMetadata,
  events: IntervalsEvent[],
  now: Date,
  timezone: string,
) {
  const generatedWeek = intent === "update"
    ? maxGeneratedPlanWeek(events.map((event) => event.external_id), config.raceDate)
    : null;
  const raceWeekOffset = (event: IntervalsEvent) => differenceInCalendarWeeks(
    parseISO(config.raceDate),
    parseISO(event.start_date_local),
    { weekStartsOn: 1 },
  );
  const raceOnlyFinalWeek = generatedWeek !== null &&
    events.some((event) => event.external_id === `race-${config.raceDate}`) &&
    !events.some((event) => maxGeneratedPlanWeek([event.external_id], config.raceDate) !== null && raceWeekOffset(event) === 0) &&
    events.some((event) => maxGeneratedPlanWeek([event.external_id], config.raceDate) === generatedWeek && raceWeekOffset(event) === 1);
  const fallbackTotalWeeks = raceOnlyFinalWeek ? generatedWeek + 1 : generatedWeek;
  return resolvePlannerConfig(
    config,
    intent,
    metadata.generatedPlanConfig,
    now,
    timezone,
    fallbackTotalWeeks,
  );
}

function weeksToGo(raceDate: string | undefined, now: Date, timezone: string): number | null {
  if (!raceDate) return null;
  const today = parseISO(new Intl.DateTimeFormat("sv-SE", { timeZone: timezone }).format(now));
  return Math.max(0, differenceInCalendarWeeks(parseISO(raceDate), today, { weekStartsOn: 1 }) + 1);
}

function fuelRateSource(
  category: "easy" | "long" | "interval",
  model: BGResponseModel | null,
): "learned" | "default" {
  if (!model) return "default";
  const hasTarget = model.targetFuelRates.some((target) => target.category === category);
  const hasAverage = model.categories[category]?.avgFuelRate != null;
  return hasTarget || hasAverage ? "learned" : "default";
}

function buildFuelRates(
  model: BGResponseModel | null,
  diabetesMode: boolean | undefined,
): PlannerState["fuelRates"] {
  if (!diabetesMode) return null;
  return {
    easy: { gramsPerHour: getCurrentFuelRate("easy", model, true), source: fuelRateSource("easy", model) },
    long: { gramsPerHour: getCurrentFuelRate("long", model, true), source: fuelRateSource("long", model) },
    interval: { gramsPerHour: getCurrentFuelRate("interval", model, true), source: fuelRateSource("interval", model) },
  };
}

function plannerSync(
  currentConfig: PlannerConfig | null,
  metadata: PlannerMetadata,
  active: boolean,
): PlannerState["plan"]["sync"] {
  if (!active) return null;
  if (!metadata.generatedPlanConfig) return { status: "unknown", dirtyKind: null };
  const kind = classifyPlannerDirty(
    currentConfig ? canonicalPlannerConfig(currentConfig) : null,
    metadata.generatedPlanConfig,
  );
  if (kind !== "none") return { status: "dirty", dirtyKind: kind };
  if (metadata.dirty) return { status: "unknown", dirtyKind: null };
  return { status: "synced", dirtyKind: null };
}

export async function getPlannerState(
  email: string,
  now = new Date(),
): Promise<PlannerState> {
  const credentials = await requireIntervals(email);
  const settings = await getUserSettings(email);
  const metadata = await getPlannerMetadata(email);
  const currentConfig = plannerConfigFromSettings(settings);
  const newProgramDraft = buildPlannerDefaults(settings, now);
  const ownedEvents = await fetchOwnedFutureEventsMapped(
    credentials.intervalsApiKey,
    now,
    currentConfig?.raceDate,
  );
  const resolution = currentConfig
    ? resolvePlannerConfigForEvents(
        currentConfig,
        "update",
        metadata,
        ownedEvents,
        now,
        credentials.timezone,
      )
    : null;
  const resolvedCurrentConfig = resolution?.anchored ? resolution.config : currentConfig;

  let bgModel: BGResponseModel | null = null;
  if (settings.diabetesMode) {
    const cached = await getActivityStreams(email);
    if (cached.length > 0) bgModel = buildBGModelFromCached(cached);
  }
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: credentials.timezone }).format(now);
  const isComplete = Boolean(
    currentConfig?.raceDate &&
    currentConfig.raceDate < today &&
    ownedEvents.length === 0,
  );
  const active = ownedEvents.length > 0;

  return {
    currentConfig: resolvedCurrentConfig,
    newProgramDraft,
    fitnessOptions: buildFitnessOptions(),
    constraints: CONSTRAINTS,
    plan: {
      status: active ? "active" : isComplete ? "complete" : "none",
      sync: plannerSync(resolvedCurrentConfig, metadata, active),
      weeksToGo: isComplete ? null : weeksToGo(resolvedCurrentConfig?.raceDate, now, credentials.timezone),
      futureWorkoutCount: ownedEvents.length,
    },
    fuelRates: buildFuelRates(bgModel, settings.diabetesMode),
  };
}

function toCalendarEvent(event: IntervalsEvent): CalendarEvent {
  const category = categoryFromExternalId(event.external_id) ?? getWorkoutCategory(event.name ?? "");
  return {
    id: `event-${event.id}`,
    date: parseISO(event.start_date_local),
    name: event.name ?? "",
    description: event.description ?? "",
    type: "planned",
    category,
    fuelRate: event.carbs_per_hour ?? null,
    distance: event.distance,
    duration: event.duration ?? event.elapsed_time,
  };
}

function weekForDate(date: Date, config: PlannerConfig): number {
  const planStart = addDays(
    startOfWeek(parseISO(config.raceDate), { weekStartsOn: 1 }),
    -7 * (config.totalWeeks - 1),
  );
  return differenceInCalendarWeeks(date, planStart, { weekStartsOn: 1 }) + 1;
}

function buildPreviewHashInput(
  build: Omit<PlannerPreviewBuild, "response" | "previousMetadata">,
  previousGeneratedConfig: string | null,
): PlannerPreviewHashInput {
  if (build.operations.action === "replace-plan") {
    return {
      normalizedConfig: build.generatedSnapshot,
      action: "replace-plan",
      generated: build.operations.generated
        .map((event) => ({
          external_id: event.external_id,
          start_date_local: format(event.start_date_local, "yyyy-MM-dd'T'HH:mm:ss"),
          name: event.name,
          description: event.description,
          fuelRate: event.fuelRate ?? null,
          type: event.type,
        }))
        .sort((a, b) => a.external_id.localeCompare(b.external_id)),
      staleEventIds: [...build.operations.staleEventIds].sort((a, b) => a - b),
      previousGeneratedConfig,
    };
  }
  return {
    normalizedConfig: build.generatedSnapshot,
    action: "update-targets",
    generated: build.operations.events
      .map((event) => ({
        external_id: event.external_id,
        start_date_local: format(event.start_date_local, "yyyy-MM-dd'T'HH:mm:ss"),
      }))
      .sort((a, b) => a.external_id.localeCompare(b.external_id)),
    patches: build.operations.patches
      .map((patch) => ({
        id: patch.id,
        numericId: patch.numericId,
        date: format(patch.date, "yyyy-MM-dd'T'HH:mm:ss"),
        name: patch.name,
        description: patch.description,
        fuelRate: patch.fuelRate ?? null,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    staleEventIds: [],
    previousGeneratedConfig,
  };
}

export async function buildPlannerPreview(
  email: string,
  request: PlannerPreviewRequest,
  now = new Date(),
): Promise<PlannerPreviewBuild> {
  const credentials = await requireIntervals(email);
  const metadata = await getPlannerMetadata(email);
  const ownedEvents = request.intent === "update"
    ? await fetchOwnedFutureEventsMapped(
        credentials.intervalsApiKey,
        now,
        request.config.raceDate,
      )
    : null;
  const validationHrContext = request.config.effortMetric === "hr"
    ? { lthr: 1, hrZones: [1, 2, 3, 4, 5] }
    : undefined;
  const resolution = resolvePlannerConfigForEvents(
    request.config,
    request.intent,
    metadata,
    ownedEvents ?? [],
    now,
    credentials.timezone,
  );
  const initialValidationConfig = resolution.anchored
    ? {
        ...request.config,
        totalWeeks: resolution.config.totalWeeks,
        includeBasePhase: resolution.config.includeBasePhase,
      }
    : request.config;
  const initialValidation = validatePlannerConfig(
    initialValidationConfig,
    now,
    credentials.timezone,
    validationHrContext,
    { allowShortTimeline: resolution.anchored },
  );
  if (Object.keys(initialValidation.fields).length > 0) {
    throw new PlannerError(
      "PLANNER_CONFIG_INVALID",
      "Planner config is invalid",
      initialValidation.fields,
    );
  }
  const normalizedConfig = resolution.config;
  const validation = validatePlannerConfig(
    normalizedConfig,
    now,
    credentials.timezone,
    validationHrContext,
    { allowShortTimeline: resolution.anchored },
  );
  if (Object.keys(validation.fields).length > 0) {
    throw new PlannerError(
      "PLANNER_CONFIG_INVALID",
      "Planner config is invalid",
      validation.fields,
    );
  }

  let context;
  try {
    context = await resolvePlanContext(email, credentials.intervalsApiKey, normalizedConfig);
  } catch (error) {
    throw mapContextError(error);
  }

  const action = request.intent === "start"
    ? "replace-plan"
    : classifyPlannerDirty(
        canonicalPlannerConfig(normalizedConfig),
        metadata.generatedPlanConfig,
      ) === "target-only"
      ? "update-targets"
      : "replace-plan";

  let operations: PlannerPreviewBuild["operations"];
  let workouts: PlannerPreview["workouts"];
  if (action === "replace-plan") {
    const generated = (await import("./workoutGenerators")).generatePlan(context.planConfig);
    const existing = ownedEvents ?? await fetchOwnedFutureEventsMapped(
      credentials.intervalsApiKey,
      now,
      normalizedConfig.raceDate,
    );
    const stale = findStaleSpringaWorkoutEvents(
      existing,
      new Set(generated.map((event) => event.external_id)),
    );
    operations = {
      action,
      generated,
      staleEventIds: stale.map((event) => event.id),
    };
    workouts = generated.map((event) =>
      projectWorkout(
        event,
        weekForDate(event.start_date_local, normalizedConfig),
        resolveWorkoutMetrics(event.description, event.fuelRate, context.estimationContext),
      ),
    );
  } else {
    const calendarEvents = (ownedEvents ?? []).map(toCalendarEvent);
    const target = resolveBulkEffortMetricTarget(
      normalizedConfig.effortMetric,
      metadata.generatedPlanConfig,
    );
    const patches = buildFuturePlannedEffortPatches(
      calendarEvents,
      target,
      {
        lthr: context.planConfig.lthr,
        hrZones: context.planConfig.hrZones,
        thresholdPace: context.estimationContext.thresholdPace,
      },
      now,
    );
    if (patches.failures.length > 0) {
      throw new PlannerError(
        "PLANNER_CONFIG_INVALID",
        "Some future workouts could not be re-emitted",
        undefined,
        { failures: patches.failures },
      );
    }
    operations = {
      action,
      patches: patches.patches,
      events: patches.patches.map((patch) => {
        const source = ownedEvents?.find((event) => event.id === patch.numericId);
        if (!source?.external_id) {
          throw new PlannerError(
            "PLANNER_CONFIG_INVALID",
            `Missing external id for ${patch.name}`,
          );
        }
        return {
          start_date_local: patch.date,
          name: patch.name,
          description: patch.description,
          external_id: source.external_id,
          type: "Run" as const,
          ...(patch.fuelRate != null ? { fuelRate: patch.fuelRate } : {}),
        };
      }),
      buildFailures: patches.failures,
    };
    workouts = patches.patches.map((patch) => {
      const category = categoryFromExternalId(ownedEvents?.find((event) => event.id === patch.numericId)?.external_id) ?? "other";
      const metrics = resolveWorkoutMetrics(patch.description, patch.fuelRate, context.estimationContext);
      return {
        key: patch.id,
        week: weekForDate(patch.date, normalizedConfig),
        date: format(patch.date, "yyyy-MM-dd"),
        name: patch.name,
        category,
        distanceKm: metrics.distance?.km ?? null,
        durationMinutes: metrics.duration?.minutes ?? null,
        fuelRateGPerHour: patch.fuelRate ?? null,
      };
    });
  }

  const generatedSnapshot = canonicalPlannerConfig(normalizedConfig);
  const summary = summarizePreview(normalizedConfig, workouts);
  const responseWithoutHash: PlannerPreview = {
    intent: request.intent,
    action,
    config: normalizedConfig,
    previewHash: "",
    warning: resolution.anchored
      ? null
      : validation.warning ?? getPlannerWarning(normalizedConfig, now, credentials.timezone),
    ...summary,
    workouts,
  };
  const buildWithoutResponse = {
    operations,
    normalizedConfig,
    generatedSnapshot,
  } as Omit<PlannerPreviewBuild, "response" | "previousMetadata">;
  const previewHash = hashPlannerPreview(
    buildPreviewHashInput(buildWithoutResponse, metadata.generatedPlanConfig),
  );
  return {
    response: { ...responseWithoutHash, previewHash },
    operations,
    normalizedConfig,
    generatedSnapshot,
    previousMetadata: metadata,
  };
}

function plannerSettingsFromConfig(config: PlannerConfig): UserSettingsUpdate {
  return {
    raceName: config.raceName,
    raceDist: config.raceDist,
    raceDate: config.raceDate,
    currentAbilityDist: config.currentAbilityDist,
    currentAbilitySecs: config.currentAbilitySecs,
    runDays: config.runDays,
    longRunDay: config.longRunDay,
    clubDay: config.clubDay,
    clubType: config.clubType,
    totalWeeks: config.totalWeeks,
    startKm: config.startKm,
    includeBasePhase: config.includeBasePhase,
    effortMetric: config.effortMetric,
  };
}

function plannerSettingsFromStored(settings: UserSettings): UserSettingsUpdate {
  return {
    raceName: settings.raceName ?? null,
    raceDist: settings.raceDist ?? null,
    raceDate: settings.raceDate ?? null,
    currentAbilityDist: settings.currentAbilityDist ?? null,
    currentAbilitySecs: settings.currentAbilitySecs ?? null,
    runDays: settings.runDays ?? null,
    longRunDay: settings.longRunDay ?? null,
    clubDay: settings.clubDay ?? null,
    clubType: settings.clubType ?? null,
    totalWeeks: settings.totalWeeks ?? null,
    startKm: settings.startKm ?? null,
    includeBasePhase: settings.includeBasePhase ?? null,
    effortMetric: settings.effortMetric ?? null,
  };
}

function timingSafeEqualHex(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) return false;
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function plannerSyncEvents(events: WorkoutEvent[]): SyncEvent[] {
  return events.map((event) => ({
    name: event.name,
    description: event.description,
    startLocal: format(event.start_date_local, "yyyy-MM-dd'T'HH:mm:ss"),
    fuelRate: event.fuelRate,
    distance: event.distance,
  }));
}

async function syncReplacementToGoogle(
  email: string,
  events: WorkoutEvent[],
): Promise<void> {
  const context = await getGoogleCalendarContext(email);
  if (!context) return;
  const settings = await getUserSettings(email);
  const estimationContext = await getUserWorkoutEstimationContext(email, null, settings);
  await clearFutureGoogleEvents(context.accessToken, context.calendarId, { strict: true });
  await syncEventsToGoogle(
    context.accessToken,
    context.calendarId,
    plannerSyncEvents(events),
    context.timezone,
    estimationContext,
    { strict: true },
  );
}

async function syncTargetToGoogle(
  email: string,
  patches: EffortMetricEventPatch[],
): Promise<void> {
  const context = await getGoogleCalendarContext(email);
  if (!context) return;
  const settings = await getUserSettings(email);
  const estimationContext = await getUserWorkoutEstimationContext(email, null, settings);
  for (const patch of patches) {
    const date = format(patch.date, "yyyy-MM-dd");
    const eventId = await findGoogleEvent(
      context.accessToken,
      context.calendarId,
      patch.previousName,
      date,
    );
    if (!eventId) continue;
    const event: SyncEvent = {
      name: patch.name,
      description: patch.description,
      startLocal: format(patch.date, "yyyy-MM-dd'T'HH:mm:ss"),
      fuelRate: patch.fuelRate ?? undefined,
    };
    await updateGoogleEvent(
      context.accessToken,
      context.calendarId,
      eventId,
      buildGoogleCalendarEventPayload(event, context.timezone, estimationContext),
    );
  }
}

async function syncGoogleWithWarning(
  sync: () => Promise<void>,
): Promise<PlannerApplyWarning | null> {
  try {
    await sync();
    return null;
  } catch (error) {
    console.error("[planner] Google Calendar sync failed", error);
    return {
      code: "GOOGLE_CALENDAR_SYNC_FAILED",
      message: "Google Calendar sync failed.",
    };
  }
}

async function restoreAfterUpsertFailure(
  email: string,
  previousSettings: UserSettings,
  metadata: PlannerMetadata,
): Promise<void> {
  try {
    await saveUserSettings(email, plannerSettingsFromStored(previousSettings), {
      plannerConfigDirty: metadata.dirty,
    });
    await savePlannerMetadata(email, metadata);
  } catch (error) {
    console.error("[planner] failed to restore after provider upload", error);
  }
}

async function applyReplacePlan(
  email: string,
  rebuilt: PlannerPreviewBuild,
  now: Date,
): Promise<PlannerApplyResponse> {
  if (rebuilt.operations.action !== "replace-plan") {
    throw new PlannerError("PLANNER_CONFIG_INVALID", "Planner apply action mismatch");
  }
  const credentials = await requireIntervals(email);
  const settings = await getUserSettings(email);
  const metadata = rebuilt.previousMetadata;
  const warnings: PlannerApplyWarning[] = [];

  await saveUserSettings(
    email,
    plannerSettingsFromConfig(rebuilt.normalizedConfig),
    { plannerConfigDirty: true },
  );

  try {
    await upsertWorkoutEvents(credentials.intervalsApiKey, rebuilt.operations.generated);
  } catch (error) {
    await restoreAfterUpsertFailure(email, settings, metadata);
    throw new PlannerError(
      "INTERVALS_UPSTREAM_ERROR",
      error instanceof Error ? error.message : String(error),
    );
  }

  const deleteFailures: { id: number; error: string }[] = [];
  for (const eventId of rebuilt.operations.staleEventIds) {
    try {
      await deleteEvent(credentials.intervalsApiKey, eventId);
    } catch (error) {
      deleteFailures.push({
        id: eventId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  try {
    await savePlannerMetadata(email, {
      generatedPlanConfig: rebuilt.generatedSnapshot,
      dirty: deleteFailures.length > 0,
    });
  } catch (error) {
    try {
      await savePlannerMetadata(email, {
        generatedPlanConfig: rebuilt.generatedSnapshot,
        dirty: true,
      });
    } catch (restoreError) {
      console.error("[planner] failed to mark plan dirty", restoreError);
    }
    throw new PlannerError(
      "PLANNER_STATE_FINALIZE_FAILED",
      error instanceof Error ? error.message : String(error),
    );
  }

  if (deleteFailures.length > 0) {
    warnings.push({
      code: "STALE_WORKOUTS_NOT_REMOVED",
      message: `Failed to remove ${deleteFailures.length} stale workout${deleteFailures.length === 1 ? "" : "s"}.`,
    });
  }
  const googleWarning = await syncGoogleWithWarning(() =>
    syncReplacementToGoogle(email, rebuilt.operations.action === "replace-plan" ? rebuilt.operations.generated : []),
  );
  if (googleWarning) warnings.push(googleWarning);

  return {
    action: "replace-plan",
    appliedWorkoutCount: rebuilt.operations.generated.length,
    warnings,
    state: await getPlannerState(email, now),
  };
}

async function applyTargetUpdates(
  email: string,
  rebuilt: PlannerPreviewBuild,
  now: Date,
): Promise<PlannerApplyResponse> {
  if (rebuilt.operations.action !== "update-targets") {
    throw new PlannerError("PLANNER_CONFIG_INVALID", "Planner apply action mismatch");
  }
  const patches = rebuilt.operations.patches;
  const credentials = await requireIntervals(email);
  const settings = await getUserSettings(email);
  const warnings: PlannerApplyWarning[] = [];
  await saveUserSettings(
    email,
    plannerSettingsFromConfig(rebuilt.normalizedConfig),
    { plannerConfigDirty: true },
  );

  try {
    await upsertWorkoutEvents(credentials.intervalsApiKey, rebuilt.operations.events);
  } catch (error) {
    await restoreAfterUpsertFailure(email, settings, rebuilt.previousMetadata);
    throw new PlannerError(
      "INTERVALS_UPSTREAM_ERROR",
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    await savePlannerMetadata(email, {
      generatedPlanConfig: rebuilt.generatedSnapshot,
      dirty: false,
    });
  } catch (error) {
    try {
      await savePlannerMetadata(email, {
        generatedPlanConfig: rebuilt.previousMetadata.generatedPlanConfig,
        dirty: true,
      });
    } catch (restoreError) {
      console.error("[planner] failed to mark target update dirty", restoreError);
    }
    throw new PlannerError(
      "PLANNER_STATE_FINALIZE_FAILED",
      error instanceof Error ? error.message : String(error),
    );
  }

  const googleWarning = await syncGoogleWithWarning(() =>
    syncTargetToGoogle(email, patches),
  );
  if (googleWarning) warnings.push(googleWarning);
  return {
    action: "update-targets",
    appliedWorkoutCount: patches.length,
    warnings,
    state: await getPlannerState(email, now),
  };
}

export async function applyPlannerPreview(
  email: string,
  request: PlannerApplyRequest,
  now = new Date(),
): Promise<PlannerApplyResponse> {
  const rebuilt = await buildPlannerPreview(email, request, now);
  if (!timingSafeEqualHex(request.previewHash, rebuilt.response.previewHash)) {
    throw new PlannerError("PLAN_PREVIEW_STALE", "Preview changed. Preview the plan again.");
  }
  return rebuilt.operations.action === "replace-plan"
    ? applyReplacePlan(email, rebuilt, now)
    : applyTargetUpdates(email, rebuilt, now);
}
