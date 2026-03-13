import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getActivityStreams } from "@/lib/activityStreamsDb";
import { enrichActivitiesWithGlucose } from "@/lib/activityStreamsEnrich";
import { buildBGModelFromCached } from "@/lib/bgModel";
import { simulateBG, validateSimulation } from "@/lib/bgSimulation";
import type { WorkoutCategory } from "@/lib/types";
import { NextResponse } from "next/server";

/**
 * Leave-one-out validation of the BG simulation engine.
 *
 * For each completed activity with glucose data:
 * 1. Build a BG model from ALL OTHER activities (exclude the one being tested)
 * 2. Simulate that activity using the model
 * 3. Compare simulated curve against actual glucose stream
 *
 * This is proper out-of-sample validation — the model never sees the run it's predicting.
 */
export async function GET() {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const rawCached = await getActivityStreams(email);
  const allCached = await enrichActivitiesWithGlucose(email, rawCached);
  if (allCached.length < 3) {
    return NextResponse.json({
      error: "Need at least 3 cached activities for validation",
      activitiesFound: allCached.length,
    });
  }

  const results: {
    activityId: string;
    category: WorkoutCategory;
    date: string | null;
    startBG: number;
    fuelRateGH: number | null;
    durationMin: number;
    actualEndBG: number;
    simEndBG: number;
    endBandWidth: number;
    actualWithinBand: number | null; // % of actual points within confidence band
    meanError: number;
    rmse: number;
    maxError: number;
    pointsCompared: number;
    hypoMinute: number | null;
    actualHypo: boolean;
    confidence: string;
    reliable: boolean;
    warnings: string[];
  }[] = [];

  for (let i = 0; i < allCached.length; i++) {
    const target = allCached[i];

    // Skip activities with insufficient glucose data
    const glucose = target.glucose;
    if (!glucose || glucose.length < 12) continue; // need at least ~12 min of data

    // Build model from all OTHER activities (leave-one-out)
    const trainingSet = allCached.filter((_, j) => j !== i);
    if (trainingSet.length < 2) continue;

    const model = buildBGModelFromCached(trainingSet);
    if (model.activitiesAnalyzed === 0) continue;

    // Determine duration and startBG from glucose stream
    const sorted = [...glucose].sort((a, b) => a.time - b.time);
    if (sorted.length < 2) continue;
    const durationMin = sorted[sorted.length - 1].time - sorted[0].time;
    if (durationMin < 10) continue;
    const startBG = sorted[0].value;

    // Get entry slope from runBGContext if available
    const entrySlope = target.runBGContext?.pre?.entrySlope30m ?? null;

    // Simulate
    const simResult = simulateBG({
      startBG,
      entrySlope,
      segments: [{ durationMin, category: target.category }],
      fuelRateGH: target.fuelRate ?? null,
      bgModel: model,
    });

    // Validate against actual glucose
    const validation = validateSimulation(simResult.curve, glucose);
    if (!validation) continue;

    // Actual end BG and hypo detection
    const sortedGlucose = [...glucose].sort((a, b) => a.time - b.time);
    const actualEndBG = sortedGlucose[sortedGlucose.length - 1].value;
    const actualHypo = sortedGlucose.some((p) => p.value < 3.9);

    results.push({
      activityId: target.activityId,
      category: target.category,
      date: target.activityDate ?? null,
      startBG: Math.round(startBG * 10) / 10,
      fuelRateGH: target.fuelRate,
      durationMin: Math.round(durationMin),
      actualEndBG: Math.round(actualEndBG * 10) / 10,
      simEndBG: simResult.curve[simResult.curve.length - 1].bg,
      endBandWidth: Math.round((simResult.curve[simResult.curve.length - 1].bgHigh - simResult.curve[simResult.curve.length - 1].bgLow) * 100) / 100,
      actualWithinBand: (() => {
        // Check what % of actual glucose points fall within the sim confidence bands
        const sortedActual = [...glucose].sort((a, b) => a.time - b.time);
        let within = 0;
        let compared = 0;
        for (const ap of sortedActual) {
          const nearestSim = simResult.curve.reduce((best, sp) =>
            Math.abs(sp.minute - ap.time) < Math.abs(best.minute - ap.time) ? sp : best
          );
          if (Math.abs(nearestSim.minute - ap.time) <= 2) {
            compared++;
            if (ap.value >= nearestSim.bgLow && ap.value <= nearestSim.bgHigh) within++;
          }
        }
        return compared > 0 ? Math.round((within / compared) * 100) : null;
      })(),
      meanError: validation.meanError,
      rmse: validation.rmse,
      maxError: validation.maxError,
      pointsCompared: validation.pointsCompared,
      hypoMinute: simResult.hypoMinute,
      actualHypo,
      confidence: simResult.confidence,
      reliable: simResult.reliable,
      warnings: simResult.warnings,
    });
  }

  // Summary stats
  const rmses = results.map((r) => r.rmse);
  const meanErrors = results.map((r) => r.meanError);
  const endBGErrors = results.map((r) => r.simEndBG - r.actualEndBG);

  const summary = {
    activitiesValidated: results.length,
    activitiesTotal: allCached.length,
    avgRMSE: rmses.length > 0
      ? Math.round((rmses.reduce((a, b) => a + b, 0) / rmses.length) * 100) / 100
      : null,
    avgMeanError: meanErrors.length > 0
      ? Math.round((meanErrors.reduce((a, b) => a + b, 0) / meanErrors.length) * 100) / 100
      : null,
    avgEndBGError: endBGErrors.length > 0
      ? Math.round((endBGErrors.reduce((a, b) => a + b, 0) / endBGErrors.length) * 100) / 100
      : null,
    hypoDetectionAccuracy: results.length > 0
      ? {
          truePositive: results.filter((r) => r.hypoMinute !== null && r.actualHypo).length,
          falsePositive: results.filter((r) => r.hypoMinute !== null && !r.actualHypo).length,
          trueNegative: results.filter((r) => r.hypoMinute === null && !r.actualHypo).length,
          falseNegative: results.filter((r) => r.hypoMinute === null && r.actualHypo).length,
        }
      : null,
    byCategory: Object.fromEntries(
      (["easy", "long", "interval"] as const).map((cat) => {
        const catResults = results.filter((r) => r.category === cat);
        const catRmses = catResults.map((r) => r.rmse);
        return [
          cat,
          {
            count: catResults.length,
            avgRMSE: catRmses.length > 0
              ? Math.round((catRmses.reduce((a, b) => a + b, 0) / catRmses.length) * 100) / 100
              : null,
          },
        ];
      }),
    ),
  };

  return NextResponse.json({ summary, results });
}
