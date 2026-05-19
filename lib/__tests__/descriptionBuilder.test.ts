import { describe, it, expect } from "vitest";
import { formatPaceStep, createWorkoutText, stripPaceTargets } from "../descriptionBuilder";

describe("formatPaceStep", () => {
  it("formats a pace step with min-max percentage (no threshold)", () => {
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

  it("resolves absolute pace when threshold is provided", () => {
    // threshold = 5.5 min/km, 100% = 5:30/km
    // z3 (99-102%): fast = 5.5/1.02 = 5.392 → 5:24, slow = 5.5/0.99 = 5.556 → 5:33
    const result = formatPaceStep("5m", 99, 102, "Race Pace", 5.5);
    expect(result).toMatch(/Race Pace 5m \d+:\d+-\d+:\d+\/km Pace/);
    expect(result).not.toContain("% pace");
  });

  it("outputs fast pace before slow pace (lower min:sec first)", () => {
    // threshold = 6.0, z2 (30-88%):
    // fast = 6.0/0.88 = 6.818 → 6:49, slow = 6.0/0.30 = 20.0 → 20:00
    const result = formatPaceStep("10m", 30, 88, undefined, 6.0);
    expect(result).toBe("10m 6:49-20:00/km Pace");
  });

  it("falls back to % pace when threshold is undefined", () => {
    expect(formatPaceStep("10m", 80, 88, undefined, undefined)).toBe("10m 80-88% pace");
  });

  it("walk step ignores threshold (no pace target to resolve)", () => {
    expect(formatPaceStep("2m", null, null, "Walk", 5.5)).toBe("Walk 2m");
  });
});

describe("createWorkoutText with pace steps", () => {
  it("builds a structured workout with absolute paces", () => {
    const wu = "10m 6:15-18:20/km Pace intensity=warmup";
    const main = ["Fast 2m 4:57-5:11/km Pace intensity=active", "Walk 2m intensity=rest"];
    const cd = "5m 6:15-18:20/km Pace intensity=cooldown";
    const result = createWorkoutText(wu, main, cd, 6, "Speed work.");

    expect(result).toContain("Speed work.");
    expect(result).toContain("Warmup");
    expect(result).toContain("Main set 6x");
    expect(result).toContain("Cooldown");
    expect(result).toContain("/km Pace");
    expect(result).not.toContain("LTHR");
    expect(result).not.toContain("bpm");
  });
});

describe("stripPaceTargets", () => {
  it("strips absolute pace targets", () => {
    const input = "- Warmup 10m 6:49-20:00/km Pace intensity=warmup";
    expect(stripPaceTargets(input)).toBe("- Warmup 10m intensity=warmup");
  });

  it("strips percentage pace targets", () => {
    const input = "- Easy 35m 30-88% pace intensity=active";
    expect(stripPaceTargets(input)).toBe("- Easy 35m intensity=active");
  });

  it("leaves no-target steps unchanged", () => {
    const input = "- Walk 1m intensity=rest";
    expect(stripPaceTargets(input)).toBe("- Walk 1m intensity=rest");
  });

  it("handles multi-section description", () => {
    const input = [
      "Hill reps build strength.",
      "",
      "Warmup",
      "- Warmup 10m 6:49-20:00/km Pace intensity=warmup",
      "",
      "Main set 6x",
      "- Uphill 2m intensity=active",
      "- Downhill 3m 30-88% pace intensity=rest",
      "",
      "Cooldown",
      "- Cooldown 5m 6:49-20:00/km Pace intensity=cooldown",
      "",
    ].join("\n");

    const result = stripPaceTargets(input);
    expect(result).not.toContain("/km Pace");
    expect(result).not.toContain("% pace");
    expect(result).toContain("Warmup 10m intensity=warmup");
    expect(result).toContain("Downhill 3m intensity=rest");
    expect(result).toContain("Uphill 2m intensity=active");
    expect(result).toContain("Hill reps build strength.");
  });

  it("handles strides description with mixed target/no-target steps", () => {
    const input = [
      "Warmup",
      "- Warmup 10m 30-88% pace intensity=warmup",
      "",
      "Main set",
      "- Easy 20m 30-88% pace intensity=active",
      "",
      "Strides 4x",
      "- Stride 20s intensity=active",
      "- Walk 1m intensity=rest",
      "",
      "Cooldown",
      "- Cooldown 15m 30-88% pace intensity=cooldown",
      "",
    ].join("\n");

    const result = stripPaceTargets(input);
    expect(result).not.toContain("% pace");
    expect(result).toContain("Stride 20s intensity=active");
    expect(result).toContain("Walk 1m intensity=rest");
    expect(result).toContain("Warmup 10m intensity=warmup");
  });
});
