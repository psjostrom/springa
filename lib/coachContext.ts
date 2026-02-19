import { format, subDays, addDays, startOfDay } from "date-fns";
import type { CalendarEvent } from "./types";
import type { BGResponseModel } from "./bgModel";
import type { FitnessInsights } from "./fitness";

interface CoachContext {
  phaseInfo: { name: string; week: number; progress: number };
  insights: FitnessInsights | null;
  bgModel: BGResponseModel | null;
  events: CalendarEvent[];
}

function formatPace(minPerKm: number): string {
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function buildActivityBGMap(bgModel: BGResponseModel | null): Map<string, { startBG: number; avgRate: number; samples: number }> {
  const map = new Map<string, { startBG: number; rates: number[] }>();
  if (!bgModel) return new Map();

  for (const obs of bgModel.observations) {
    let entry = map.get(obs.activityId);
    if (!entry) {
      entry = { startBG: obs.startBG, rates: [] };
      map.set(obs.activityId, entry);
    }
    entry.rates.push(obs.bgRate);
  }

  const result = new Map<string, { startBG: number; avgRate: number; samples: number }>();
  for (const [id, entry] of map) {
    const avgRate = entry.rates.reduce((a, b) => a + b, 0) / entry.rates.length;
    result.set(id, { startBG: entry.startBG, avgRate, samples: entry.rates.length });
  }
  return result;
}

function summarizeCompletedWorkouts(events: CalendarEvent[], bgModel: BGResponseModel | null): string {
  const today = startOfDay(new Date());
  const cutoff = subDays(today, 14);

  const completed = events
    .filter((e) => e.type === "completed" && e.date >= cutoff && e.date <= today)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 10);

  if (completed.length === 0) return "No completed workouts in the last 14 days.";

  const bgMap = buildActivityBGMap(bgModel);

  return completed
    .map((e) => {
      const parts = [format(e.date, "yyyy-MM-dd"), e.name];
      if (e.distance) parts.push(`${(e.distance / 1000).toFixed(1)}km`);
      if (e.pace) parts.push(`pace ${formatPace(e.pace)}/km`);
      if (e.avgHr) parts.push(`avgHR ${e.avgHr}`);
      if (e.load) parts.push(`load ${e.load}`);
      if (e.carbsIngested) parts.push(`carbs ${e.carbsIngested}g`);
      const actId = e.activityId ?? e.id.replace("activity-", "");
      const bg = bgMap.get(actId);
      if (bg) {
        const sign = bg.avgRate >= 0 ? "+" : "";
        parts.push(`startBG ${bg.startBG.toFixed(1)} | BG rate ${sign}${bg.avgRate.toFixed(2)}/10min`);
      }
      return `- ${parts.join(" | ")}`;
    })
    .join("\n");
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

  return `You are the AI running coach inside Springa, a training app for a Type 1 Diabetic runner preparing for EcoTrail 16km (2026-06-13).

## Runner Profile
- Age 40, 80kg, 185cm. Max HR 187, LTHR 169, LT Pace 4:53/km, VO2max 49.
- Restarted running ~8 months ago. Longest distance: 10km. Currently 3-4x/week.
- Type 1 Diabetic (since 2009). Ypsomed pump + CamAPS FX + Dexcom G6.
- All runs are pump-off. Target start BG ~10 mmol/L.

## Pace Zones
- Easy: 7:00-7:30/km (Z2, 112-132 bpm)
- Race Pace: 5:35-5:45/km (Z3, 132-150 bpm)
- Interval: 5:05-5:20/km (Z4, 150-167 bpm)
- Hard/Strides: <5:00/km (Z5, 167-188 bpm)

## Current Status (${today})
- Training phase: ${ctx.phaseInfo.name} (week ${ctx.phaseInfo.week}, ${Math.round(ctx.phaseInfo.progress)}% through plan)

## Fitness Load
${summarizeFitness(ctx.insights)}

## Blood Glucose Model
${summarizeBGModel(ctx.bgModel)}

## Recent Completed Workouts (last 14 days)
${summarizeCompletedWorkouts(ctx.events, ctx.bgModel)}

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
