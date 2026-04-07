import { describe, it, expect } from "vitest";
import { formatPaceStep, createWorkoutText } from "../descriptionBuilder";

describe("formatPaceStep", () => {
  it("formats a pace step with min-max percentage", () => {
    expect(formatPaceStep("10m", 80, 88)).toBe("10m 80-88% pace");
  });

  it("includes a note prefix when provided", () => {
    expect(formatPaceStep("2m", 105, 110, "Fast")).toBe(
      "Fast 2m 105-110% pace",
    );
  });

  it("formats a walk step with no pace target", () => {
    expect(formatPaceStep("2m", null, null, "Walk")).toBe("Walk 2m");
  });

  it("formats a distance-based step", () => {
    expect(formatPaceStep("3km", 95, 100, "Race Pace")).toBe(
      "Race Pace 3km 95-100% pace",
    );
  });

  it("formats an effort-based step (hills, strides)", () => {
    expect(formatPaceStep("2m", null, null, "Uphill")).toBe("Uphill 2m");
  });
});

describe("createWorkoutText with pace steps", () => {
  it("builds a structured workout", () => {
    const wu = "10m 80-88% pace intensity=warmup";
    const main = ["2m 105-110% pace intensity=active", "Walk 2m intensity=rest"];
    const cd = "5m 80-88% pace intensity=cooldown";
    const result = createWorkoutText(wu, main, cd, 6, "Speed work.");

    expect(result).toContain("Speed work.");
    expect(result).toContain("Warmup");
    expect(result).toContain("Main set 6x");
    expect(result).toContain("Cooldown");
    expect(result).toContain("80-88% pace");
    expect(result).not.toContain("LTHR");
    expect(result).not.toContain("bpm");
  });
});
