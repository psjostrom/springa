import { describe, it, expect } from "vitest";
import {
  extractFuelRate,
  extractTotalCarbs,
  estimatePaceFromHR,
  calculateTotalCarbs,
} from "@/lib/utils";
import type { CalendarEvent } from "@/lib/types";

describe("extractFuelRate", () => {
  it("extracts fuel rate from new format", () => {
    expect(extractFuelRate("PUMP OFF - FUEL PER 10: 10g TOTAL: 50g")).toBe(10);
    expect(extractFuelRate("FUEL PER 10: 5g")).toBe(5);
    expect(extractFuelRate("PUMP ON - FUEL PER 10: 8g TOTAL: 32g")).toBe(8);
  });

  it("extracts fuel rate from old format", () => {
    expect(extractFuelRate("FUEL: 10g/10m")).toBe(10);
    expect(extractFuelRate("FUEL: 5g/10m")).toBe(5);
  });

  it("prefers new format over old format", () => {
    expect(extractFuelRate("FUEL PER 10: 10g FUEL: 5g/10m")).toBe(10);
  });

  it("returns null when no fuel rate found", () => {
    expect(extractFuelRate("Just a note")).toBeNull();
    expect(extractFuelRate("")).toBeNull();
  });
});

describe("extractTotalCarbs", () => {
  it("extracts total carbs from description", () => {
    expect(extractTotalCarbs("TOTAL: 50g")).toBe(50);
    expect(extractTotalCarbs("PUMP OFF - FUEL PER 10: 10g TOTAL: 63g")).toBe(63);
  });

  it("returns null when no total found", () => {
    expect(extractTotalCarbs("No total here")).toBeNull();
    expect(extractTotalCarbs("")).toBeNull();
  });
});

describe("estimatePaceFromHR", () => {
  it("returns easy pace for low HR", () => {
    expect(estimatePaceFromHR(120, 169)).toBe(6.75);
  });

  it("returns steady pace for moderate HR", () => {
    expect(estimatePaceFromHR(140, 169)).toBe(6.15);
  });

  it("returns tempo pace for high HR", () => {
    expect(estimatePaceFromHR(155, 169)).toBe(5.15);
  });

  it("returns hard pace for very high HR", () => {
    expect(estimatePaceFromHR(165, 169)).toBe(4.75);
  });
});

describe("calculateTotalCarbs", () => {
  it("returns total from description when available (new format)", () => {
    const event: CalendarEvent = {
      id: "1", date: new Date(), name: "Test", type: "planned", category: "easy",
      description: "PUMP OFF - FUEL PER 10: 10g TOTAL: 50g",
    };
    expect(calculateTotalCarbs(event)).toBe(50);
  });

  it("calculates from fuel rate and actual duration", () => {
    const event: CalendarEvent = {
      id: "1", date: new Date(), name: "Test", type: "completed", category: "easy",
      description: "FUEL: 10g/10m",
      duration: 3000, // 50 minutes
    };
    expect(calculateTotalCarbs(event)).toBe(50); // (50/10) * 10
  });

  it("estimates from distance and HR when no duration", () => {
    const event: CalendarEvent = {
      id: "1", date: new Date(), name: "Test", type: "completed", category: "easy",
      description: "FUEL: 10g/10m",
      distance: 5000, // 5km
      avgHr: 120, // easy pace ~6.75 min/km → 33.75 min
    };
    const result = calculateTotalCarbs(event);
    expect(result).toBe(34); // (33.75/10) * 10 = 33.75 → 34
  });

  it("falls back to 6 min/km when only distance is available", () => {
    const event: CalendarEvent = {
      id: "1", date: new Date(), name: "Test", type: "completed", category: "easy",
      description: "FUEL: 10g/10m",
      distance: 5000, // 5km → 30 min at 6 min/km
    };
    expect(calculateTotalCarbs(event)).toBe(30);
  });

  it("returns null when no fuel rate or distance", () => {
    const event: CalendarEvent = {
      id: "1", date: new Date(), name: "Test", type: "planned", category: "easy",
      description: "No fuel info",
    };
    expect(calculateTotalCarbs(event)).toBeNull();
  });

  it("prioritizes TOTAL from description over calculation", () => {
    const event: CalendarEvent = {
      id: "1", date: new Date(), name: "Test", type: "completed", category: "easy",
      description: "FUEL PER 10: 10g TOTAL: 63g",
      duration: 3000,
    };
    expect(calculateTotalCarbs(event)).toBe(63);
  });
});
