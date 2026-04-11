import { describe, it, expect } from "vitest";
import { buildZoneBlock, buildProfileLine } from "../zoneText";
import { TEST_HR_ZONES } from "./testConstants";

describe("buildProfileLine", () => {
  it("formats LTHR and max HR", () => {
    expect(buildProfileLine(168, 189)).toBe("LTHR 168 bpm, Max HR 189 bpm");
  });

  it("falls back to DEFAULT_MAX_HR when maxHr omitted", () => {
    const line = buildProfileLine(168);
    expect(line).toBe("LTHR 168 bpm, Max HR 189 bpm");
  });

  it("uses provided maxHr over default", () => {
    expect(buildProfileLine(170, 195)).toBe("LTHR 170 bpm, Max HR 195 bpm");
  });
});

describe("buildZoneBlock", () => {
  const hrZones = [...TEST_HR_ZONES];

  it("generates four zone lines", () => {
    const block = buildZoneBlock(168, 189, undefined, hrZones);
    const lines = block.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("Easy:");
    expect(lines[1]).toContain("Race Pace:");
    expect(lines[2]).toContain("Interval:");
    expect(lines[3]).toContain("Hard:");
  });

  it("uses exact hrZones BPM boundaries", () => {
    const block = buildZoneBlock(168, 189, undefined, hrZones);
    expect(block).toContain("114-140 bpm");
    expect(block).toContain("140-155 bpm");
    expect(block).toContain("155-167 bpm");
    expect(block).toContain("167-189 bpm");
  });

  it("returns unavailable message when hrZones missing", () => {
    const block = buildZoneBlock(168, 189);
    expect(block).toContain("not available");
  });

  it("returns unavailable message when hrZones has wrong length", () => {
    const block = buildZoneBlock(168, 189, undefined, [112, 132, 150]);
    expect(block).toContain("not available");
  });

  it("includes Garmin zone labels", () => {
    const block = buildZoneBlock(168, 189, undefined, hrZones);
    expect(block).toContain("Z2,");
    expect(block).toContain("Z3,");
    expect(block).toContain("Z4,");
    expect(block).toContain("Z5,");
  });

  it("uses ~ prefix for pace except hard which uses <", () => {
    const block = buildZoneBlock(168, 189, undefined, hrZones);
    const lines = block.split("\n");
    expect(lines[0]).toMatch(/~\d+:\d+\/km/);
    expect(lines[1]).toMatch(/~\d+:\d+\/km/);
    expect(lines[2]).toMatch(/~\d+:\d+\/km/);
    expect(lines[3]).toMatch(/<\d+:\d+\/km/);
  });

  it("uses custom pace table when provided", () => {
    const paceTable = {
      z1: null,
      z2: { zone: "z2" as const, avgPace: 7.5, sampleCount: 10 },
      z3: { zone: "z3" as const, avgPace: 6.0, sampleCount: 5 },
      z4: { zone: "z4" as const, avgPace: 5.0, sampleCount: 3 },
      z5: { zone: "z5" as const, avgPace: 4.5, sampleCount: 2 },
    };
    const block = buildZoneBlock(168, 189, paceTable, hrZones);
    expect(block).toContain("~7:30/km");
    expect(block).toContain("~6:00/km");
    expect(block).toContain("~5:00/km");
    expect(block).toContain("<4:30/km");
  });
});
