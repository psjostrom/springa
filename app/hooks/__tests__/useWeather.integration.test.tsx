import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { renderHook, waitFor, act } from "@/lib/__tests__/test-utils";
import { server } from "@/lib/__tests__/msw/server";
import { useWeather } from "../useWeather";

const SMHI_URL =
  "https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/18.07/lat/59.28/data.json";

function snow1gResponse(entries: { time: string; temp: number; ws: number; gust: number; pmean: number; pcat: number }[]) {
  return {
    createdTime: "2026-04-23T00:00:00Z",
    referenceTime: "2026-04-23T00:00:00Z",
    geometry: { type: "Point", coordinates: [[18.07, 59.28]] },
    timeSeries: entries.map((entry) => ({
      time: entry.time,
      data: {
        air_temperature: entry.temp,
        wind_speed: entry.ws,
        wind_speed_of_gust: entry.gust,
        precipitation_amount_mean: entry.pmean,
        predominant_precipitation_type_at_surface: entry.pcat,
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
        precipitation_amount_mean_deterministic: entry.pmean,
        precipitation_amount_min: 0,
        precipitation_amount_max: entry.pmean * 2,
        precipitation_amount_median: entry.pmean,
        probability_of_precipitation: entry.pmean > 0 ? 50 : 0,
        precipitation_frozen_part: -9,
        symbol_code: 1,
        visibility_in_air: 30,
        wind_from_direction: 180,
      },
    })),
  };
}

describe("useWeather", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    server.use(
      http.get(SMHI_URL, () =>
        HttpResponse.json(
          snow1gResponse([
            { time: "2026-04-23T12:00:00Z", temp: 9, ws: 3, gust: 5, pmean: 0, pcat: 0 },
            { time: "2026-04-23T15:00:00Z", temp: 10, ws: 3, gust: 5, pmean: 0, pcat: 0 },
          ]),
        ),
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds clothing recommendations when an event crosses into the eligibility window", async () => {
    vi.setSystemTime(new Date("2026-04-23T00:00:00Z"));

    const events = [
      {
        id: "planned-1",
        date: new Date("2026-04-23T13:00:00Z"),
        type: "planned",
        category: "easy",
      },
    ];

    const { result } = renderHook(() => useWeather(events, 0));

    expect(result.current.size).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
    });

    await waitFor(() => {
      expect(result.current.has("planned-1")).toBe(true);
    });
  });
});