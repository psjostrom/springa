import { describe, it, expect } from "vitest";
import {
  parseNightscoutEntries,
  computeTrend,
  trendArrow,
  type XdripReading,
} from "../xdrip";

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

// --- parseNightscoutEntries ---

describe("parseNightscoutEntries", () => {
  it("parses a valid array of entries", () => {
    const body = [
      {
        type: "sgv",
        sgv: 145,
        date: 1708300000000,
        dateString: "2026-02-19T10:00:00.000+01:00",
        direction: "Flat",
        device: "dexcom",
      },
      {
        type: "sgv",
        sgv: 180,
        date: 1708300300000,
        direction: "SingleUp",
      },
    ];

    const readings = parseNightscoutEntries(body);
    expect(readings).toHaveLength(2);

    expect(readings[0].sgv).toBe(145);
    expect(readings[0].mmol).toBe(8.0); // 145 / 18.018 ≈ 8.05 → 8.0
    expect(readings[0].ts).toBe(1708300000000);
    expect(readings[0].direction).toBe("Flat");

    expect(readings[1].sgv).toBe(180);
    expect(readings[1].mmol).toBe(10.0); // 180 / 18.018 ≈ 9.99 → 10.0
    expect(readings[1].direction).toBe("SingleUp");
  });

  it("parses a single object (not array)", () => {
    const body = { sgv: 100, date: 1708300000000, direction: "Flat" };
    const readings = parseNightscoutEntries(body);
    expect(readings).toHaveLength(1);
    expect(readings[0].sgv).toBe(100);
    expect(readings[0].mmol).toBe(5.6); // 100 / 18.018 ≈ 5.55 → 5.6
  });

  it("returns empty for invalid entries", () => {
    expect(parseNightscoutEntries([])).toHaveLength(0);
    expect(parseNightscoutEntries(null)).toHaveLength(0);
    expect(parseNightscoutEntries([{ sgv: 0 }])).toHaveLength(0); // sgv must be > 0
    expect(parseNightscoutEntries([{ foo: "bar" }])).toHaveLength(0);
  });

  it("skips entries with missing sgv", () => {
    const body = [
      { sgv: 145, date: 1708300000000, direction: "Flat" },
      { date: 1708300300000, direction: "Flat" }, // no sgv
      { sgv: -5, date: 1708300300000 }, // negative sgv
    ];
    const readings = parseNightscoutEntries(body);
    expect(readings).toHaveLength(1);
  });

  it("uses dateString when date is missing", () => {
    const body = {
      sgv: 145,
      dateString: "2026-02-19T10:00:00.000Z",
      direction: "Flat",
    };
    const readings = parseNightscoutEntries(body);
    expect(readings[0].ts).toBe(new Date("2026-02-19T10:00:00.000Z").getTime());
  });

  it("defaults direction to NONE when missing", () => {
    const body = { sgv: 145, date: 1708300000000 };
    const readings = parseNightscoutEntries(body);
    expect(readings[0].direction).toBe("NONE");
  });

  it("correctly converts mg/dL to mmol/L", () => {
    // Known conversions
    const cases = [
      { sgv: 72, expected: 4.0 },
      { sgv: 180, expected: 10.0 },
      { sgv: 252, expected: 14.0 },
      { sgv: 54, expected: 3.0 },
    ];

    for (const { sgv, expected } of cases) {
      const readings = parseNightscoutEntries({ sgv, date: 1 });
      expect(readings[0].mmol).toBe(expected);
    }
  });
});

// --- computeTrend ---

describe("computeTrend", () => {
  function makeReadings(
    values: number[],
    intervalMin: number = 5,
    startTs: number = 1708300000000,
  ): XdripReading[] {
    return values.map((mmol, i) => ({
      sgv: Math.round(mmol * 18.018),
      mmol,
      ts: startTs + i * intervalMin * 60 * 1000,
      direction: "NONE",
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
    expect(trend!.direction).toBe("Flat");
    expect(Math.abs(trend!.slope)).toBeLessThan(0.5);
  });

  it("detects dropping BG", () => {
    // Dropping ~1 mmol/L per 10 min
    const readings = makeReadings([10.0, 9.0, 8.0, 7.0, 6.0, 5.0]);
    const trend = computeTrend(readings);
    expect(trend).not.toBeNull();
    expect(trend!.slope).toBeLessThan(-1.0);
    expect(["SingleDown", "DoubleDown"]).toContain(trend!.direction);
  });

  it("detects rising BG", () => {
    // Rising ~1 mmol/L per 10 min
    const readings = makeReadings([5.0, 6.0, 7.0, 8.0, 9.0, 10.0]);
    const trend = computeTrend(readings);
    expect(trend).not.toBeNull();
    expect(trend!.slope).toBeGreaterThan(1.0);
    expect(["SingleUp", "DoubleUp"]).toContain(trend!.direction);
  });

  it("only uses last 30 minutes of readings", () => {
    // Old readings (60+ min ago) should be excluded
    const now = Date.now();
    const readings: XdripReading[] = [
      // Old: 60 min ago, BG was 15 (should be ignored)
      { sgv: 270, mmol: 15.0, ts: now - 60 * 60000, direction: "NONE" },
      { sgv: 252, mmol: 14.0, ts: now - 55 * 60000, direction: "NONE" },
      // Recent: last 25 min, stable at ~8.0
      { sgv: 144, mmol: 8.0, ts: now - 25 * 60000, direction: "NONE" },
      { sgv: 144, mmol: 8.0, ts: now - 20 * 60000, direction: "NONE" },
      { sgv: 145, mmol: 8.1, ts: now - 15 * 60000, direction: "NONE" },
      { sgv: 144, mmol: 8.0, ts: now - 10 * 60000, direction: "NONE" },
      { sgv: 143, mmol: 7.9, ts: now - 5 * 60000, direction: "NONE" },
      { sgv: 144, mmol: 8.0, ts: now, direction: "NONE" },
    ];
    const trend = computeTrend(readings);
    expect(trend).not.toBeNull();
    // Should be flat based on recent readings, not influenced by old high
    expect(trend!.direction).toBe("Flat");
  });

  it("returns null when all readings have the same timestamp", () => {
    const readings = makeReadings([8.0, 9.0, 10.0], 0); // 0 interval
    const trend = computeTrend(readings);
    expect(trend).toBeNull();
  });
});
