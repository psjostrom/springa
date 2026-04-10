import { describe, it, expect } from "vitest";
import { classifyHR, computeKarvonenZones, computeMaxHRZones, ZONE_COLORS, ZONE_TO_NAME } from "../constants";
import { TEST_HR_ZONES } from "./testConstants";

const hrZones = [...TEST_HR_ZONES];

describe("classifyHR with dynamic zone boundaries", () => {
  // TEST_HR_ZONES = [114, 140, 155, 167, 189]
  it("below Z1 ceiling: z1", () => {
    expect(classifyHR(100, hrZones)).toBe("z1");
    expect(classifyHR(114, hrZones)).toBe("z1");
  });

  it("above Z1, at/below Z2: z2", () => {
    expect(classifyHR(115, hrZones)).toBe("z2");
    expect(classifyHR(140, hrZones)).toBe("z2");
  });

  it("above Z2, at/below Z3: z3", () => {
    expect(classifyHR(141, hrZones)).toBe("z3");
    expect(classifyHR(155, hrZones)).toBe("z3");
  });

  it("above Z3, at/below Z4: z4", () => {
    expect(classifyHR(156, hrZones)).toBe("z4");
    expect(classifyHR(167, hrZones)).toBe("z4");
  });

  it("above Z4: z5", () => {
    expect(classifyHR(168, hrZones)).toBe("z5");
    expect(classifyHR(189, hrZones)).toBe("z5");
    expect(classifyHR(200, hrZones)).toBe("z5");
  });
});

describe("ZONE_TO_NAME mapping", () => {
  it("z1 and z2 map to easy", () => {
    expect(ZONE_TO_NAME.z1).toBe("easy");
    expect(ZONE_TO_NAME.z2).toBe("easy");
  });

  it("z3 maps to steady", () => {
    expect(ZONE_TO_NAME.z3).toBe("steady");
  });

  it("z4 maps to tempo", () => {
    expect(ZONE_TO_NAME.z4).toBe("tempo");
  });

  it("z5 maps to hard", () => {
    expect(ZONE_TO_NAME.z5).toBe("hard");
  });
});

describe("ZONE_COLORS has all zones", () => {
  it("has distinct colors for each zone", () => {
    expect(ZONE_COLORS.z1).toBeDefined();
    expect(ZONE_COLORS.z2).toBeDefined();
    expect(ZONE_COLORS.z3).toBeDefined();
    expect(ZONE_COLORS.z4).toBeDefined();
    expect(ZONE_COLORS.z5).toBeDefined();
  });
});

describe("classifyHR + ZONE_TO_NAME integration", () => {
  it("classifies HR to zone name correctly", () => {
    expect(ZONE_TO_NAME[classifyHR(100, hrZones)]).toBe("easy");
    expect(ZONE_TO_NAME[classifyHR(130, hrZones)]).toBe("easy");
    expect(ZONE_TO_NAME[classifyHR(148, hrZones)]).toBe("steady");
    expect(ZONE_TO_NAME[classifyHR(162, hrZones)]).toBe("tempo");
    expect(ZONE_TO_NAME[classifyHR(175, hrZones)]).toBe("hard");
  });
});

describe("computeKarvonenZones", () => {
  it("computes 5 zones from maxHR and restingHR", () => {
    const zones = computeKarvonenZones(193, 61);
    // HRR = 132
    expect(zones).toEqual([
      Math.round(132 * 0.60 + 61), // 140
      Math.round(132 * 0.70 + 61), // 153
      Math.round(132 * 0.80 + 61), // 167
      Math.round(132 * 0.90 + 61), // 180
      193, // maxHR
    ]);
  });

  it("works with different inputs", () => {
    const zones = computeKarvonenZones(180, 60);
    expect(zones[0]).toBe(Math.round(120 * 0.60 + 60));
    expect(zones[4]).toBe(180);
  });

  it("produces zones compatible with classifyHR", () => {
    const zones = computeKarvonenZones(193, 61);
    expect(zones).toHaveLength(5);
    for (let i = 1; i < zones.length; i++) {
      expect(zones[i]).toBeGreaterThan(zones[i - 1]);
    }
  });
});

describe("computeMaxHRZones", () => {
  it("computes 5 zones from maxHR using Runna percentages (65/81/89/97)", () => {
    const zones = computeMaxHRZones(185);
    expect(zones).toEqual([
      Math.round(185 * 0.65), // Z1 top: 120
      Math.round(185 * 0.81), // Z2 top: 150
      Math.round(185 * 0.89), // Z3 top: 165
      Math.round(185 * 0.97), // Z4 top: 179
      185,                     // Z5 top: maxHR
    ]);
  });

  it("works with different maxHR values", () => {
    const zones = computeMaxHRZones(200);
    expect(zones[0]).toBe(Math.round(200 * 0.65));
    expect(zones[1]).toBe(Math.round(200 * 0.81));
    expect(zones[4]).toBe(200);
  });

  it("produces zones compatible with classifyHR", () => {
    const zones = computeMaxHRZones(185);
    expect(zones).toHaveLength(5);
    for (let i = 1; i < zones.length; i++) {
      expect(zones[i]).toBeGreaterThan(zones[i - 1]);
    }
  });

  it("Z2 is approximately 30 bpm wide at typical maxHR", () => {
    const zones = computeMaxHRZones(185);
    const z2Width = zones[1] - zones[0];
    expect(z2Width).toBeGreaterThanOrEqual(28);
    expect(z2Width).toBeLessThanOrEqual(32);
  });
});
