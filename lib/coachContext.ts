import { format, subDays, addDays, startOfDay } from "date-fns";
import type { CalendarEvent, WorkoutCategory } from "./types";
import type { BGResponseModel } from "./bgModel";
import type { FitnessInsights } from "./fitness";
import type { XdripReading } from "./xdrip";
import type { RunBGContext } from "./runBGContext";
import type { RunFeedbackRecord } from "./feedbackDb";
import type { PaceTable } from "./types";
import { DEFAULT_LTHR, DEFAULT_MAX_HR } from "./constants";
import { buildZoneBlock, buildProfileLine } from "./zoneText";
import { formatRunLine } from "./runLine";

interface CoachContext {
  phaseInfo: { name: string; week: number; progress: number };
  insights: FitnessInsights | null;
  bgModel: BGResponseModel | null;
  events: CalendarEvent[];
  raceDate?: string;
  lthr?: number;
  maxHr?: number;
  hrZones?: number[];
  paceTable?: PaceTable;
  currentBG?: number | null;
  trendSlope?: number | null;
  trendArrow?: string | null;
  lastUpdate?: Date | null;
  readings?: XdripReading[];
  runBGContexts?: Map<string, RunBGContext>;
  recentFeedback?: RunFeedbackRecord[];
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
  feedbackByActivity?: Map<string, RunFeedbackRecord>,
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
        { date: true, name: true, category: true, distance: true, duration: true, pace: true, avgHr: true, maxHr: true, load: true, fuelRate: true, carbsIngested: true, hrZones: true },
        {
          bgStartAndRate: bgMap.get(actId),
          runBGContext: runBGContexts?.get(actId),
          feedback: feedbackByActivity?.get(actId),
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

function summarizeUnmatchedFeedback(
  events: CalendarEvent[],
  recentFeedback?: RunFeedbackRecord[],
): string {
  if (!recentFeedback || recentFeedback.length === 0) return "";

  const completedActivityIds = new Set(
    events.filter((e) => e.type === "completed").map((e) => e.activityId ?? e.id.replace("activity-", "")),
  );

  const unmatched = recentFeedback.filter(
    (fb) => fb.activityId && !completedActivityIds.has(fb.activityId),
  );

  if (unmatched.length === 0) return "";

  const lines = ["\n## Other recent run feedback"];
  for (const fb of unmatched) {
    const date = new Date(fb.createdAt).toISOString().split("T")[0];
    const parts = [date];
    if (fb.rating) parts.push(fb.rating);
    if (fb.carbsG != null) parts.push(`${fb.carbsG}g carbs`);
    if (fb.comment) parts.push(`"${fb.comment}"`);
    lines.push(`- ${parts.join(", ")}`);
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
      if (e.category) parts.push(`(${e.category})`);
      if (e.fuelRate) parts.push(`fuel ${e.fuelRate}g/h`);
      return `- ${parts.join(" | ")}`;
    })
    .join("\n");
}

function summarizeBGModel(bgModel: BGResponseModel | null): string {
  if (!bgModel) return "No BG model data available yet.";

  const lines: string[] = [`Activities analyzed: ${bgModel.activitiesAnalyzed}`];

  for (const cat of ["easy", "long", "interval"] as const) {
    const c = bgModel.categories[cat];
    if (!c) continue;
    lines.push(
      `- ${cat}: avg BG change ${c.avgRate > 0 ? "+" : ""}${c.avgRate.toFixed(2)} mmol/L per 10min` +
        ` (${c.confidence} confidence, ${c.activityCount} activities)` +
        (c.avgFuelRate != null ? `, avg fuel ${c.avgFuelRate.toFixed(0)}g/h` : ""),
    );
  }

  for (const t of bgModel.targetFuelRates) {
    lines.push(
      `- Suggested fuel for ${t.category}: ${t.targetFuelRate.toFixed(0)}g/h` +
        (t.currentAvgFuel != null ? ` (current avg: ${t.currentAvgFuel.toFixed(0)}g/h)` : "") +
        ` [${t.confidence} confidence, ${t.method}]`,
    );
  }

  if (bgModel.bgByStartLevel.length > 0) {
    lines.push("BG response by starting level:");
    for (const b of bgModel.bgByStartLevel) {
      lines.push(
        `- Start ${b.band} mmol/L: avg ${b.avgRate > 0 ? "+" : ""}${b.avgRate.toFixed(2)} mmol/L per 10min (${b.activityCount} activities)`,
      );
    }
  }

  if (bgModel.bgByEntrySlope.length > 0) {
    lines.push("BG response by entry slope (pre-run trend):");
    for (const s of bgModel.bgByEntrySlope) {
      lines.push(
        `- Entry ${s.slope}: avg ${s.avgRate > 0 ? "+" : ""}${s.avgRate.toFixed(2)} mmol/L per 10min (${s.activityCount} activities)`,
      );
    }
  }

  if (bgModel.bgByTime.length > 0) {
    lines.push("BG response by time into run:");
    for (const t of bgModel.bgByTime) {
      lines.push(
        `- ${t.bucket}min: avg ${t.avgRate > 0 ? "+" : ""}${t.avgRate.toFixed(2)} mmol/L per 10min (${t.sampleCount} samples)`,
      );
    }
  }

  return lines.join("\n");
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
    parts.push(`Rate: ${ctx.trendSlope > 0 ? "+" : ""}${ctx.trendSlope.toFixed(2)} mmol/L per 10min`);
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

export function buildSystemPrompt(ctx: CoachContext): string {
  const today = format(new Date(), "yyyy-MM-dd");

  const feedbackMap = ctx.recentFeedback
    ? new Map(ctx.recentFeedback.filter((fb) => fb.activityId).map((fb) => [fb.activityId!, fb]))
    : undefined;

  const recoverySection = ctx.runBGContexts && ctx.runBGContexts.size > 0
    ? `\n\n## Post-Run Recovery Patterns\n${summarizeRecoveryPatterns(ctx.runBGContexts)}`
    : "";

  const raceDateStr = ctx.raceDate || "2026-06-13";
  const lthr = ctx.lthr ?? DEFAULT_LTHR;
  const maxHr = ctx.maxHr ?? DEFAULT_MAX_HR;
  return `You are the AI running coach inside Springa, a training app for a Type 1 Diabetic runner preparing for EcoTrail 16km (${raceDateStr}).

## Runner Profile
- Age 40, 80kg, 185cm. ${buildProfileLine(lthr, maxHr)}, LT Pace 4:53/km, VO2max 49.
- Restarted running ~8 months ago. Longest distance: 10km. Currently 3-4x/week.
- Type 1 Diabetic (since 2009). Ypsomed pump + CamAPS FX + Dexcom G6.
- All runs are pump-off. Target start BG ~10 mmol/L.

## Pace Zones
${buildZoneBlock(lthr, maxHr, ctx.paceTable, ctx.hrZones)}

## Current Status (${today})
- Training phase: ${ctx.phaseInfo.name} (week ${ctx.phaseInfo.week}, ${Math.round(ctx.phaseInfo.progress)}% through plan)

## Fitness Load
${summarizeFitness(ctx.insights)}

## Live Blood Glucose
${summarizeLiveBG(ctx)}

## Blood Glucose Model (historical)
${summarizeBGModel(ctx.bgModel)}${recoverySection}

## Recent Completed Workouts (last 14 days)
${summarizeCompletedWorkouts(ctx.events, ctx.bgModel, ctx.runBGContexts, feedbackMap)}
${summarizeUnmatchedFeedback(ctx.events, ctx.recentFeedback)}
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
