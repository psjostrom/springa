import { computeHypoFloor, type RunForFloorAnalysis } from "./personalHypoFloor";

export const CONSENSUS_LINE =
  "Pre-exercise BG target: 7-10 mmol/L (international consensus, Riddell 2017). Below 7 -> supplement carbs; above 15 -> avoid aerobic.";

export function buildPersonalHypoFloorLine(pastRuns?: RunForFloorAnalysis[]): string | null {
  if (!pastRuns || pastRuns.length === 0) return null;
  const analysis = computeHypoFloor(pastRuns);
  if (!analysis) return null;

  const { dangerFloor, dangerFloorHypoCount, dangerFloorRunCount, alwaysSafeFloor, alwaysSafeFloorRunCount, totalHypos } = analysis;

  if (dangerFloor != null && alwaysSafeFloor != null) {
    return `Personal hypo signal: starts in ${dangerFloor.toFixed(1)}-${(dangerFloor + 0.5).toFixed(1)} have hypo'd ${Math.round((dangerFloorHypoCount / dangerFloorRunCount) * 100)}% of the time (${dangerFloorHypoCount} of ${dangerFloorRunCount}); above ${alwaysSafeFloor.toFixed(1)}: 0 hypos in ${alwaysSafeFloorRunCount} runs.`;
  }
  if (dangerFloor != null) {
    return `Personal hypo signal: starts in ${dangerFloor.toFixed(1)}-${(dangerFloor + 0.5).toFixed(1)} have hypo'd ${Math.round((dangerFloorHypoCount / dangerFloorRunCount) * 100)}% of the time (${dangerFloorHypoCount} of ${dangerFloorRunCount}).`;
  }
  if (alwaysSafeFloor != null) {
    return `Personal hypo signal: starts above ${alwaysSafeFloor.toFixed(1)} have not hypo'd in ${alwaysSafeFloorRunCount} runs (${totalHypos} total hypos lower down).`;
  }
  return null;
}
