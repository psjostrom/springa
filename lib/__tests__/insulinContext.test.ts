import { describe, it, expect } from "vitest";
import { buildInsulinContext } from "../insulinContext";
import type { GlookoData } from "../glooko";

// --- Helpers ---

const T0 = new Date("2026-02-15T14:00:00Z").getTime(); // run start
const HOUR = 60 * 60 * 1000;

function makeGlookoData(overrides: Partial<GlookoData> = {}): GlookoData {
  return {
    boluses: [],
    ...overrides,
  };
}

function bolus(hoursBeforeRun: number, units: number, carbs: number | null = null) {
  return {
    pumpTimestamp: new Date(T0 - hoursBeforeRun * HOUR).toISOString(),
    insulinDelivered: units,
    carbsInput: carbs,
  };
}

// Fiasp IOB formula: dose * (1 + t/55) * exp(-t/55)
function fiaspIOB(units: number, minutesAgo: number): number {
  const ratio = minutesAgo / 55;
  return units * (1 + ratio) * Math.exp(-ratio);
}

// --- buildInsulinContext ---

describe("buildInsulinContext", () => {
  describe("returns null", () => {
    it("when no boluses in window", () => {
      const result = buildInsulinContext(makeGlookoData(), T0);
      expect(result).toBeNull();
    });

    it("when boluses are older than 5h", () => {
      const data = makeGlookoData({
        boluses: [bolus(6, 3.0)], // 6h ago — outside 5h window
      });
      const result = buildInsulinContext(data, T0);
      expect(result).toBeNull();
    });
  });

  describe("IOB computation (Fiasp exponential)", () => {
    it("returns full dose for bolus at run start", () => {
      const data = makeGlookoData({
        boluses: [bolus(0, 5.0)],
      });
      const result = buildInsulinContext(data, T0)!;
      expect(result.iobAtStart).toBe(5.0);
    });

    it("computes Fiasp decay for 1h-old bolus", () => {
      // 1h ago, 4u → 4 * (1 + 60/55) * exp(-60/55) ≈ 2.95u
      const data = makeGlookoData({
        boluses: [bolus(1, 4.0)],
      });
      const result = buildInsulinContext(data, T0)!;
      const expected = Math.round(fiaspIOB(4.0, 60) * 100) / 100;
      expect(result.iobAtStart).toBe(expected);
    });

    it("computes Fiasp decay for 2h-old bolus", () => {
      // 2h ago, 4u → 4 * (1 + 120/55) * exp(-120/55) ≈ 1.62u
      const data = makeGlookoData({
        boluses: [bolus(2, 4.0)],
      });
      const result = buildInsulinContext(data, T0)!;
      const expected = Math.round(fiaspIOB(4.0, 120) * 100) / 100;
      expect(result.iobAtStart).toBe(expected);
    });

    it("computes Fiasp decay for 3h-old bolus (pump DIA)", () => {
      // 3h ago, 5u → 5 * (1 + 180/55) * exp(-180/55) ≈ 0.81u
      const data = makeGlookoData({
        boluses: [bolus(3, 5.0)],
      });
      const result = buildInsulinContext(data, T0)!;
      const expected = Math.round(fiaspIOB(5.0, 180) * 100) / 100;
      expect(result.iobAtStart).toBe(expected);
      // Verify it's in the right ballpark (~16% at 3h)
      expect(result.iobAtStart).toBeGreaterThan(0.5);
      expect(result.iobAtStart).toBeLessThan(1.2);
    });

    it("sums IOB from multiple boluses", () => {
      const data = makeGlookoData({
        boluses: [bolus(1, 4.0), bolus(2, 4.0)],
      });
      const result = buildInsulinContext(data, T0)!;
      const expected = Math.round((fiaspIOB(4.0, 60) + fiaspIOB(4.0, 120)) * 100) / 100;
      expect(result.iobAtStart).toBe(expected);
    });

    it("returns small but nonzero IOB for 4h-old bolus", () => {
      // Unlike linear decay which returns 0 at 4h, Fiasp has a tail
      const data = makeGlookoData({
        boluses: [bolus(4, 10.0)],
      });
      const result = buildInsulinContext(data, T0)!;
      expect(result.iobAtStart).toBeGreaterThan(0);
      expect(result.iobAtStart).toBeLessThan(1.0); // ~7% of 10u = ~0.7u
    });
  });

  describe("expectedBGImpact", () => {
    it("computes IOB × ISF (3.1 mmol/L per unit)", () => {
      const data = makeGlookoData({
        boluses: [bolus(0, 1.0)], // 1u at run start → IOB = 1.0
      });
      const result = buildInsulinContext(data, T0)!;
      expect(result.iobAtStart).toBe(1.0);
      expect(result.expectedBGImpact).toBe(3.1); // 1.0 × 3.1
    });

    it("rounds to 1 decimal place", () => {
      const data = makeGlookoData({
        boluses: [bolus(1, 4.0)],
      });
      const result = buildInsulinContext(data, T0)!;
      // expectedBGImpact should have at most 1 decimal
      const str = result.expectedBGImpact.toString();
      const decimals = str.includes(".") ? str.split(".")[1].length : 0;
      expect(decimals).toBeLessThanOrEqual(1);
    });
  });

  describe("time since last bolus/meal", () => {
    it("computes time since last bolus", () => {
      const data = makeGlookoData({
        boluses: [bolus(2.5, 3.0)],
      });
      const result = buildInsulinContext(data, T0)!;
      expect(result.timeSinceLastBolus).toBe(150);
    });

    it("uses bolus carbsInput as meal", () => {
      const data = makeGlookoData({
        boluses: [bolus(1.5, 5.0, 45)],
      });
      const result = buildInsulinContext(data, T0)!;
      expect(result.timeSinceLastMeal).toBe(90);
      expect(result.lastMealCarbs).toBe(45);
    });

    it("picks most recent bolus and most recent carb entry", () => {
      const data = makeGlookoData({
        boluses: [bolus(1, 2.0, 30), bolus(3, 5.0, 60)],
      });
      const result = buildInsulinContext(data, T0)!;
      expect(result.timeSinceLastBolus).toBe(60);
      expect(result.timeSinceLastMeal).toBe(60);
      expect(result.lastMealCarbs).toBe(30);
      expect(result.lastBolusUnits).toBe(2.0);
    });
  });

  describe("fallback when bolus has no carbs", () => {
    it("falls back meal fields to bolus time when no carbs on any bolus", () => {
      const data = makeGlookoData({
        boluses: [bolus(2, 3.0)],
      });
      const result = buildInsulinContext(data, T0)!;
      expect(result.timeSinceLastMeal).toBe(120);
      expect(result.lastMealCarbs).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("handles empty arrays in GlookoData", () => {
      const result = buildInsulinContext({ boluses: [] }, T0);
      expect(result).toBeNull();
    });

    it("ignores zero-carb bolus entries for meal detection", () => {
      const data = makeGlookoData({
        boluses: [bolus(1, 2.0, 0)],
      });
      const result = buildInsulinContext(data, T0)!;
      expect(result.lastMealCarbs).toBe(0);
    });

    it("rounds IOB to 2 decimal places", () => {
      const data = makeGlookoData({
        boluses: [bolus(37 / 60, 3.0)],
      });
      const result = buildInsulinContext(data, T0)!;
      const str = result.iobAtStart.toString();
      const decimals = str.includes(".") ? str.split(".")[1].length : 0;
      expect(decimals).toBeLessThanOrEqual(2);
    });
  });
});
