import { format, subDays, addDays, startOfDay, differenceInYears, parseISO } from "date-fns";
import type { CalendarEvent, WorkoutCategory } from "./types";
import { summarizeBGModel } from "./bgModel";
import type { BGResponseModel } from "./bgModel";
import type { FitnessInsights } from "./fitness";
import type { BGReading } from "./cgm";
import type { RunBGContext } from "./runBGContext";
import type { PaceTable } from "./types";
import { buildZoneBlock, buildProfileLine } from "./zoneText";
import { formatPace } from "./format";
import { formatRunLine } from "./runLine";
import type { RunForFloorAnalysis } from "./personalHypoFloor";
import { CONSENSUS_LINE, buildPersonalHypoFloorLine } from "./preRunBgCopy";

interface CoachContext {
  phaseInfo: { name: string; week: number; progress: number };
  insights: FitnessInsights | null;
  bgModel: BGResponseModel | null;
  events: CalendarEvent[];
  lthr?: number;
  maxHr?: number;
  hrZones: number[];
  paceTable?: PaceTable;
  currentBG?: number | null;
  trendSlope?: number | null;
  trendArrow?: string | null;
  lastUpdate?: Date | null;
  readings?: BGReading[];
  runBGContexts?: Map<string, RunBGContext>;
  profile?: {
    dob?: string;
    weightKg?: number;
    heightCm?: number;
    t1dSinceYear?: number;
    pumpModel?: string;
    cgmModel?: string;
    loopSystem?: string;
    pumpDuringRuns?: "on" | "off" | "mixed";
    vo2max?: number;
    thresholdPaceMinPerKm?: number;
  };
  race?: {
    name?: string;
    distanceKm?: number;
    date?: string;
  };
  derived?: {
    longestRun?: { distanceKm: number; name: string; dateISO: string };
    volume?: { runs7d: number; runs28d: number };
    earliestRunDate?: string;
  };
  pastRuns?: RunForFloorAnalysis[];
}

function buildActivityBGMap(bgModel: BGResponseModel | null): Map<string, { startBG: number; avgRate: number; samples: number; entrySlope: number | null }> {
  const map = new Map<string, { startBG: number; rates: number[]; entrySlope: number | null }>();
  if (!bgModel) return new Map();

  for (const obs of bgModel.observations) {
    let entry = map.get(obs.activityId);
    if (!entry) {
      entry = { startBG: obs.startBG, rates: [], entrySlope: obs.entrySlope };
      map.set(obs.activityId, entry);
    }
    entry.rates.push(obs.bgRate);
  }

  const result = new Map<string, { startBG: number; avgRate: number; samples: number; entrySlope: number | null }>();
  for (const [id, entry] of map) {
    const avgRate = entry.rates.reduce((a, b) => a + b, 0) / entry.rates.length;
    result.set(id, { startBG: entry.startBG, avgRate, samples: entry.rates.length, entrySlope: entry.entrySlope });
  }
  return result;
}

function summarizeCompletedWorkouts(
  events: CalendarEvent[],
  bgModel: BGResponseModel | null,
  runBGContexts?: Map<string, RunBGContext>,
): string {
  const now = new Date();
  const cutoff = subDays(startOfDay(now), 14);

  const completed = events
    .filter((e) => e.type === "completed" && e.date >= cutoff && e.date <= now)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 10);

  if (completed.length === 0) return "No completed workouts in the last 14 days.";

  const bgMap = buildActivityBGMap(bgModel);

  return completed
    .map((e) => {
      const actId = e.activityId ?? e.id.replace("activity-", "");
      return formatRunLine(
        e,
        { date: true, name: true, category: true, distance: true, duration: true, pace: true, avgHr: true, maxHr: true, load: true, fuelRate: true, carbsIngested: true, preRunCarbs: true, hrZones: true, feedback: true },
        {
          bgStartAndRate: bgMap.get(actId),
          runBGContext: runBGContexts?.get(actId),
        },
      );
    })
    .join("\n");
}

export function summarizeRecoveryPatterns(
  runBGContexts?: Map<string, RunBGContext>,
): string {
  if (!runBGContexts || runBGContexts.size === 0) {
    return "No post-run recovery data available yet.";
  }

  const byCategory = new Map<WorkoutCategory, { drops: number[]; nadirs: number[]; hypos: number; total: number }>();

  for (const ctx of runBGContexts.values()) {
    if (!ctx.post) continue;

    let entry = byCategory.get(ctx.category);
    if (!entry) {
      entry = { drops: [], nadirs: [], hypos: 0, total: 0 };
      byCategory.set(ctx.category, entry);
    }

    entry.drops.push(ctx.post.recoveryDrop30m);
    entry.nadirs.push(ctx.post.nadirPostRun);
    if (ctx.post.postRunHypo) entry.hypos++;
    entry.total++;
  }

  if (byCategory.size === 0) {
    return "No post-run recovery data available yet.";
  }

  const lines: string[] = [];
  for (const cat of ["easy", "long", "interval"] as WorkoutCategory[]) {
    const entry = byCategory.get(cat);
    if (!entry) continue;

    const avgDrop = entry.drops.reduce((a, b) => a + b, 0) / entry.drops.length;
    const avgNadir = entry.nadirs.reduce((a, b) => a + b, 0) / entry.nadirs.length;
    lines.push(
      `- ${cat}: avg 30m recovery ${avgDrop >= 0 ? "+" : ""}${avgDrop.toFixed(1)} mmol/L, avg lowest post-run ${avgNadir.toFixed(1)}, ${entry.hypos}/${entry.total} post-hypos${entry.hypos > 0 ? " (!)" : ""}`,
    );
  }

  return lines.join("\n");
}

