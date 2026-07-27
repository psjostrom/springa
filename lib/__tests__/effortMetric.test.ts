import { describe, it, expect } from "vitest";
import { normalizeEffortMetric, canUseHeartRateMetric } from "../effortMetric";
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
