import { describe, it, expect } from "vitest";
import {
  classifyZone,
  getZoneColor,
  ZONE_COLORS,
} from "../constants";

describe("classifyZone + getZoneColor consistency", () => {
  // Both functions must agree on zone boundaries (>= threshold).
  // classifyZone has 4 zones (easy/steady/tempo/hard).
  // getZoneColor has 5 (z1–z5). Below z2 (66%), classifyZone still returns "easy".

  it("at z5 boundary (99%): hard / z5", () => {
    expect(classifyZone(99)).toBe("hard");
    expect(getZoneColor(99)).toBe(ZONE_COLORS.z5);
  });

  it("above z5 (111%): hard / z5", () => {
    expect(classifyZone(111)).toBe("hard");
    expect(getZoneColor(111)).toBe(ZONE_COLORS.z5);
  });

  it("just below z5 (98.9%): tempo / z4", () => {
    expect(classifyZone(98.9)).toBe("tempo");
    expect(getZoneColor(98.9)).toBe(ZONE_COLORS.z4);
  });

  it("at z4 boundary (89%): tempo / z4", () => {
    expect(classifyZone(89)).toBe("tempo");
    expect(getZoneColor(89)).toBe(ZONE_COLORS.z4);
  });

  it("just below z4 (88.9%): steady / z3", () => {
    expect(classifyZone(88.9)).toBe("steady");
    expect(getZoneColor(88.9)).toBe(ZONE_COLORS.z3);
  });

  it("at z3 boundary (78%): steady / z3", () => {
    expect(classifyZone(78)).toBe("steady");
    expect(getZoneColor(78)).toBe(ZONE_COLORS.z3);
  });

  it("just below z3 (77.9%): easy / z2", () => {
    expect(classifyZone(77.9)).toBe("easy");
    expect(getZoneColor(77.9)).toBe(ZONE_COLORS.z2);
  });

  it("at z2 boundary (66%): easy / z2", () => {
    expect(classifyZone(66)).toBe("easy");
    expect(getZoneColor(66)).toBe(ZONE_COLORS.z2);
  });

  it("below z2 (65%): easy / z1 (classifyZone lumps z1+z2 as easy)", () => {
    expect(classifyZone(65)).toBe("easy");
    expect(getZoneColor(65)).toBe(ZONE_COLORS.z1);
  });

  it("very low (30%): easy / z1", () => {
    expect(classifyZone(30)).toBe("easy");
    expect(getZoneColor(30)).toBe(ZONE_COLORS.z1);
  });
});

describe("zone mid-range values", () => {
  it("z2 mid (72%): easy / z2", () => {
    expect(classifyZone(72)).toBe("easy");
    expect(getZoneColor(72)).toBe(ZONE_COLORS.z2);
  });

  it("z3 mid (83%): steady / z3", () => {
    expect(classifyZone(83)).toBe("steady");
    expect(getZoneColor(83)).toBe(ZONE_COLORS.z3);
  });

  it("z4 mid (94%): tempo / z4", () => {
    expect(classifyZone(94)).toBe("tempo");
    expect(getZoneColor(94)).toBe(ZONE_COLORS.z4);
  });

  it("z5 mid (105%): hard / z5", () => {
    expect(classifyZone(105)).toBe("hard");
    expect(getZoneColor(105)).toBe(ZONE_COLORS.z5);
  });
});
