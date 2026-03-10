#!/usr/bin/env npx tsx
/**
 * Run BG simulation validation directly (no HTTP/auth needed).
 * Usage: npx tsx scripts/validate-sim.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local manually (no dotenv dependency)
const envPath = resolve(import.meta.dirname ?? __dirname, "../.env.local");
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

import { getActivityStreams } from "../lib/activityStreamsDb";
import { enrichActivitiesWithGlucose } from "../lib/activityStreamsEnrich";
import { buildBGModelFromCached } from "../lib/bgModel";
import { simulateBG, validateSimulation } from "../lib/bgSimulation";

const EMAIL = process.env.VALIDATE_EMAIL ?? "persinternetpost@gmail.com";

async function main() {
  const rawCached = await getActivityStreams(EMAIL);
  const allCached = await enrichActivitiesWithGlucose(EMAIL, rawCached);
  if (allCached.length < 3) {
    console.log(`Only ${allCached.length} cached activities, need at least 3`);
    process.exit(1);
  }

  const results: Record<string, unknown>[] = [];

  for (let i = 0; i < allCached.length; i++) {
    const target = allCached[i];
    if (target.glucose.length < 12) continue;

    const trainingSet = allCached.filter((_, j) => j !== i);
    if (trainingSet.length < 2) continue;

    const model = buildBGModelFromCached(trainingSet);
    if (model.activitiesAnalyzed === 0) continue;

    const glucoseMinutes = target.glucose.map((p) => p.time);
    const durationMin = Math.max(...glucoseMinutes) - Math.min(...glucoseMinutes);
    if (durationMin < 10) continue;

    const sorted = [...target.glucose].sort((a, b) => a.time - b.time);
    const startBG = sorted[0].value;
    const entrySlope = target.runBGContext?.pre?.entrySlope30m ?? null;

    const simResult = simulateBG({
      startBG,
      entrySlope,
      segments: [{ durationMin, category: target.category }],
      fuelRateGH: target.fuelRate ?? null,
      bgModel: model,
    });

    const validation = validateSimulation(simResult.curve, target.glucose);
    if (!validation) continue;

    const actualEndBG = sorted[sorted.length - 1].value;
    const actualHypo = sorted.some((p) => p.value < 3.9);
    const lastSim = simResult.curve[simResult.curve.length - 1];

    results.push({
      date: target.activityDate ?? null,
      category: target.category,
      rmse: validation.rmse,
      endBandWidth: Math.round((lastSim.bgHigh - lastSim.bgLow) * 100) / 100,
      actualWithinBand: (() => {
        let within = 0, compared = 0;
        for (const ap of sortedGlucose) {
          const nearest = simResult.curve.reduce((best, sp) =>
            Math.abs(sp.minute - ap.time) < Math.abs(best.minute - ap.time) ? sp : best
          );
          if (Math.abs(nearest.minute - ap.time) <= 2) {
            compared++;
            if (ap.value >= nearest.bgLow && ap.value <= nearest.bgHigh) within++;
          }
        }
        return compared > 0 ? Math.round((within / compared) * 100) : null;
      })(),
      actualEndBG: Math.round(actualEndBG * 10) / 10,
      simEndBG: lastSim.bg,
      reliable: simResult.reliable,
      confidence: simResult.confidence,
      warnings: simResult.warnings,
    });
  }

  // Summary
  const reliable = results.filter((r) => r.reliable);
  const unreliable = results.filter((r) => !r.reliable);
  const rmses = results.map((r) => r.rmse as number);
  const reliableRmses = reliable.map((r) => r.rmse as number);

  console.log("\n=== VALIDATION RESULTS ===\n");
  console.log(`Total: ${results.length} | Reliable: ${reliable.length} | Unreliable: ${unreliable.length}`);
  console.log(`Avg RMSE (all): ${(rmses.reduce((a, b) => a + b, 0) / rmses.length).toFixed(2)}`);
  if (reliableRmses.length > 0) {
    console.log(`Avg RMSE (reliable only): ${(reliableRmses.reduce((a, b) => a + b, 0) / reliableRmses.length).toFixed(2)}`);
  }

  console.log("\n--- Per activity ---\n");
  console.log("Date       | Cat      | RMSE | Band  | %In | End±  | Reliable");
  console.log("-----------|----------|------|-------|-----|-------|--------");
  for (const r of results) {
    const endErr = ((r.simEndBG as number) - (r.actualEndBG as number)).toFixed(1);
    console.log(
      `${(r.date as string ?? "?").padEnd(10)} | ${(r.category as string).padEnd(8)} | ${(r.rmse as number).toFixed(2).padStart(4)} | ${(r.endBandWidth as number).toFixed(1).padStart(5)} | ${String(r.actualWithinBand ?? "?").padStart(3)}% | ${endErr.padStart(5)} | ${r.reliable ? "YES" : "no"}`
    );
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
