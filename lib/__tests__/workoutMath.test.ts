import { describe, it, expect } from "vitest";
import { estimatePlannedMinutes } from "../workoutMath";

describe("estimatePlannedMinutes", () => {
  it("uses event duration when available, ignoring description and fallback", () => {
    // 3600s = 60 min, description would parse to 41 min, fallback is 44 min
    const result = estimatePlannedMinutes(
      "- 41m 68-83% LTHR (115-140 bpm)",
      3600,
      2640,
    );
    expect(result).toBe(60);
  });

  it("falls back to description parsing when event duration is null", () => {
    const result = estimatePlannedMinutes(
      "- 41m 68-83% LTHR (115-140 bpm)",
      null,
      2640,
    );
    expect(result).toBe(41);
  });

  it("falls back to moving time when event duration and description are absent", () => {
    const result = estimatePlannedMinutes(undefined, null, 2640);
    expect(result).toBe(44);
  });

  it("returns null when all sources are absent", () => {
    expect(estimatePlannedMinutes(undefined, null, null)).toBeNull();
    expect(estimatePlannedMinutes(undefined, null)).toBeNull();
    expect(estimatePlannedMinutes(undefined, undefined)).toBeNull();
  });

  it("skips event duration of 0 and falls through to description", () => {
    const result = estimatePlannedMinutes(
      "- 41m 68-83% LTHR (115-140 bpm)",
      0,
    );
    expect(result).toBe(41);
  });

  it("skips fallback moving time of 0", () => {
    expect(estimatePlannedMinutes(undefined, null, 0)).toBeNull();
  });
});