function summarizeUpcomingWorkouts(events: CalendarEvent[]): string {
  const today = startOfDay(new Date());
  const horizon = addDays(today, 14);

  const planned = events
    .filter((e) => e.type === "planned" && e.date > today && e.date <= horizon)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 10);

  if (planned.length === 0) return "No planned workouts in the next 14 days.";

  return planned
    .map((e) => {
      const parts = [format(e.date, "yyyy-MM-dd"), e.name];
      parts.push(`(${e.category})`);
      if (e.fuelRate) parts.push(`fuel ${e.fuelRate}g/h`);
      return `- ${parts.join(" | ")}`;
    })
    .join("\n");
}

function formatClockTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function summarizeLiveBG(ctx: CoachContext): string {
  if (ctx.currentBG == null || ctx.lastUpdate == null) {
    return "No live CGM data available right now.";
  }
  const now = Date.now();
  const ageMin = Math.round((now - ctx.lastUpdate.getTime()) / 60000);
  if (ageMin > 15) {
    return `Last reading: ${ctx.currentBG.toFixed(1)} mmol/L (${ageMin}m ago — stale, sensor may be offline).`;
  }
  const lines: string[] = [];
  const parts = [`Current BG: ${ctx.currentBG.toFixed(1)} mmol/L`];
  if (ctx.trendArrow) parts.push(`Trend: ${ctx.trendArrow}`);
  if (ctx.trendSlope != null) {
    parts.push(`Rate: ${ctx.trendSlope > 0 ? "+" : ""}${ctx.trendSlope.toFixed(3)} mmol/L per min`);
  }
  parts.push(`(${ageMin < 1 ? "just now" : `${ageMin}m ago`})`);
  lines.push(parts.join(" | "));

  // Last 30 min of readings
  if (ctx.readings && ctx.readings.length > 0) {
    const cutoff = now - 30 * 60 * 1000;
    const recent = ctx.readings.filter((r) => r.ts >= cutoff).sort((a, b) => a.ts - b.ts);
    if (recent.length >= 2) {
      lines.push("Last 30 min readings:");
      lines.push(recent.map((r) => `${formatClockTime(r.ts)} ${r.mmol.toFixed(1)}`).join(" → "));
      const delta = recent[recent.length - 1].mmol - recent[0].mmol;
      lines.push(`Net change: ${delta > 0 ? "+" : ""}${delta.toFixed(1)} mmol/L over ${Math.round((recent[recent.length - 1].ts - recent[0].ts) / 60000)}min`);
    }
  }

  return lines.join("\n");
}

function summarizeFitness(insights: FitnessInsights | null): string {
  if (!insights) return "Fitness data not loaded.";
  return [
    `CTL (fitness): ${insights.currentCtl} | ATL (fatigue): ${insights.currentAtl} | TSB (form): ${insights.currentTsb}`,
    `Form zone: ${insights.formZoneLabel} | CTL trend (28d): ${insights.ctlTrend > 0 ? "+" : ""}${insights.ctlTrend}`,
    `Peak CTL: ${insights.peakCtl} (${insights.peakCtlDate}) | Ramp rate: ${insights.rampRate}/week`,
    `Last 7d: ${insights.totalActivities7d} runs, load ${insights.totalLoad7d} | Last 28d: ${insights.totalActivities28d} runs, load ${insights.totalLoad28d}`,
  ].join("\n");
}

function buildRoleLine(race?: CoachContext["race"]): string {
  const base = "You are the AI running coach inside Springa, a training app for a Type 1 Diabetic runner.";
  if (!race?.name) return base;

  const distancePart = race.distanceKm ? ` ${race.distanceKm}km` : "";
  const datePart = race.date ? ` (${race.date})` : "";
  return `${base} Preparing for ${race.name}${distancePart}${datePart}.`;
}

function computeAge(dob?: string): number | null {
  if (!dob) return null;
  try {
    const years = differenceInYears(new Date(), parseISO(dob));
    return years > 0 && years < 150 ? years : null;
  } catch {
    return null;
  }
}

