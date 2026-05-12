import { describe, it, expect } from "vitest";
import { buildPastRunsFromActivities } from "../pastRuns";
import type { CachedActivity } from "../activityStreamsDb";

function activity(overrides: Partial<CachedActivity>): CachedActivity {
  return {
    activityId: "a1",
    category: "easy",
    fuelRate: 60,
    hr: [],
    ...overrides,
  };
}

describe("buildPastRunsFromActivities", () => {
  it("excludes activities with no glucose data", () => {
    const out = buildPastRunsFromActivities([activity({ glucose: undefined })]);
    expect(out).toEqual([]);
  });

  it("excludes activities where the resolved start BG is <= 0 (sensor warmup)", () => {
    const out = buildPastRunsFromActivities([
      activity({ glucose: [{ time: 0, value: 0 }, { time: 30, value: 6.0 }] }),
    ]);
    expect(out).toEqual([]);
  });

  it("flags wentHypo when any glucose reading drops below 4.0", () => {
    const out = buildPastRunsFromActivities([
      activity({
        glucose: [
          { time: 0, value: 7.0 },
          { time: 30, value: 4.5 },
          { time: 60, value: 3.8 }, // hypo
        ],
      }),
    ]);
    expect(out).toEqual([{ startBG: 7.0, wentHypo: true }]);
  });

  it("flags wentHypo=false when glucose stays above 4.0", () => {
    const out = buildPastRunsFromActivities([
      activity({
        glucose: [
          { time: 0, value: 8.0 },
          { time: 30, value: 6.0 },
          { time: 60, value: 5.5 },
        ],
      }),
    ]);
    expect(out).toEqual([{ startBG: 8.0, wentHypo: false }]);
  });

  it("prefers runBGContext.pre.startBG over the first glucose sample", () => {
    // glucose[0]=5.5 but runBGContext.pre.startBG=7.2 (the closest CGM reading
    // to run start, computed server-side and more accurate than the first
    // stream sample). The helper must use the runBGContext value.
    const out = buildPastRunsFromActivities([
      activity({
        glucose: [
          { time: 0, value: 5.5 },
          { time: 30, value: 5.0 },
        ],
        runBGContext: {
          activityId: "a1",
          category: "easy",
          pre: {
            startBG: 7.2,
            entrySlope30m: -0.02,
            entryStability: 0.4,
            readingCount: 6,
          },
          post: null,
          totalBGImpact: null,
        },
      }),
    ]);
    expect(out).toEqual([{ startBG: 7.2, wentHypo: false }]);
  });
});
