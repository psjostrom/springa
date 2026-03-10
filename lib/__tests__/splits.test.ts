import { describe, it, expect } from "vitest";
import { computeKmSplits } from "../splits";

function linearDistance(totalMeters: number, points: number): number[] {
  return Array.from({ length: points }, (_, i) => (i / (points - 1)) * totalMeters);
}

describe("computeKmSplits", () => {
  it("returns empty for no data", () => {
    expect(computeKmSplits({ distance: [], time: [] })).toEqual([]);
  });

  it("returns empty for sub-1km run", () => {
    const distance = linearDistance(500, 100);
    const time = Array.from({ length: 100 }, (_, i) => i * 3);
    expect(computeKmSplits({ distance, time })).toEqual([]);
  });

  it("computes correct number of splits and pace for constant-pace run", () => {
    // 3200m in 1600s → 500s per km = 8:20/km
    const points = 1600;
    const distance = linearDistance(3200, points);
    const time = Array.from({ length: points }, (_, i) => i);

    const splits = computeKmSplits({ distance, time });

    expect(splits).toHaveLength(3);
    expect(splits[0].km).toBe(1);
    expect(splits[0].paceMinPerKm).toBeCloseTo(500 / 60, 1);
    expect(splits[1].km).toBe(2);
    expect(splits[2].km).toBe(3);
  });

  it("handles varying pace across splits", () => {
    // km 1: 0-1000m in 420s (7:00/km), km 2: 1000-2000m in 300s (5:00/km)
    const d1 = Array.from({ length: 421 }, (_, i) => (i / 420) * 1000);
    const d2 = Array.from({ length: 300 }, (_, i) => 1000 + ((i + 1) / 300) * 1000);
    const dTail = Array.from({ length: 10 }, (_, i) => 2000 + ((i + 1) / 10) * 100);
    const distance = [...d1, ...d2, ...dTail];
    const time = Array.from({ length: distance.length }, (_, i) => i);

    const splits = computeKmSplits({ distance, time });

    expect(splits).toHaveLength(2);
    expect(splits[0].paceMinPerKm).toBeCloseTo(7.0, 0);
    expect(splits[1].paceMinPerKm).toBeCloseTo(5.0, 0);
  });

  it("drops partial last km (6028m → 6 splits, 28m dropped)", () => {
    const distance = linearDistance(6028, 3000);
    const time = Array.from({ length: 3000 }, (_, i) => i);
    const splits = computeKmSplits({ distance, time });
    expect(splits).toHaveLength(6);
    expect(splits[5].km).toBe(6);
  });

  it("handles exact km boundary (6000m → 6 splits)", () => {
    const distance = linearDistance(6000, 3000);
    const time = Array.from({ length: 3000 }, (_, i) => i);
    const splits = computeKmSplits({ distance, time });
    expect(splits).toHaveLength(6);
  });
});