function buildRunnerProfileSection(
  profile: CoachContext["profile"],
  derived: CoachContext["derived"],
  pastRuns: RunForFloorAnalysis[] | undefined,
): string {
  const bullets: string[] = [];

  // Demographics: age + body
  const age = computeAge(profile?.dob);
  const demographics: string[] = [];
  if (age != null) demographics.push(`Age ${age}`);
  if (profile?.weightKg != null) demographics.push(`${profile.weightKg}kg`);
  if (profile?.heightCm != null) demographics.push(`${profile.heightCm}cm`);
  if (demographics.length > 0) bullets.push(`- ${demographics.join(", ")}.`);

  // Performance metrics
  const perf: string[] = [];
  if (profile?.thresholdPaceMinPerKm != null) {
    perf.push(`LT Pace ${formatPace(profile.thresholdPaceMinPerKm)}/km`);
  }
  if (profile?.vo2max != null) perf.push(`VO2max ${profile.vo2max}`);
  if (perf.length > 0) bullets.push(`- ${perf.join(", ")}.`);

  // Training history
  const history: string[] = [];
  if (derived?.earliestRunDate) {
    history.push(`Running since ${derived.earliestRunDate}`);
  }
  if (derived?.longestRun) {
    history.push(`Longest run: ${derived.longestRun.distanceKm}km on ${derived.longestRun.dateISO} (${derived.longestRun.name})`);
  }
  if (derived?.volume) {
    history.push(`Recent volume: ${derived.volume.runs7d}/${derived.volume.runs28d} runs in last 7d/28d`);
  }
  if (history.length > 0) bullets.push(`- ${history.join(". ")}.`);

  // T1D + equipment
  const t1dParts: string[] = [];
  const sinceClause = profile?.t1dSinceYear ? ` (since ${profile.t1dSinceYear})` : "";
  t1dParts.push(`Type 1 Diabetic${sinceClause}.`);
  const equipment: string[] = [];
  if (profile?.pumpModel) equipment.push(`${profile.pumpModel} pump`);
  if (profile?.cgmModel) equipment.push(profile.cgmModel);
  if (profile?.loopSystem) equipment.push(profile.loopSystem);
  if (equipment.length > 0) {
    t1dParts.push(`${equipment.join(" + ")}.`);
  }
  bullets.push(`- ${t1dParts.join(" ")}`);

  // Pump-during-runs preference
  if (profile?.pumpDuringRuns) {
    bullets.push(`- Pump during runs: ${profile.pumpDuringRuns}.`);
  }

  // Pre-exercise BG: consensus range + personal hypo signal (when enough data)
  bullets.push(`- ${CONSENSUS_LINE}`);
  const personalFloorLine = buildPersonalHypoFloorLine(pastRuns);
  if (personalFloorLine) {
    bullets.push(`- ${personalFloorLine}`);
  }

  if (bullets.length === 0) return "";
  return `## Runner Profile\n${bullets.join("\n")}\n\n`;
}

function buildPaceZonesSection(ctx: CoachContext): string {
  if (ctx.lthr == null || ctx.maxHr == null) {
    return "## Pace Zones\nHR zones not yet calibrated — do not reference HR targets.\n";
  }
  return `## Pace Zones\n${buildProfileLine(ctx.lthr, ctx.maxHr)}\n${buildZoneBlock(ctx.lthr, ctx.maxHr, ctx.paceTable, ctx.hrZones)}\n`;
}

export function buildSystemPrompt(ctx: CoachContext): string {
  const today = format(new Date(), "yyyy-MM-dd");

  const recoverySection = ctx.runBGContexts && ctx.runBGContexts.size > 0
    ? `\n\n## Post-Run Recovery Patterns\n${summarizeRecoveryPatterns(ctx.runBGContexts)}`
    : "";

  const roleLine = buildRoleLine(ctx.race);
  const runnerProfileSection = buildRunnerProfileSection(ctx.profile, ctx.derived, ctx.pastRuns);
  const paceZonesSection = buildPaceZonesSection(ctx);

  return `${roleLine}

${runnerProfileSection}${paceZonesSection}
## Current Status (${today})
- Training phase: ${ctx.phaseInfo.name} (week ${ctx.phaseInfo.week}, ${Math.round(ctx.phaseInfo.progress)}% through plan)

## Fitness Load
${summarizeFitness(ctx.insights)}

## Live Blood Glucose
${summarizeLiveBG(ctx)}

## Blood Glucose Model (historical)
${summarizeBGModel(ctx.bgModel)}${recoverySection}

## Recent Completed Workouts (last 14 days)
${summarizeCompletedWorkouts(ctx.events, ctx.bgModel, ctx.runBGContexts)}

## Upcoming Planned Workouts (next 14 days)
${summarizeUpcomingWorkouts(ctx.events)}

## Guidelines
- Prioritize blood glucose management advice. Hypoglycemia is the #1 risk.
- Use metric units (km, mmol/L, g/h, bpm).
- Keep answers concise and actionable — the user reads this on a phone.
- Reference specific workout data when relevant (dates, paces, HR, carbs).
- If asked about fueling, factor in the BG model data and suggest specific g/h rates.
- Speak Swedish if the user writes in Swedish; otherwise use English.
- Never invent workout data — only reference what's provided above.`;
}
