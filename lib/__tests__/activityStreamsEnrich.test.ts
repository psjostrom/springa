import { describe, it, expect, vi, beforeEach } from "vitest";
import { enrichActivitiesWithGlucose } from "../activityStreamsEnrich";
import type { CachedActivity } from "../activityStreamsDb";

const mockFetchBGFromNS = vi.fn();
const mockGetUserCredentials = vi.fn();

vi.mock("../nightscout", () => ({
  fetchBGFromNS: (...args: unknown[]) => mockFetchBGFromNS(...args),
}));

vi.mock("../credentials", () => ({
  getUserCredentials: (...args: unknown[]) => mockGetUserCredentials(...args),
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
    // Default: no Nightscout configured
    mockGetUserCredentials.mockResolvedValue({
      nightscoutUrl: null,
      nightscoutSecret: null,
      intervalsApiKey: null,
      timezone: "Europe/Stockholm",
    });
  });

  it("returns empty array for empty activities", async () => {
    const result = await enrichActivitiesWithGlucose("test@test.com", []);
    expect(result).toHaveLength(0);
    expect(mockFetchBGFromNS).not.toHaveBeenCalled();
  });

  it("returns activities with empty glucose when no runStartMs", async () => {
    const acts = [makeActivity({ runStartMs: undefined })];
    const result = await enrichActivitiesWithGlucose("test@test.com", acts);
    expect(result[0].glucose).toBeUndefined();
    expect(mockFetchBGFromNS).not.toHaveBeenCalled();
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

    // Configure Nightscout credentials
    mockGetUserCredentials.mockResolvedValue({
      nightscoutUrl: "https://ns.example.com",
      nightscoutSecret: "test-secret",
      intervalsApiKey: null,
      timezone: "Europe/Stockholm",
    });

    // Return CGM readings that cover the run window
    mockFetchBGFromNS.mockResolvedValue([
      { ts: startMs, mmol: 10.0, sgv: 180, direction: "Flat", delta: 0 },
      { ts: startMs + 5 * 60 * 1000, mmol: 9.5, sgv: 171, direction: "Flat", delta: 0 },
      { ts: startMs + 30 * 60 * 1000, mmol: 8.0, sgv: 144, direction: "Flat", delta: 0 },
    ]);

    const result = await enrichActivitiesWithGlucose("test@test.com", acts);
    expect(mockFetchBGFromNS).toHaveBeenCalledOnce();
    expect(result[0].glucose!.length).toBeGreaterThan(0);
  });

  it("excludes activities without runStartMs from maxMs calculation", async () => {
    const startMs = 1_700_000_000_000;
    const acts = [
      makeActivity({ activityId: "a1", runStartMs: startMs, hr: [{ time: 0, value: 120 }] }),
      makeActivity({ activityId: "a2", runStartMs: undefined, hr: [{ time: 0, value: 120 }] }),
    ];

    // Configure Nightscout credentials
    mockGetUserCredentials.mockResolvedValue({
      nightscoutUrl: "https://ns.example.com",
      nightscoutSecret: "test-secret",
      intervalsApiKey: null,
      timezone: "Europe/Stockholm",
    });

    mockFetchBGFromNS.mockResolvedValue([]);

    await enrichActivitiesWithGlucose("test@test.com", acts);

    // maxMs should be based on a1's startMs, not a2's undefined → 0 fallback
    const [, , opts] = mockFetchBGFromNS.mock.calls[0];
    expect(opts.since).toBeGreaterThan(1_000_000_000_000);
    expect(opts.until).toBeGreaterThan(1_000_000_000_000);
  });
});
