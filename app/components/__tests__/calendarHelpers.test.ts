import { describe, it, expect } from "vitest";
import {
  extractFuelRate,
  extractTotalCarbs,
} from "@/lib/utils";

describe("extractFuelRate", () => {
  it("extracts fuel rate from new format (returns g/h)", () => {
    expect(extractFuelRate("FUEL PER 10: 10g TOTAL: 50g")).toBe(60);
    expect(extractFuelRate("FUEL PER 10: 5g")).toBe(30);
    expect(extractFuelRate("FUEL PER 10: 8g TOTAL: 32g")).toBe(48);
  });

  it("extracts fuel rate from old format (returns g/h)", () => {
    expect(extractFuelRate("FUEL: 10g/10m")).toBe(60);
    expect(extractFuelRate("FUEL: 5g/10m")).toBe(30);
  });

  it("prefers new format over old format", () => {
    expect(extractFuelRate("FUEL PER 10: 10g FUEL: 5g/10m")).toBe(60);
  });

  it("returns null when no fuel rate found", () => {
    expect(extractFuelRate("Just a note")).toBeNull();
    expect(extractFuelRate("")).toBeNull();
  });
});

describe("extractTotalCarbs", () => {
  it("extracts total carbs from description", () => {
    expect(extractTotalCarbs("TOTAL: 50g")).toBe(50);
    expect(extractTotalCarbs("FUEL PER 10: 10g TOTAL: 63g")).toBe(63);
  });

  it("returns null when no total found", () => {
    expect(extractTotalCarbs("No total here")).toBeNull();
    expect(extractTotalCarbs("")).toBeNull();
  });
});

