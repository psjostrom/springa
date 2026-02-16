import { describe, it, expect, vi, beforeEach } from "vitest";
import { analyzeHistory } from "../analysis";

describe("analyzeHistory", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null results when no activities match prefix", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    }));

    const result = await analyzeHistory("test-key", "eco16");
    expect(result.longRun).toBeNull();
    expect(result.easyRun).toBeNull();
    expect(result.interval).toBeNull();
    expect(result.msg).toBe("No activities found");
  });

  it("returns failure message on fetch error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const result = await analyzeHistory("test-key", "eco16");
    expect(result.longRun).toBeNull();
    expect(result.easyRun).toBeNull();
    expect(result.interval).toBeNull();
    expect(result.msg).toBe("Analysis failed");
  });
});
