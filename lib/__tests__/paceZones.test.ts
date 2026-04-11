import { describe, it, expect } from "vitest";
import { computePaceZones, classifyPace, computePaceZoneTimes } from "../constants";

describe("computePaceZones", () => {
  it("produces 4 boundaries from threshold pace", () => {
    const zones = computePaceZones(6.0);
    expect(zones).toHaveLength(4);
    expect(zones[0]).toBeCloseTo(7.79, 1); // Z1/Z2 at 77%
    expect(zones[1]).toBeCloseTo(6.67, 1); // Z2/Z3 at 90%
    expect(zones[2]).toBeCloseTo(6.0, 1);  // Z3/Z4 at 100%
    expect(zones[3]).toBeCloseTo(5.61, 1); // Z4/Z5 at 107%
  });

  it("boundaries are in descending order (slower to faster)", () => {
    const zones = computePaceZones(5.5);
    for (let i = 0; i < zones.length - 1; i++) {
      expect(zones[i]).toBeGreaterThan(zones[i + 1]);
    }
  });
});

describe("classifyPace", () => {
  const zones = computePaceZones(6.0);

  it("classifies very slow pace as z1", () => {
    expect(classifyPace(8.5, zones)).toBe("z1");
  });
  it("classifies easy pace as z2", () => {
    expect(classifyPace(7.0, zones)).toBe("z2");
  });
  it("classifies moderate pace as z3", () => {
    expect(classifyPace(6.3, zones)).toBe("z3");
  });
  it("classifies threshold pace as z4", () => {
    expect(classifyPace(5.8, zones)).toBe("z4");
  });
  it("classifies very fast pace as z5", () => {
    expect(classifyPace(5.0, zones)).toBe("z5");
  });
  it("classifies exact threshold as z4 (not z3)", () => {
    expect(classifyPace(6.0, zones)).toBe("z4");
  });
});

describe("computePaceZoneTimes", () => {
  const zones = computePaceZones(6.0);

  it("sums time per zone from pace stream", () => {
    const stream = [7.0, 7.0, 7.0, 5.8, 5.8];
    const result = computePaceZoneTimes(stream, zones);
    expect(result.z2).toBe(3);
    expect(result.z4).toBe(2);
    expect(result.z1).toBe(0);
    expect(result.z3).toBe(0);
    expect(result.z5).toBe(0);
  });

  it("filters out zero pace values (stopped segments)", () => {
    const stream = [7.0, 0, 7.0, 0, 5.8];
    const result = computePaceZoneTimes(stream, zones);
    expect(result.z2).toBe(2);
    expect(result.z4).toBe(1);
  });

  it("applies sample interval multiplier", () => {
    const stream = [7.0, 7.0, 5.8];
    const result = computePaceZoneTimes(stream, zones, 5);
    expect(result.z2).toBe(10);
    expect(result.z4).toBe(5);
  });

  it("returns all zeros for empty stream", () => {
    const result = computePaceZoneTimes([], zones);
    expect(result).toEqual({ z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 });
  });
});
