import { describe, it, expect } from "vitest";
import { extractPostRunSpikes } from "../postRunSpike";
import type { CachedActivity } from "../activityStreamsDb";

function makeCached(overrides: Partial<CachedActivity> = {}): CachedActivity {
  return {
    activityId: "a1",
    category: "easy",
    fuelRate: 60,
    hr: [],
    ...overrides,
  };
}

describe("extractPostRunSpikes", () => {
  it("extracts spike data from activities with post-run context", () => {
    const activities = [
      makeCached({
        activityId: "a1",
        category: "easy",
        fuelRate: 60,
        runBGContext: {
          activityId: "a1",
          category: "easy",
          pre: null,
          post: {
            recoveryDrop30m: 1.0,
            nadirPostRun: 5.0,
            timeToStable: 10,
            postRunHypo: false,
            endBG: 8.0,
            readingCount: 10,
            peak30m: 12.0,
            spike30m: 4.0,
          },
          totalBGImpact: null,
        },
      }),
    ];

    const result = extractPostRunSpikes(activities);
    expect(result).toHaveLength(1);
    expect(result[0].activityId).toBe("a1");
    expect(result[0].category).toBe("easy");
    expect(result[0].fuelRate).toBe(60);
    expect(result[0].spike30m).toBe(4.0);
  });

  it("skips activities without runBGContext", () => {
    const activities = [makeCached({ runBGContext: null })];
    expect(extractPostRunSpikes(activities)).toHaveLength(0);
  });

  it("skips activities without post-run context", () => {
    const activities = [
      makeCached({
        runBGContext: {
          activityId: "a1",
          category: "easy",
          pre: null,
          post: null,
          totalBGImpact: null,
        },
      }),
    ];
    expect(extractPostRunSpikes(activities)).toHaveLength(0);
  });

  it("skips activities where spike30m is undefined (pre-extension cache)", () => {
    const activities = [
      makeCached({
        runBGContext: {
          activityId: "a1",
          category: "easy",
          pre: null,
          post: {
            recoveryDrop30m: 1.0,
            nadirPostRun: 5.0,
            timeToStable: 10,
            postRunHypo: false,
            endBG: 8.0,
            readingCount: 10,
            // peak30m and spike30m intentionally missing (old cache)
          } as unknown as import("../runBGContext").PostRunContext,
          totalBGImpact: null,
        },
      }),
    ];
    expect(extractPostRunSpikes(activities)).toHaveLength(0);
  });
});
