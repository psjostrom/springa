#!/usr/bin/env npx tsx
/**
 * Analyze post-run BG recovery patterns from real data.
 * Computes recovery context directly from xDrip readings.
 * Usage: npx tsx scripts/analyze-recovery.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(import.meta.dirname ?? __dirname, "../.env.local");
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

import { getActivityStreams } from "../lib/activityStreamsDb";
import { getXdripReadingsForRange } from "../lib/xdripDb";
import {
  findReadingsInWindow,
  closestReading,
  computePreRunContext,
  computePostRunContext,
} from "../lib/runBGContext";

const EMAIL = "persinternetpost@gmail.com";

interface RecoveryAnalysis {
  date: string;
  category: string;
  name: string;
  fuelRate: number | null;
  startBG: number | null;
  endBG: number | null;
  // Post-run BG at time points (absolute values)
  bg30m: number | null;
  bg60m: number | null;
  bg120m: number | null;
  // Changes from endBG
  change30m: number | null;
  change60m: number | null;
  change120m: number | null;
  // Extremes in 2h post
  peakPostRun: number | null;
  timeToPeakMin: number | null;
  lowestPostRun: number | null;
  timeToLowestMin: number | null;
  // Derived
  swing: number | null; // peak - lowest (spike-then-crash magnitude)
  // Flags
  postRunHypo: boolean;
  skyrocket: boolean;
  crashAfterSpike: boolean; // peak > 12 AND lowest < 5.5
  timeToStable: number | null;
  // 5-min bucket curve
  curve: { min: number; mmol: number }[];
}

async function main() {
  const cached = await getActivityStreams(EMAIL);
  console.log(`Found ${cached.length} cached activities\n`);

  const analyses: RecoveryAnalysis[] = [];

  for (const activity of cached) {
    if (activity.runStartMs == null || activity.hr.length < 2) continue;

    const runStartMs = activity.runStartMs;
    // Run duration from HR stream (time is in minutes from start)
    const hrStream = activity.hr;
    const runDurationMin = hrStream[hrStream.length - 1].time - hrStream[0].time;
    const runEndMs = runStartMs + runDurationMin * 60 * 1000;

    // Fetch xDrip readings: 30 min before start to 2.5h after end
    const readings = await getXdripReadingsForRange(
      EMAIL,
      runStartMs - 30 * 60 * 1000,
      runEndMs + 150 * 60 * 1000,
    );

    if (readings.length < 4) continue;

    // Compute pre and post context
    const pre = computePreRunContext(readings, runStartMs);
    const post = computePostRunContext(readings, runEndMs);

    if (post == null) continue;

    const startBG = pre?.startBG ?? null;

    // Post-run readings
    const postReadings = findReadingsInWindow(
      readings,
      runEndMs,
      runEndMs + 120 * 60 * 1000,
    );

    // BG at specific time points
    const bgAtMinute = (minAfter: number): number | null => {
      const target = runEndMs + minAfter * 60 * 1000;
      const r = closestReading(postReadings, target, 7 * 60 * 1000);
      return r?.mmol ?? null;
    };

    // Peak and lowest in post-run window
    let peakR = postReadings[0];
    let lowestR = postReadings[0];
    for (const r of postReadings) {
      if (r.mmol > peakR.mmol) peakR = r;
      if (r.mmol < lowestR.mmol) lowestR = r;
    }

    const bg30 = bgAtMinute(30);
    const bg60 = bgAtMinute(60);
    const bg120 = bgAtMinute(120);

    // 5-min curve
    const curve: { min: number; mmol: number }[] = [];
    for (let m = 0; m <= 120; m += 5) {
      const bg = bgAtMinute(m);
      if (bg != null) curve.push({ min: m, mmol: bg });
    }

    analyses.push({
      date: activity.activityDate ?? "?",
      category: activity.category,
      name: activity.name ?? "?",
      fuelRate: activity.fuelRate,
      startBG,
      endBG: post.endBG,
      bg30m: bg30,
      bg60m: bg60,
      bg120m: bg120,
      change30m: bg30 != null ? bg30 - post.endBG : null,
      change60m: bg60 != null ? bg60 - post.endBG : null,
      change120m: bg120 != null ? bg120 - post.endBG : null,
      peakPostRun: peakR.mmol,
      timeToPeakMin: Math.round((peakR.ts - runEndMs) / 60000),
      lowestPostRun: lowestR.mmol,
      timeToLowestMin: Math.round((lowestR.ts - runEndMs) / 60000),
      swing: peakR.mmol - lowestR.mmol,
      postRunHypo: post.postRunHypo,
      skyrocket: peakR.mmol > 14,
      crashAfterSpike: peakR.mmol > 12 && lowestR.mmol < 5.5,
      timeToStable: post.timeToStable,
      curve,
    });
  }

  analyses.sort((a, b) => a.date.localeCompare(b.date));

  // --- Table ---
  console.log("=== POST-RUN RECOVERY ANALYSIS ===\n");
  console.log(
    `${"Date".padEnd(12)}${"Cat".padEnd(10)}${"Start".padStart(6)}${"End".padStart(6)}${"30m".padStart(7)}${"60m".padStart(7)}${"120m".padStart(7)}${"Peak".padStart(6)}${"@min".padStart(5)}${"Low".padStart(6)}${"@min".padStart(5)}${"Swing".padStart(6)}${"Hypo".padStart(5)}${"Sky".padStart(5)}${"Crash".padStart(6)}${"TTS".padStart(6)}${"Fuel".padStart(5)}`,
  );
  console.log("-".repeat(118));

  for (const a of analyses) {
    const fmt = (v: number | null) =>
      v != null ? (v >= 0 ? "+" : "") + v.toFixed(1) : "?";

    console.log(
      `${a.date.padEnd(12)}${a.category.padEnd(10)}${(a.startBG?.toFixed(1) ?? "?").padStart(6)}${a.endBG.toFixed(1).padStart(6)}${fmt(a.change30m).padStart(7)}${fmt(a.change60m).padStart(7)}${fmt(a.change120m).padStart(7)}${a.peakPostRun?.toFixed(1).padStart(6)}${String(a.timeToPeakMin ?? "?").padStart(5)}${a.lowestPostRun?.toFixed(1).padStart(6)}${String(a.timeToLowestMin ?? "?").padStart(5)}${a.swing?.toFixed(1).padStart(6)}${(a.postRunHypo ? "YES" : "").padStart(5)}${(a.skyrocket ? "YES" : "").padStart(5)}${(a.crashAfterSpike ? "YES" : "").padStart(6)}${(a.timeToStable != null ? String(a.timeToStable) : "never").padStart(6)}${(a.fuelRate != null ? String(a.fuelRate) : "?").padStart(5)}`,
    );
  }

  // --- Summary ---
  console.log(`\n=== SUMMARY (n=${analyses.length}) ===\n`);

  const hypos = analyses.filter((a) => a.postRunHypo);
  const skyrockets = analyses.filter((a) => a.skyrocket);
  const neverStable = analyses.filter((a) => a.timeToStable == null);

  const crashes = analyses.filter((a) => a.crashAfterSpike);
  const swings = analyses.filter((a) => a.swing != null).map((a) => a.swing!);
  const avgSwing = swings.length > 0 ? swings.reduce((a, b) => a + b, 0) / swings.length : null;

  console.log(`Post-run hypos (< 3.9 within 2h): ${hypos.length} / ${analyses.length}`);
  console.log(`Post-run skyrockets (peak > 14): ${skyrockets.length} / ${analyses.length}`);
  console.log(`Spike-then-crash (peak > 12, lowest < 5.5): ${crashes.length} / ${analyses.length}`);
  console.log(`Avg swing (peak - lowest): ${avgSwing != null ? avgSwing.toFixed(1) : "?"} mmol/L`);
  console.log(`Never stabilized (4-10 for 15m): ${neverStable.length} / ${analyses.length}`);

  // --- By category ---
  console.log("\n--- By Category ---\n");
  for (const cat of ["easy", "long", "interval"] as const) {
    const runs = analyses.filter((a) => a.category === cat);
    if (runs.length === 0) continue;

    const avg = (vals: number[]) =>
      vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;

    const avgEnd = avg(runs.map((r) => r.endBG));
    const avgPeak = avg(runs.filter((r) => r.peakPostRun != null).map((r) => r.peakPostRun!));
    const avgLowest = avg(runs.filter((r) => r.lowestPostRun != null).map((r) => r.lowestPostRun!));
    const avgCh30 = avg(runs.filter((r) => r.change30m != null).map((r) => r.change30m!));
    const avgCh60 = avg(runs.filter((r) => r.change60m != null).map((r) => r.change60m!));

    const f = (v: number | null) => v != null ? v.toFixed(1) : "?";

    console.log(`${cat.toUpperCase()} (n=${runs.length}):`);
    console.log(`  End BG avg: ${f(avgEnd)} | Peak avg: ${f(avgPeak)} | Lowest avg: ${f(avgLowest)}`);
    console.log(`  30m change avg: ${f(avgCh30)} | 60m change avg: ${f(avgCh60)}`);
    const catSwings = runs.filter((r) => r.swing != null).map((r) => r.swing!);
    const avgCatSwing = catSwings.length > 0 ? catSwings.reduce((a, b) => a + b, 0) / catSwings.length : null;
    console.log(`  Hypos: ${runs.filter((r) => r.postRunHypo).length} | Skyrockets: ${runs.filter((r) => r.skyrocket).length} | Crashes: ${runs.filter((r) => r.crashAfterSpike).length} | Avg swing: ${avgCatSwing != null ? avgCatSwing.toFixed(1) : "?"}`);
  }

  // --- End BG bands ---
  console.log("\n--- End BG vs Recovery Direction ---\n");
  const bands = [
    { label: "End < 6", filter: (a: RecoveryAnalysis) => a.endBG < 6 },
    { label: "End 6-8", filter: (a: RecoveryAnalysis) => a.endBG >= 6 && a.endBG < 8 },
    { label: "End 8-10", filter: (a: RecoveryAnalysis) => a.endBG >= 8 && a.endBG <= 10 },
    { label: "End > 10", filter: (a: RecoveryAnalysis) => a.endBG > 10 },
  ];
  for (const { label, filter } of bands) {
    const group = analyses.filter(filter);
    if (group.length === 0) continue;
    const ch30s = group.filter((a) => a.change30m != null).map((a) => a.change30m!);
    const peaks = group.map((a) => a.peakPostRun!);
    const avg30 = ch30s.length > 0 ? ch30s.reduce((a, b) => a + b, 0) / ch30s.length : null;
    const avgPeak = peaks.reduce((a, b) => a + b, 0) / peaks.length;
    console.log(
      `${label} (n=${group.length}): avg 30m ${avg30 != null ? (avg30 >= 0 ? "+" : "") + avg30.toFixed(1) : "?"} | avg peak ${avgPeak.toFixed(1)} | hypos ${group.filter((a) => a.postRunHypo).length} | sky ${group.filter((a) => a.skyrocket).length}`,
    );
  }

  // --- Fuel rate vs recovery ---
  console.log("\n--- Fuel Rate vs Recovery ---\n");
  const withFuel = analyses.filter((a) => a.fuelRate != null);
  const fuelBands = [
    { label: "Fuel <= 40", filter: (a: RecoveryAnalysis) => a.fuelRate! <= 40 },
    { label: "Fuel 41-55", filter: (a: RecoveryAnalysis) => a.fuelRate! > 40 && a.fuelRate! <= 55 },
    { label: "Fuel > 55", filter: (a: RecoveryAnalysis) => a.fuelRate! > 55 },
  ];
  for (const { label, filter } of fuelBands) {
    const group = withFuel.filter(filter);
    if (group.length === 0) continue;
    const avgPeak = group.reduce((s, a) => s + a.peakPostRun!, 0) / group.length;
    const avgCh30 = group.filter((a) => a.change30m != null).map((a) => a.change30m!);
    const avg30 = avgCh30.length > 0 ? avgCh30.reduce((a, b) => a + b, 0) / avgCh30.length : null;
    console.log(
      `${label} (n=${group.length}): avg peak ${avgPeak.toFixed(1)} | avg 30m ${avg30 != null ? (avg30 >= 0 ? "+" : "") + avg30.toFixed(1) : "?"}`,
    );
  }

  // --- Recovery curves ---
  console.log("\n=== RECOVERY CURVES ===\n");
  for (const a of analyses) {
    const spark = a.curve
      .map((p) => `${String(p.min).padStart(3)}m:${p.mmol.toFixed(1).padStart(5)}`)
      .join("  ");
    console.log(`${a.date} ${a.category.padEnd(8)} fuel=${String(a.fuelRate ?? "?").padStart(2)} | ${spark}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
