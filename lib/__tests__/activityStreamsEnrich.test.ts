import { describe, it, expect, vi, beforeEach } from "vitest";
import { enrichActivitiesWithGlucose } from "../activityStreamsEnrich";
import type { CachedActivity } from "../activityStreamsDb";

const mockGetXdripReadingsForRange = vi.fn();
vi.mock("../xdripDb", () => ({
  getXdripReadingsForRange: (...args: unknown[]) => mockGetXdripReadingsForRange(...args),
}));

function makeActivity(overrides: Partial<CachedActivity> = {}): CachedActivity {
  return {
    activityId: "act-1",
    category: "easy",
    fuelRate: 48,
    hr: [{ time: 0, value: 120 }, { time: 30, value: 130 }],
    runStartMs: 1000000,
    ...overrides,
  };
}

describe("enrichActivitiesWithGlucose", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array for empty activities", async () => {
    const result = await enrichActivitiesWithGlucose("test@test.com", []);
    expect(result).toHaveLength(0);
    expect(mockGetXdripReadingsForRange).not.toHaveBeenCalled();
  });

  it("returns activities with empty glucose when no runStartMs", async () => {
    const acts = [makeActivity({ runStartMs: undefined })];
    const result = await enrichActivitiesWithGlucose("test@test.com", acts);
    expect(result[0].glucose).toBeUndefined();
    expect(mockGetXdripReadingsForRange).not.toHaveBeenCalled();
  });

  it("fetches range based on activity timestamps and enriches", async () => {
    const startMs = 1_700_000_000_000;
    const acts = [
      makeActivity({
        activityId: "a1",
        runStartMs: startMs,
        hr: [{ time: 0, value: 120 }, { time: 30, value: 130 }],
      }),
    ];

    // Return xDrip readings that cover the run window
    mockGetXdripReadingsForRange.mockResolvedValue([
      { ts: startMs, mmol: 10.0, sgv: 180, direction: "Flat" },
      { ts: startMs + 5 * 60 * 1000, mmol: 9.5, sgv: 171, direction: "Flat" },
      { ts: startMs + 30 * 60 * 1000, mmol: 8.0, sgv: 144, direction: "Flat" },
    ]);

    const result = await enrichActivitiesWithGlucose("test@test.com", acts);
    expect(mockGetXdripReadingsForRange).toHaveBeenCalledOnce();
    expect(result[0].glucose!.length).toBeGreaterThan(0);
  });

  it("excludes activities without runStartMs from maxMs calculation", async () => {
    const startMs = 1_700_000_000_000;
    const acts = [
      makeActivity({ activityId: "a1", runStartMs: startMs, hr: [{ time: 0, value: 120 }] }),
      makeActivity({ activityId: "a2", runStartMs: undefined, hr: [{ time: 0, value: 120 }] }),
    ];

    mockGetXdripReadingsForRange.mockResolvedValue([]);

    await enrichActivitiesWithGlucose("test@test.com", acts);

    // maxMs should be based on a1's startMs, not a2's undefined → 0 fallback
    const [, callMinMs, callMaxMs] = mockGetXdripReadingsForRange.mock.calls[0];
    expect(callMinMs).toBeGreaterThan(1_000_000_000_000);
    expect(callMaxMs).toBeGreaterThan(1_000_000_000_000);
  });
});
