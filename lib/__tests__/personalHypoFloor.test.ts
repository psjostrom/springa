import { describe, it, expect } from "vitest";
import { computeHypoFloor, type RunForFloorAnalysis } from "../personalHypoFloor";

const synth = (startBG: number, wentHypo: boolean): RunForFloorAnalysis => ({ startBG, wentHypo });

describe("computeHypoFloor", () => {
  it("returns null when fewer than 10 runs", () => {
    expect(computeHypoFloor([synth(8, false), synth(9, true)])).toBeNull();
  });

  it("returns null when fewer than 2 hypos", () => {
    const runs = Array.from({ length: 15 }, (_, i) => synth(8 + i * 0.1, i === 0));
    expect(computeHypoFloor(runs)).toBeNull();
  });

  it("finds dangerFloor where 3+ runs hypo'd", () => {
    const runs: RunForFloorAnalysis[] = [
      synth(7.0, true), synth(7.1, true), synth(7.2, true), synth(7.3, false),
      synth(8.5, false), synth(8.6, false), synth(8.7, false),
      synth(9.0, false), synth(9.5, false), synth(10.0, false), synth(10.5, false), synth(11.0, false),
    ];
    const result = computeHypoFloor(runs);
    expect(result).not.toBeNull();
    expect(result!.dangerFloor).toBe(7.0);
    expect(result!.dangerFloorHypoRate).toBeGreaterThanOrEqual(0.5);
  });

  it("finds alwaysSafeFloor where no runs hypo'd at-or-above", () => {
    const runs: RunForFloorAnalysis[] = [
      synth(6.5, true), synth(6.7, true),
      synth(8.5, false), synth(8.7, false), synth(8.9, false),
      synth(9.0, false), synth(9.5, false), synth(10.0, false), synth(10.5, false), synth(11.0, false),
    ];
    const result = computeHypoFloor(runs);
    expect(result).not.toBeNull();
    // 8.5 onward is fully safe with ≥3 runs
    expect(result!.alwaysSafeFloor).toBeLessThanOrEqual(8.5);
    expect(result!.alwaysSafeFloor).toBeGreaterThanOrEqual(7.0);
  });

  it("returns analysis with nulls when no clear floor but enough data", () => {
    // Mixed pattern, no clean floor
    const runs: RunForFloorAnalysis[] = Array.from({ length: 20 }, (_, i) => synth(7 + i * 0.2, i % 4 === 0));
    const result = computeHypoFloor(runs);
    expect(result).not.toBeNull();
    expect(result!.totalRuns).toBe(20);
  });
});
