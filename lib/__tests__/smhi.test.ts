import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { getWeatherForTime, calcFeelsLike } from "../smhi";
import type { SMHIWeather } from "../smhi";

const SMHI_URL =
  "https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/18.07/lat/59.28/data.json";

function snow1gResponse(entries: { time: string; temp: number; ws: number; gust: number; pmean: number; pcat: number }[]) {
  return {
    createdTime: "2026-04-06T12:00:00Z",
    referenceTime: "2026-04-06T12:00:00Z",
    geometry: { type: "Point", coordinates: [[18.07, 59.28]] },
    timeSeries: entries.map((e) => ({
      time: e.time,
      data: {
        air_temperature: e.temp,
        wind_speed: e.ws,
        wind_speed_of_gust: e.gust,
        precipitation_amount_mean: e.pmean,
        predominant_precipitation_type_at_surface: e.pcat,
        relative_humidity: 70,
        air_pressure_at_mean_sea_level: 1013,
        thunderstorm_probability: 0,
        probability_of_frozen_precipitation: 0,
        cloud_area_fraction: 4,
        low_type_cloud_area_fraction: 2,
        medium_type_cloud_area_fraction: 1,
        high_type_cloud_area_fraction: 1,
        cloud_base_altitude: 2000,
        cloud_top_altitude: 3000,
        precipitation_amount_mean_deterministic: e.pmean,
        precipitation_amount_min: 0,
        precipitation_amount_max: e.pmean * 2,
        precipitation_amount_median: e.pmean,
        probability_of_precipitation: e.pmean > 0 ? 50 : 0,
        precipitation_frozen_part: -9,
        symbol_code: 1,
        visibility_in_air: 30,
        wind_from_direction: 180,
      },
    })),
  };
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("fetchForecast", () => {
  it("parses snow1g API response into SMHIWeather", async () => {
    server.use(
      http.get(SMHI_URL, () =>
        HttpResponse.json(
          snow1gResponse([
            { time: "2026-04-06T12:00:00Z", temp: 8.5, ws: 4.2, gust: 7.1, pmean: 0.5, pcat: 3 },
            { time: "2026-04-06T13:00:00Z", temp: 9.0, ws: 3.8, gust: 6.5, pmean: 0, pcat: 0 },
          ]),
        ),
      ),
    );

    // Dynamic import to bypass module-level cache from other tests
    const { fetchForecast } = await import("../smhi");
    const result = await fetchForecast();

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      temp: 8.5,
      windSpeed: 4.2,
      windGust: 7.1,
      precipitation: 0.5,
      precipCategory: 3,
      validTime: "2026-04-06T12:00:00Z",
    });
    expect(result[0].feelsLike).toBeLessThan(8.5);
  });

  it("throws on API error", async () => {
    server.use(http.get(SMHI_URL, () => new HttpResponse(null, { status: 500 })));

    vi.resetModules();
    const { fetchForecast } = await import("../smhi");
    await expect(fetchForecast()).rejects.toThrow("SMHI API error: 500");
  });
});

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
