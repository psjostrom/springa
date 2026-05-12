import { describe, it, expect } from "vitest";
import { CONSENSUS_LINE, buildPersonalHypoFloorLine } from "../preRunBgCopy";
import type { RunForFloorAnalysis } from "../personalHypoFloor";

// computeHypoFloor needs ≥10 runs and ≥2 hypos to return non-null. Helper to
// generate runs at a given startBG with optional hypo.
function run(startBG: number, wentHypo: boolean): RunForFloorAnalysis {
  return { startBG, wentHypo };
}

describe("CONSENSUS_LINE", () => {
  it("references the Riddell 2017 7–10 mmol/L target", () => {
    expect(CONSENSUS_LINE).toContain("7-10 mmol/L");
    expect(CONSENSUS_LINE).toContain("Riddell 2017");
  });
});

describe("buildPersonalHypoFloorLine", () => {
  it("returns null when there's no input data", () => {
    expect(buildPersonalHypoFloorLine()).toBeNull();
    expect(buildPersonalHypoFloorLine([])).toBeNull();
  });

  it("returns null when computeHypoFloor returns null (insufficient data)", () => {
    // 5 runs, 1 hypo — below MIN_RUNS=10 and MIN_HYPOS=2 thresholds.
    const runs = [
      run(7.0, true), run(8.0, false), run(9.0, false),
      run(10.0, false), run(11.0, false),
    ];
    expect(buildPersonalHypoFloorLine(runs)).toBeNull();
  });

  it("emits both floors when danger and always-safe thresholds exist", () => {
    // 6 runs in [6.0, 6.5) bucket, 4 hypos (67% > 20% threshold) → dangerFloor.
    // 10 runs at startBG ≥ 9.0, 0 hypos → alwaysSafeFloor.
    const runs = [
      run(6.0, true), run(6.0, true), run(6.2, true), run(6.3, true),
      run(6.4, false), run(6.4, false),
      run(9.0, false), run(9.5, false), run(10.0, false), run(10.5, false),
      run(11.0, false), run(11.5, false), run(12.0, false), run(13.0, false),
      run(14.0, false), run(15.0, false),
    ];
    const line = buildPersonalHypoFloorLine(runs);
    expect(line).not.toBeNull();
    expect(line).toContain("Personal hypo signal");
    expect(line).toContain("starts in 6.0-6.5"); // dangerFloor bucket
    expect(line).toContain("hypo'd 67%");        // 4 of 6
    expect(line).toContain("4 of 6");
    expect(line).toContain("above 9.0");          // alwaysSafeFloor
    expect(line).toContain("0 hypos");
  });

  it("emits danger-floor-only when there's no clean upper threshold", () => {
    // Hypos sprinkled across all buckets — no zero-hypo upper region.
    const runs = [
      run(6.0, true), run(6.0, true), run(6.0, true),
      run(7.0, false), run(7.5, false), run(8.0, true),
      run(9.0, false), run(10.0, true), run(11.0, false),
      run(12.0, false),
    ];
    const line = buildPersonalHypoFloorLine(runs);
    expect(line).not.toBeNull();
    expect(line).toContain("Personal hypo signal");
    expect(line).toContain("starts in 6.0-6.5");
    expect(line).not.toContain("above");
    expect(line).not.toContain("0 hypos");
  });

  it("emits always-safe-floor-only when no bucket meets the danger threshold", () => {
    // 10 runs ≥ 8.0 with no hypos. Below 8.0 has the 2 hypos but spread
    // across buckets so each bucket has < 3 samples → no dangerFloor.
    const runs = [
      run(5.5, true), run(6.5, true),
      run(8.0, false), run(8.5, false), run(9.0, false), run(9.5, false),
      run(10.0, false), run(10.5, false), run(11.0, false), run(11.5, false),
      run(12.0, false), run(13.0, false),
    ];
    const line = buildPersonalHypoFloorLine(runs);
    expect(line).not.toBeNull();
    expect(line).toContain("Personal hypo signal");
    expect(line).toContain("have not hypo'd");
    expect(line).toContain("total hypos lower down");
  });
});
