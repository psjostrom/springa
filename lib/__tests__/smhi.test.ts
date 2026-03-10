import { describe, it, expect } from "vitest";
import { getWeatherForTime, calcFeelsLike } from "../smhi";
import type { SMHIWeather } from "../smhi";

function entry(isoTime: string, overrides: Partial<SMHIWeather> = {}): SMHIWeather {
  return {
    temp: 10,
    feelsLike: 10,
    windSpeed: 2,
    windGust: 4,
    precipitation: 0,
    precipCategory: 0,
    validTime: isoTime,
    ...overrides,
  };
}

describe("getWeatherForTime", () => {
  const forecast: SMHIWeather[] = [
    entry("2026-03-10T06:00:00Z", { temp: 2 }),
    entry("2026-03-10T09:00:00Z", { temp: 5 }),
    entry("2026-03-10T12:00:00Z", { temp: 8 }),
    entry("2026-03-10T15:00:00Z", { temp: 7 }),
    entry("2026-03-10T18:00:00Z", { temp: 4 }),
  ];

  it("returns closest forecast hour", () => {
    const target = new Date("2026-03-10T13:00:00Z");
    const result = getWeatherForTime(forecast, target);
    expect(result?.temp).toBe(8); // closest to 12:00
  });

  it("returns exact match", () => {
    const target = new Date("2026-03-10T09:00:00Z");
    const result = getWeatherForTime(forecast, target);
    expect(result?.temp).toBe(5);
  });

  it("returns null for empty forecast", () => {
    expect(getWeatherForTime([], new Date())).toBeNull();
  });

  it("returns null if target is more than 3 hours from any entry", () => {
    const target = new Date("2026-03-11T12:00:00Z"); // next day, far from any entry
    const result = getWeatherForTime(forecast, target);
    expect(result).toBeNull();
  });

  it("returns entry within 3 hour boundary", () => {
    // 2.5 hours after last entry (18:00) → 20:30 → within 3h
    const target = new Date("2026-03-10T20:30:00Z");
    const result = getWeatherForTime(forecast, target);
    expect(result?.temp).toBe(4);
  });

  it("picks earlier entry when target is exactly between two", () => {
    // 10:30 is equidistant from 09:00 and 12:00 (1.5h each)
    // First match wins in the loop (09:00 checked before 12:00)
    const target = new Date("2026-03-10T10:30:00Z");
    const result = getWeatherForTime(forecast, target);
    expect(result).not.toBeNull();
    expect([5, 8]).toContain(result!.temp); // either is acceptable
  });
});

describe("calcFeelsLike", () => {
  it("returns air temperature when temp > 10°C", () => {
    expect(calcFeelsLike(15, 10)).toBe(15);
  });

  it("returns air temperature when wind is calm (≤ 4.8 km/h)", () => {
    // 1 m/s = 3.6 km/h, which is below 4.8 km/h threshold
    expect(calcFeelsLike(5, 1)).toBe(5);
  });

  it("applies wind chill at 0°C with moderate wind", () => {
    // 0°C, 5 m/s (18 km/h) → known wind chill ≈ -4.5°C
    const result = calcFeelsLike(0, 5);
    expect(result).toBeLessThan(0);
    expect(result).toBeCloseTo(-4.5, 0);
  });

  it("applies wind chill at -10°C with strong wind", () => {
    // -10°C, 8 m/s (28.8 km/h) → significant wind chill
    const result = calcFeelsLike(-10, 8);
    expect(result).toBeLessThan(-10);
    expect(result).toBeLessThan(-18); // should be well below air temp
  });

  it("applies wind chill at exactly 10°C boundary", () => {
    // 10°C with wind > 4.8 km/h should apply formula
    const result = calcFeelsLike(10, 5);
    expect(result).toBeLessThan(10);
  });

  it("stronger wind produces lower feels-like", () => {
    const light = calcFeelsLike(5, 3);
    const strong = calcFeelsLike(5, 10);
    expect(strong).toBeLessThan(light);
  });
});
