import { describe, it, expect } from "vitest";
import {
  normalizeEffortMetric,
  canUseHeartRateMetric,
  detectEffortMetric,
  isEffortMetric,
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

describe("isEffortMetric", () => {
  it.each(["pace", "hr", "feel"])("accepts effort metric %s", (value) => {
    expect(isEffortMetric(value)).toBe(true);
  });

  it.each([undefined, null, "", "power", 1, {}])(
    "rejects effort metric %p",
    (value) => {
      expect(isEffortMetric(value)).toBe(false);
    },
  );
});

describe("canUseHeartRateMetric", () => {
  it("requires lthr and 5 zones", () => {
    expect(canUseHeartRateMetric(TEST_LTHR, [...TEST_HR_ZONES])).toBe(true);
    expect(canUseHeartRateMetric(undefined, [...TEST_HR_ZONES])).toBe(false);
    expect(canUseHeartRateMetric(TEST_LTHR, [120, 150])).toBe(false);
  });

  it("rejects non-positive, non-finite, and non-finite zone values", () => {
    expect(canUseHeartRateMetric(0, [...TEST_HR_ZONES])).toBe(false);
    expect(canUseHeartRateMetric(-1, [...TEST_HR_ZONES])).toBe(false);
    expect(canUseHeartRateMetric(Number.NaN, [...TEST_HR_ZONES])).toBe(false);
    expect(canUseHeartRateMetric(Number.POSITIVE_INFINITY, [...TEST_HR_ZONES])).toBe(false);
    expect(canUseHeartRateMetric(170, [80, 90, 100, 110, Number.NaN])).toBe(false);
    expect(canUseHeartRateMetric(170, [80, 90, 100, 110, Number.POSITIVE_INFINITY])).toBe(false);
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
