import { describe, it, expect } from "vitest";
import {
  computeTrend,
  trendArrow,
  type BGReading,
} from "../cgm";

// --- trendArrow ---

describe("trendArrow", () => {
  it("maps all Nightscout direction strings", () => {
    expect(trendArrow("DoubleUp")).toBe("⇈");
    expect(trendArrow("SingleUp")).toBe("↑");
    expect(trendArrow("FortyFiveUp")).toBe("↗");
    expect(trendArrow("Flat")).toBe("→");
    expect(trendArrow("FortyFiveDown")).toBe("↘");
    expect(trendArrow("SingleDown")).toBe("↓");
    expect(trendArrow("DoubleDown")).toBe("⇊");
    expect(trendArrow("NOT COMPUTABLE")).toBe("?");
    expect(trendArrow("RATE OUT OF RANGE")).toBe("⚠");
  });

  it("returns ? for unknown directions", () => {
    expect(trendArrow("UNKNOWN")).toBe("?");
    expect(trendArrow("")).toBe("?");
  });
});

// --- computeTrend ---

describe("computeTrend", () => {
  function makeReadings(
    values: number[],
    intervalMin = 5,
    startTs = 1708300000000,
  ): BGReading[] {
    return values.map((mmol, i) => ({
      sgv: Math.round(mmol * 18.018),
      mmol,
      ts: startTs + i * intervalMin * 60 * 1000,
      direction: "NONE",
      delta: 0,
    }));
  }

  it("returns null for fewer than 2 readings", () => {
    expect(computeTrend([])).toBeNull();
    expect(computeTrend(makeReadings([8.0]))).toBeNull();
  });

  it("detects stable BG", () => {
    // 6 readings over 25 min, all ~8.0
    const readings = makeReadings([8.0, 8.1, 7.9, 8.0, 8.1, 8.0]);
    const trend = computeTrend(readings);
    expect(trend).not.toBeNull();
    expect(Math.abs(trend!.slope)).toBeLessThan(0.05);
  });

  it("detects dropping BG", () => {
    // Dropping ~0.1 mmol/L per minute
    const readings = makeReadings([10.0, 9.0, 8.0, 7.0, 6.0, 5.0]);
    const trend = computeTrend(readings);
    expect(trend).not.toBeNull();
    expect(trend!.slope).toBeLessThan(-0.1);
  });

  it("detects rising BG", () => {
    // Rising ~0.1 mmol/L per minute
    const readings = makeReadings([5.0, 6.0, 7.0, 8.0, 9.0, 10.0]);
    const trend = computeTrend(readings);
    expect(trend).not.toBeNull();
    expect(trend!.slope).toBeGreaterThan(0.1);
  });

  it("only uses last 30 minutes of readings", () => {
    // Old readings (60+ min ago) should be excluded
    const now = Date.now();
    const readings: BGReading[] = [
      // Old: 60 min ago, BG was 15 (should be ignored)
      { sgv: 270, mmol: 15.0, ts: now - 60 * 60000, direction: "NONE", delta: 0 },
      { sgv: 252, mmol: 14.0, ts: now - 55 * 60000, direction: "NONE", delta: 0 },
      // Recent: last 25 min, stable at ~8.0
      { sgv: 144, mmol: 8.0, ts: now - 25 * 60000, direction: "NONE", delta: 0 },
      { sgv: 144, mmol: 8.0, ts: now - 20 * 60000, direction: "NONE", delta: 0 },
      { sgv: 145, mmol: 8.1, ts: now - 15 * 60000, direction: "NONE", delta: 0 },
      { sgv: 144, mmol: 8.0, ts: now - 10 * 60000, direction: "NONE", delta: 0 },
      { sgv: 143, mmol: 7.9, ts: now - 5 * 60000, direction: "NONE", delta: 0 },
      { sgv: 144, mmol: 8.0, ts: now, direction: "NONE", delta: 0 },
    ];
    const trend = computeTrend(readings);
    expect(trend).not.toBeNull();
    // Should be flat based on recent readings, not influenced by old high
    expect(Math.abs(trend!.slope)).toBeLessThan(0.05);
  });

  it("returns flat when all readings have the same timestamp", () => {
    const readings = makeReadings([8.0, 9.0, 10.0], 0); // 0 interval
    const trend = computeTrend(readings);
    expect(trend).toEqual({ slope: 0 });
  });
});
