import { describe, it, expect } from "vitest";
import {
  normalizeEffortMetric,
  canUseHeartRateMetric,
  detectEffortMetric,
} from "../effortMetric";
import { TEST_LTHR, TEST_HR_ZONES } from "./testConstants";

describe("normalizeEffortMetric", () => {
  it("defaults missing and invalid to pace", () => {
    expect(normalizeEffortMetric(undefined)).toBe("pace");
    expect(normalizeEffortMetric(null)).toBe("pace");
    expect(normalizeEffortMetric("nope")).toBe("pace");
  });
  it("passes through valid values", () => {
    expect(normalizeEffortMetric("hr")).toBe("hr");
    expect(normalizeEffortMetric("feel")).toBe("feel");
    expect(normalizeEffortMetric("pace")).toBe("pace");
  });
});

describe("canUseHeartRateMetric", () => {
  it("requires lthr and 5 zones", () => {
    expect(canUseHeartRateMetric(TEST_LTHR, [...TEST_HR_ZONES])).toBe(true);
    expect(canUseHeartRateMetric(undefined, [...TEST_HR_ZONES])).toBe(false);
    expect(canUseHeartRateMetric(TEST_LTHR, [120, 150])).toBe(false);
  });
});

describe("detectEffortMetric", () => {
  it("detects feel from legacy By Feel name", () => {
    expect(detectEffortMetric("W05 Easy By Feel", "- Easy 40m intensity=active")).toBe("feel");
  });

  it("detects heart-rate from LTHR steps", () => {
    expect(
      detectEffortMetric(
        "W05 Easy",
        "- Easy 40m 68-83% LTHR (115-140 bpm) intensity=active",
      ),
    ).toBe("hr");
  });

  it("detects pace from absolute or percent pace steps", () => {
    expect(
      detectEffortMetric("W05 Easy", "- Easy 40m 6:49-20:00/km Pace intensity=active"),
    ).toBe("pace");
    expect(
      detectEffortMetric("W05 Easy", "- Easy 40m 30-94% pace intensity=active"),
    ).toBe("pace");
  });

  it("treats unmarked targetless descriptions as feel", () => {
    expect(detectEffortMetric("W05 Easy", "- Easy 40m intensity=active")).toBe("feel");
  });

  it("prefers feel name suffix over description targets for legacy rows", () => {
    expect(
      detectEffortMetric(
        "W05 Easy By Feel",
        "- Easy 40m 6:49-20:00/km Pace intensity=active",
      ),
    ).toBe("feel");
  });
});
