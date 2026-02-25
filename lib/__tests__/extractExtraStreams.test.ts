import { describe, it, expect } from "vitest";
import { extractExtraStreams } from "@/lib/streams";
import type { IntervalsStream } from "../types";

function stream(type: string, data: number[]): IntervalsStream {
  return { type, data };
}

describe("extractExtraStreams", () => {
  it("converts velocity_smooth to pace (min/km)", () => {
    // 3.0 m/s → 1000 / (3.0 * 60) = 5.556 min/km
    const streams: IntervalsStream[] = [
      stream("time", [0, 60, 120]),
      stream("velocity_smooth", [3.0, 3.0, 3.0]),
    ];
    const { pace } = extractExtraStreams(streams);

    expect(pace).toHaveLength(3);
    expect(pace[0].value).toBeCloseTo(1000 / (3.0 * 60), 2);
  });

  it("converts cadence to SPM (doubles half-cadence)", () => {
    const streams: IntervalsStream[] = [
      stream("time", [0, 60]),
      stream("cadence", [90, 92]),
    ];
    const { cadence } = extractExtraStreams(streams);

    expect(cadence).toHaveLength(2);
    expect(cadence[0].value).toBe(180); // 90 * 2
    expect(cadence[1].value).toBe(184); // 92 * 2
  });

  it("passes altitude through unchanged", () => {
    const streams: IntervalsStream[] = [
      stream("time", [0, 60]),
      stream("altitude", [100, 115]),
    ];
    const { altitude } = extractExtraStreams(streams);

    expect(altitude).toHaveLength(2);
    expect(altitude[0].value).toBe(100);
    expect(altitude[1].value).toBe(115);
  });

  it("filters out pace values outside 2.0-12.0 min/km range", () => {
    // velocity 10 m/s → 1.67 min/km (too fast, filtered)
    // velocity 3 m/s → 5.56 min/km (valid)
    // velocity 1 m/s → 16.67 min/km (too slow, filtered)
    const streams: IntervalsStream[] = [
      stream("time", [0, 60, 120]),
      stream("velocity_smooth", [10, 3, 1]),
    ];
    const { pace } = extractExtraStreams(streams);

    expect(pace).toHaveLength(1);
    expect(pace[0].value).toBeCloseTo(1000 / (3 * 60), 2);
  });

  it("filters out zero velocity", () => {
    const streams: IntervalsStream[] = [
      stream("time", [0, 60]),
      stream("velocity_smooth", [0, 3]),
    ];
    const { pace } = extractExtraStreams(streams);

    expect(pace).toHaveLength(1);
  });

  it("filters out zero cadence", () => {
    const streams: IntervalsStream[] = [
      stream("time", [0, 60]),
      stream("cadence", [0, 90]),
    ];
    const { cadence } = extractExtraStreams(streams);

    expect(cadence).toHaveLength(1);
    expect(cadence[0].value).toBe(180);
  });

  it("averages multiple samples within the same minute", () => {
    // Two samples at t=20s and t=25s both round to minute 0
    const streams: IntervalsStream[] = [
      stream("time", [20, 25]),
      stream("velocity_smooth", [3.0, 4.0]),
    ];
    const { pace } = extractExtraStreams(streams);

    // Both round to minute 0, so they should be averaged
    expect(pace).toHaveLength(1);
    const p1 = 1000 / (3.0 * 60);
    const p2 = 1000 / (4.0 * 60);
    expect(pace[0].value).toBeCloseTo((p1 + p2) / 2, 2);
  });

  it("returns empty arrays for empty streams", () => {
    const result = extractExtraStreams([]);
    expect(result.pace).toEqual([]);
    expect(result.cadence).toEqual([]);
    expect(result.altitude).toEqual([]);
  });

  it("returns empty arrays when time stream is missing", () => {
    const streams: IntervalsStream[] = [
      stream("velocity_smooth", [3.0, 3.0]),
    ];
    const result = extractExtraStreams(streams);
    expect(result.pace).toEqual([]);
  });

  it("sorts output by minute", () => {
    // Out-of-order time data
    const streams: IntervalsStream[] = [
      stream("time", [120, 0, 60]),
      stream("velocity_smooth", [3.0, 3.5, 3.2]),
    ];
    const { pace } = extractExtraStreams(streams);

    for (let i = 1; i < pace.length; i++) {
      expect(pace[i].time).toBeGreaterThanOrEqual(pace[i - 1].time);
    }
  });

  it("handles all three stream types simultaneously", () => {
    const streams: IntervalsStream[] = [
      stream("time", [0, 60, 120]),
      stream("velocity_smooth", [3.0, 3.2, 3.1]),
      stream("cadence", [90, 91, 90]),
      stream("altitude", [100, 105, 110]),
    ];
    const result = extractExtraStreams(streams);

    expect(result.pace).toHaveLength(3);
    expect(result.cadence).toHaveLength(3);
    expect(result.altitude).toHaveLength(3);
  });
});
