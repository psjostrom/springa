import { describe, it, expect } from "vitest";
import { formatPaceStep, createWorkoutText, stripWorkoutTargets } from "../descriptionBuilder";
import { TEST_HR_ZONES, TEST_LTHR } from "./testConstants";

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

describe("stripWorkoutTargets", () => {
  it("strips absolute pace targets", () => {
    const input = "- Warmup 10m 6:49-20:00/km Pace intensity=warmup";
    expect(stripWorkoutTargets(input)).toBe("- Warmup 10m intensity=warmup");
  });

  it("strips percentage pace targets", () => {
    const input = "- Easy 35m 30-88% pace intensity=active";
    expect(stripWorkoutTargets(input)).toBe("- Easy 35m intensity=active");
  });

  it("strips HR targets", () => {
    const input = "- Downhill 3m 66-78% LTHR (112-132 bpm) intensity=rest";
    expect(stripWorkoutTargets(input)).toBe("- Downhill 3m intensity=rest");
  });

  it("strips bare labeled HR targets", () => {
    const input = "- Threshold 20m 78-89% LTHR intensity=active";
    expect(stripWorkoutTargets(input)).toBe("- Threshold 20m intensity=active");
  });

  it("strips bare unlabeled HR targets and adds a derived label", () => {
    const input = "- 20m 78-89% LTHR intensity=active";
    expect(stripWorkoutTargets(input)).toBe("- Race Pace 20m intensity=active");
  });

  it("uses real HR boundaries to keep unlabeled 77-84% LTHR steps Easy", () => {
    const input = "- 20m 77-84% LTHR intensity=active";
    expect(stripWorkoutTargets(input, TEST_LTHR, [...TEST_HR_ZONES])).toBe(
      "- Easy 20m intensity=active",
    );
  });

  it("still strips parenthetical HR targets", () => {
    const input = "- Threshold 20m 78-89% LTHR (133-151 bpm) intensity=active";
    expect(stripWorkoutTargets(input)).toBe("- Threshold 20m intensity=active");
  });

  it("strips decimal-distance HR targets without corrupting the label or duration", () => {
    const withBpm = "- Threshold 0.8km 89-99% LTHR (151-168 bpm) intensity=active";
    const withoutBpm = "- Threshold 0.8km 89-99% LTHR intensity=active";

    expect(stripWorkoutTargets(withBpm)).toBe(
      "- Threshold 0.8km intensity=active",
    );
    expect(stripWorkoutTargets(withoutBpm)).toBe(
      "- Threshold 0.8km intensity=active",
    );
  });

  it("strips decimal-minute HR targets without corrupting the duration", () => {
    const input = "- 1.5m 78-89% LTHR intensity=active";
    expect(stripWorkoutTargets(input)).toBe("- Race Pace 1.5m intensity=active");
  });

  it("adds Fast for unlabeled hard HR steps", () => {
    const input = "- 20m 89-99% LTHR (151-168 bpm) intensity=active";
    expect(stripWorkoutTargets(input)).toBe("- Fast 20m intensity=active");
  });

  it("adds Easy for unlabeled easy HR steps", () => {
    const input = "- 3m 66-78% LTHR intensity=active";
    expect(stripWorkoutTargets(input)).toBe("- Easy 3m intensity=active");
  });

  it("uses warmup, cooldown, and rest context before deriving a label", () => {
    const input = [
      "Warmup",
      "- 10m 66-78% LTHR intensity=active",
      "",
      "Main set",
      "- 2m 89-99% LTHR intensity=rest",
      "",
      "Cooldown",
      "- 5m 89-99% LTHR (151-168 bpm) intensity=active",
    ].join("\n");

    expect(stripWorkoutTargets(input)).toBe([
      "Warmup",
      "- Warmup 10m intensity=active",
      "",
      "Main set",
      "- Easy 2m intensity=rest",
      "",
      "Cooldown",
      "- Cooldown 5m intensity=active",
    ].join("\n"));
  });

  it("keeps an existing label and only removes the HR target", () => {
    const input = "- Uphill 2m 89-99% LTHR intensity=active";
    expect(stripWorkoutTargets(input)).toBe("- Uphill 2m intensity=active");
  });

  it("keeps supported legacy labels parseable after stripping", () => {
    const threshold = "- Threshold 20m 89-99% LTHR intensity=active";
    const recovery = "- Recovery 3m 66-78% LTHR intensity=rest";

    expect(stripWorkoutTargets(threshold)).toBe("- Threshold 20m intensity=active");
    expect(stripWorkoutTargets(recovery)).toBe("- Recovery 3m intensity=rest");
  });

  it("replaces unsupported labels with a derived parseable label", () => {
    const input = "- Tempo Block 20m 78-89% LTHR intensity=active";
    expect(stripWorkoutTargets(input)).toBe("- Race Pace 20m intensity=active");
  });

  it("keeps labels, durations, distances, sections, repeats, and intensity tags", () => {
    const input = [
      "Long run with a race pace block.",
      "",
      "Warmup",
      "- Warmup 1km 6:15-18:20/km Pace intensity=warmup",
      "",
      "Main set",
      "- Easy 3km 30-88% pace intensity=active",
      "- Race Pace 3km 78-89% LTHR (132-150 bpm) intensity=active",
      "",
      "Cooldown",
      "- Cooldown 2km 6:15-18:20/km Pace intensity=cooldown",
      "",
    ].join("\n");

    const result = stripWorkoutTargets(input);
    expect(result).not.toContain("/km Pace");
    expect(result).not.toContain("% pace");
    expect(result).not.toContain("% LTHR");
    expect(result).not.toContain("bpm");
    expect(result).toContain("Warmup");
    expect(result).toContain("- Warmup 1km intensity=warmup");
    expect(result).toContain("- Race Pace 3km intensity=active");
    expect(result).toContain("- Cooldown 2km intensity=cooldown");
  });

  it("leaves target-looking text in workout notes unchanged", () => {
    const input = [
      "Run 30-88% pace only if it feels comfortable. HR guidance: 66-78% LTHR (112-132 bpm).",
      "",
      "Main set",
      "- Easy 35m 30-88% pace intensity=active",
    ].join("\n");

    const result = stripWorkoutTargets(input);
    expect(result).toContain("Run 30-88% pace only if it feels comfortable.");
    expect(result).toContain("HR guidance: 66-78% LTHR (112-132 bpm).");
    expect(result).toContain("- Easy 35m intensity=active");
  });
});
