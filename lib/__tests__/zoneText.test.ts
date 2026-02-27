import { describe, it, expect } from "vitest";
import { buildZoneBlock, buildProfileLine } from "../zoneText";

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
  it("generates four zone lines from LTHR fractions", () => {
    const block = buildZoneBlock(168);
    const lines = block.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("Easy:");
    expect(lines[1]).toContain("Race Pace:");
    expect(lines[2]).toContain("Interval:");
    expect(lines[3]).toContain("Hard:");
  });

  it("computes BPM from LTHR fractions when no hrZones", () => {
    const block = buildZoneBlock(168, 189);
    // 168 * 0.66 = 110.88 → 111, 168 * 0.78 = 131.04 → 131
    expect(block).toContain("111-131 bpm");
    // 168 * 0.78 = 131, 168 * 0.89 = 149.52 → 150
    expect(block).toContain("131-150 bpm");
    // hard upper capped by maxHr: min(168*1.11=186.48→186, 189) = 186
    expect(block).toContain("166-186 bpm");
  });

  it("uses exact hrZones boundaries when provided", () => {
    const hrZones = [112, 132, 150, 167, 189];
    const block = buildZoneBlock(168, 189, undefined, hrZones);
    expect(block).toContain("112-132 bpm");
    expect(block).toContain("132-150 bpm");
    expect(block).toContain("150-167 bpm");
    expect(block).toContain("167-189 bpm");
  });

  it("ignores hrZones with wrong length", () => {
    const block = buildZoneBlock(168, 189, undefined, [112, 132, 150]);
    // Should fall back to LTHR fractions
    expect(block).toContain("111-131 bpm");
  });

  it("includes Garmin zone labels", () => {
    const block = buildZoneBlock(168);
    expect(block).toContain("Z2,");
    expect(block).toContain("Z3,");
    expect(block).toContain("Z4,");
    expect(block).toContain("Z5,");
  });

  it("uses ~ prefix for pace except hard which uses <", () => {
    const block = buildZoneBlock(168);
    const lines = block.split("\n");
    expect(lines[0]).toMatch(/~\d+:\d+\/km/);
    expect(lines[1]).toMatch(/~\d+:\d+\/km/);
    expect(lines[2]).toMatch(/~\d+:\d+\/km/);
    expect(lines[3]).toMatch(/<\d+:\d+\/km/);
  });

  it("uses custom pace table when provided", () => {
    const paceTable = {
      easy: { zone: "easy" as const, avgPace: 7.5, sampleCount: 10 },
      steady: { zone: "steady" as const, avgPace: 6.0, sampleCount: 5 },
      tempo: { zone: "tempo" as const, avgPace: 5.0, sampleCount: 3 },
      hard: { zone: "hard" as const, avgPace: 4.5, sampleCount: 2 },
    };
    const block = buildZoneBlock(168, 189, paceTable);
    expect(block).toContain("~7:30/km");
    expect(block).toContain("~6:00/km");
    expect(block).toContain("~5:00/km");
    expect(block).toContain("<4:30/km");
  });
});
