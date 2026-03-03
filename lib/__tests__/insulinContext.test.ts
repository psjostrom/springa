import { describe, it, expect } from "vitest";
import { buildInsulinContext } from "../insulinContext";
import type { MyLifeData, MyLifeEvent } from "../mylife";

// --- Helpers ---

const T0 = new Date("2026-02-15T14:00:00Z").getTime(); // run start
const HOUR = 60 * 60 * 1000;

function makeMyLifeData(events: MyLifeEvent[] = []): MyLifeData {
  return { events };
}

function bolusEvent(hoursBeforeRun: number, units: number): MyLifeEvent {
  return {
    timestamp: new Date(T0 - hoursBeforeRun * HOUR).toISOString(),
    type: "Bolus",
    value: units,
    unit: "U",
    id: crypto.randomUUID(),
  };
}

function carbEvent(hoursBeforeRun: number, grams: number): MyLifeEvent {
  return {
    timestamp: new Date(T0 - hoursBeforeRun * HOUR).toISOString(),
    type: "Carbohydrates",
    value: grams,
    unit: "g carb",
    id: crypto.randomUUID(),
  };
}

function basalEvent(hoursBeforeRun: number, rate: number): MyLifeEvent {
  return {
    timestamp: new Date(T0 - hoursBeforeRun * HOUR).toISOString(),
    type: "Basal rate",
    value: rate,
    unit: "U/h",
    id: crypto.randomUUID(),
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
      const result = buildInsulinContext(makeMyLifeData(), T0);
      expect(result).toBeNull();
    });

    it("when boluses are older than 5h", () => {
      const data = makeMyLifeData([bolusEvent(6, 3.0)]);
      const result = buildInsulinContext(data, T0);
      expect(result).toBeNull();
    });

    it("when only basal/carb events exist (no bolus)", () => {
      const data = makeMyLifeData([
        basalEvent(1, 1.5),
        carbEvent(1, 60),
      ]);
      const result = buildInsulinContext(data, T0);
      expect(result).toBeNull();
    });
  });

  describe("bolus IOB computation (Fiasp exponential)", () => {
    it("returns full dose for bolus at run start", () => {
      const data = makeMyLifeData([bolusEvent(0, 5.0)]);
      const result = buildInsulinContext(data, T0)!;
      expect(result.iobAtStart).toBe(5.0);
    });

    it("computes Fiasp decay for 1h-old bolus", () => {
      const data = makeMyLifeData([bolusEvent(1, 4.0)]);
      const result = buildInsulinContext(data, T0)!;
      const expected = Math.round(fiaspIOB(4.0, 60) * 100) / 100;
      expect(result.iobAtStart).toBe(expected);
    });

    it("computes Fiasp decay for 2h-old bolus", () => {
      const data = makeMyLifeData([bolusEvent(2, 4.0)]);
      const result = buildInsulinContext(data, T0)!;
      const expected = Math.round(fiaspIOB(4.0, 120) * 100) / 100;
      expect(result.iobAtStart).toBe(expected);
    });

    it("computes Fiasp decay for 3h-old bolus", () => {
      const data = makeMyLifeData([bolusEvent(3, 5.0)]);
      const result = buildInsulinContext(data, T0)!;
      const expected = Math.round(fiaspIOB(5.0, 180) * 100) / 100;
      expect(result.iobAtStart).toBe(expected);
      expect(result.iobAtStart).toBeGreaterThan(0.5);
      expect(result.iobAtStart).toBeLessThan(1.2);
    });

    it("sums IOB from multiple boluses", () => {
      const data = makeMyLifeData([
        bolusEvent(1, 4.0),
        bolusEvent(2, 4.0),
      ]);
      const result = buildInsulinContext(data, T0)!;
      const expected = Math.round((fiaspIOB(4.0, 60) + fiaspIOB(4.0, 120)) * 100) / 100;
      expect(result.iobAtStart).toBe(expected);
    });

    it("returns small but nonzero IOB for 4h-old bolus", () => {
      const data = makeMyLifeData([bolusEvent(4, 10.0)]);
      const result = buildInsulinContext(data, T0)!;
      expect(result.iobAtStart).toBeGreaterThan(0);
      expect(result.iobAtStart).toBeLessThan(1.0);
    });
  });

  describe("basal IOB", () => {
    it("computes basal IOB from constant rate", () => {
      // 1 U/h for 2 hours = 2U delivered, but decayed
      const data = makeMyLifeData([
        bolusEvent(3, 5.0), // need a bolus to not return null
        basalEvent(2, 1.0), // 1 U/h starting 2h ago
      ]);
      const result = buildInsulinContext(data, T0)!;
      expect(result.basalIOBAtStart).toBeGreaterThan(0);
      // 2U delivered over 2h, most recent portions have more IOB remaining
      expect(result.basalIOBAtStart).toBeLessThan(2.0);
    });

    it("handles 0 U/h basal (pump disconnect)", () => {
      const data = makeMyLifeData([
        bolusEvent(3, 5.0),
        basalEvent(1, 0), // pump disconnected 1h ago
      ]);
      const result = buildInsulinContext(data, T0)!;
      // No basal delivery in the last hour, only from earlier segments
      expect(result.lastBasalRate).toBe(0);
    });

    it("tracks last basal rate", () => {
      const data = makeMyLifeData([
        bolusEvent(3, 5.0),
        basalEvent(2, 1.5),
        basalEvent(1, 0.8),
        basalEvent(0.5, 1.2),
      ]);
      const result = buildInsulinContext(data, T0)!;
      expect(result.lastBasalRate).toBe(1.2);
    });
  });

  describe("total IOB", () => {
    it("sums bolus and basal IOB", () => {
      const data = makeMyLifeData([
        bolusEvent(1, 4.0),
        basalEvent(2, 1.0),
      ]);
      const result = buildInsulinContext(data, T0)!;
      expect(result.totalIOBAtStart).toBe(
        Math.round((result.iobAtStart + result.basalIOBAtStart) * 100) / 100,
      );
    });
  });

  describe("expectedBGImpact", () => {
    it("uses totalIOB × ISF (3.1 mmol/L per unit)", () => {
      const data = makeMyLifeData([bolusEvent(0, 1.0)]);
      const result = buildInsulinContext(data, T0)!;
      expect(result.iobAtStart).toBe(1.0);
      // totalIOB includes bolus (1.0) + basal (0 since no basal events)
      expect(result.expectedBGImpact).toBe(3.1);
    });
  });

  describe("carb events (separate from boluses)", () => {
    it("picks most recent carb event for meal fields", () => {
      const data = makeMyLifeData([
        bolusEvent(1.5, 5.0),
        carbEvent(1.5, 45),
      ]);
      const result = buildInsulinContext(data, T0)!;
      expect(result.timeSinceLastMeal).toBe(90);
      expect(result.lastMealCarbs).toBe(45);
    });

    it("picks most recent bolus and most recent carb independently", () => {
      const data = makeMyLifeData([
        bolusEvent(1, 2.0),
        bolusEvent(3, 5.0),
        carbEvent(1, 30),
        carbEvent(3, 60),
      ]);
      const result = buildInsulinContext(data, T0)!;
      expect(result.timeSinceLastBolus).toBe(60);
      expect(result.timeSinceLastMeal).toBe(60);
      expect(result.lastMealCarbs).toBe(30);
      expect(result.lastBolusUnits).toBe(2.0);
    });

    it("includes Hypo Carbohydrates as meal events", () => {
      const hypoCarb: MyLifeEvent = {
        timestamp: new Date(T0 - 0.5 * HOUR).toISOString(),
        type: "Hypo Carbohydrates",
        value: 15,
        unit: "g carb",
        id: crypto.randomUUID(),
      };
      const data = makeMyLifeData([
        bolusEvent(3, 5.0),
        hypoCarb,
      ]);
      const result = buildInsulinContext(data, T0)!;
      expect(result.timeSinceLastMeal).toBe(30);
      expect(result.lastMealCarbs).toBe(15);
    });
  });

  describe("fallback when no carb events", () => {
    it("falls back meal fields to bolus time when no carbs", () => {
      const data = makeMyLifeData([bolusEvent(2, 3.0)]);
      const result = buildInsulinContext(data, T0)!;
      expect(result.timeSinceLastMeal).toBe(120);
      expect(result.lastMealCarbs).toBe(0);
    });
  });

  describe("Ease-off events", () => {
    function easeOffEvent(hoursBeforeRun: number, durationH: number): MyLifeEvent {
      return {
        timestamp: new Date(T0 - hoursBeforeRun * HOUR).toISOString(),
        type: "Ease-off",
        value: durationH,
        unit: "h",
        id: crypto.randomUUID(),
      };
    }

    it("captures ease-off active at run start", () => {
      const data = makeMyLifeData([
        bolusEvent(3, 5.0),
        easeOffEvent(2, 3), // activated 2h ago, lasts 3h → still active
      ]);
      const result = buildInsulinContext(data, T0)!;
      expect(result.easeOffStartMin).toBe(120);
      expect(result.easeOffDurationH).toBe(3);
    });

    it("excludes ease-off that ended before run start", () => {
      const data = makeMyLifeData([
        bolusEvent(3, 5.0),
        easeOffEvent(4, 1), // activated 4h ago, lasted 1h → ended 3h ago
      ]);
      const result = buildInsulinContext(data, T0)!;
      expect(result.easeOffStartMin).toBeNull();
      expect(result.easeOffDurationH).toBeNull();
    });

    it("picks the most recent active ease-off", () => {
      const data = makeMyLifeData([
        bolusEvent(3, 5.0),
        easeOffEvent(3, 4), // activated 3h ago, lasts 4h → active
        easeOffEvent(1, 2), // activated 1h ago, lasts 2h → active (and more recent)
      ]);
      const result = buildInsulinContext(data, T0)!;
      expect(result.easeOffStartMin).toBe(60); // picks the 1h-ago one
      expect(result.easeOffDurationH).toBe(2);
    });

    it("returns null fields when no ease-off events exist", () => {
      const data = makeMyLifeData([bolusEvent(1, 4.0)]);
      const result = buildInsulinContext(data, T0)!;
      expect(result.easeOffStartMin).toBeNull();
      expect(result.easeOffDurationH).toBeNull();
    });
  });

  describe("Boost events", () => {
    function boostEvent(hoursBeforeRun: number, durationH: number): MyLifeEvent {
      return {
        timestamp: new Date(T0 - hoursBeforeRun * HOUR).toISOString(),
        type: "Boost",
        value: durationH,
        unit: "h",
        id: crypto.randomUUID(),
      };
    }

    it("captures boost active at run start", () => {
      const data = makeMyLifeData([
        bolusEvent(3, 5.0),
        boostEvent(1, 2), // activated 1h ago, lasts 2h → still active
      ]);
      const result = buildInsulinContext(data, T0)!;
      expect(result.boostStartMin).toBe(60);
      expect(result.boostDurationH).toBe(2);
    });

    it("excludes boost that ended before run start", () => {
      const data = makeMyLifeData([
        bolusEvent(3, 5.0),
        boostEvent(5, 2), // activated 5h ago, lasted 2h → ended 3h ago
      ]);
      const result = buildInsulinContext(data, T0)!;
      expect(result.boostStartMin).toBeNull();
      expect(result.boostDurationH).toBeNull();
    });

    it("returns null fields when no boost events exist", () => {
      const data = makeMyLifeData([bolusEvent(1, 4.0)]);
      const result = buildInsulinContext(data, T0)!;
      expect(result.boostStartMin).toBeNull();
      expect(result.boostDurationH).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("handles empty events array", () => {
      const result = buildInsulinContext({ events: [] }, T0);
      expect(result).toBeNull();
    });

    it("rounds IOB to 2 decimal places", () => {
      const data = makeMyLifeData([bolusEvent(37 / 60, 3.0)]);
      const result = buildInsulinContext(data, T0)!;
      const str = result.iobAtStart.toString();
      const decimals = str.includes(".") ? str.split(".")[1].length : 0;
      expect(decimals).toBeLessThanOrEqual(2);
    });
  });
});
