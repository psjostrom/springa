import { describe, it, expect } from "vitest";
import { formatRunLine, classifyEntryLabel } from "../runLine";
import type { CalendarEvent } from "../types";
import type { RunBGContext } from "../runBGContext";

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "activity-a1",
    date: new Date("2026-02-18T10:00:00Z"),
    name: "Easy Run eco16",
    description: "",
    type: "completed",
    category: "easy",
    activityId: "a1",
    ...overrides,
  };
}

describe("formatRunLine", () => {
  it("includes date and name by default", () => {
    const line = formatRunLine(makeEvent(), { name: true });
    expect(line).toBe("- 2026-02-18 | Easy Run eco16");
  });

  it("date defaults to true", () => {
    const line = formatRunLine(makeEvent(), {});
    expect(line).toContain("2026-02-18");
  });

  it("date can be disabled", () => {
    const line = formatRunLine(makeEvent(), { date: false, name: true });
    expect(line).toBe("- Easy Run eco16");
  });

  it("includes all CalendarEvent fields when requested", () => {
    const event = makeEvent({
      distance: 7500,
      duration: 2100,
      pace: 7.2,
      avgHr: 125,
      maxHr: 148,
      load: 42,
      fuelRate: 48,
      carbsIngested: 32,
      hrZones: { z1: 60, z2: 1680, z3: 300, z4: 0, z5: 0 },
    });

    const line = formatRunLine(event, {
      date: true,
      name: true,
      category: true,
      distance: true,
      duration: true,
      pace: true,
      avgHr: true,
      maxHr: true,
      load: true,
      fuelRate: true,
      carbsIngested: true,
      hrZones: true,
    });

    expect(line).toContain("2026-02-18");
    expect(line).toContain("Easy Run eco16");
    expect(line).toContain("(easy)");
    expect(line).toContain("7.5km");
    expect(line).toContain("35m");
    expect(line).toContain("pace 7:12/km");
    expect(line).toContain("avgHR 125");
    expect(line).toContain("maxHR 148");
    expect(line).toContain("load 42");
    expect(line).toContain("fuel 48g/h");
    expect(line).toContain("carbs 32g");
    expect(line).toContain("Z1 1m Z2 28m Z3 5m Z4 0s Z5 0s");
  });

  it("omits missing optional fields", () => {
    const line = formatRunLine(
      makeEvent(),
      { date: true, name: true, distance: true, pace: true, avgHr: true, load: true },
    );
    // No distance/pace/avgHr/load on the event
    expect(line).toBe("- 2026-02-18 | Easy Run eco16");
  });

  it("uses | separator", () => {
    const event = makeEvent({ distance: 5000, avgHr: 120 });
    const line = formatRunLine(event, { date: true, distance: true, avgHr: true });
    expect(line).toBe("- 2026-02-18 | 5.0km | avgHR 120");
  });

  it("skips hrZones when total is 0", () => {
    const event = makeEvent({ hrZones: { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 } });
    const line = formatRunLine(event, { hrZones: true });
    expect(line).not.toContain("Z1");
  });

  it("skips hrZones when not present on event", () => {
    const line = formatRunLine(makeEvent(), { hrZones: true });
    expect(line).not.toContain("Z1");
  });

  it("rounds fuelRate", () => {
    const event = makeEvent({ fuelRate: 48.7 });
    const line = formatRunLine(event, { fuelRate: true });
    expect(line).toContain("fuel 49g/h");
  });

  // --- Extras: bgStartAndRate ---

  it("includes bgStartAndRate data", () => {
    const line = formatRunLine(makeEvent(), {}, {
      bgStartAndRate: { startBG: 10.5, avgRate: -0.6, entrySlope: null },
    });
    expect(line).toContain("startBG 10.5");
    expect(line).toContain("BG rate -0.60/10min");
  });

  it("includes entry slope in bgStartAndRate", () => {
    const line = formatRunLine(makeEvent(), {}, {
      bgStartAndRate: { startBG: 10.5, avgRate: -0.6, entrySlope: -0.8 },
    });
    expect(line).toContain("startBG 10.5 (entry -0.8/10m)");
  });

  it("shows positive sign for rising BG rate", () => {
    const line = formatRunLine(makeEvent(), {}, {
      bgStartAndRate: { startBG: 10.0, avgRate: 0.3, entrySlope: null },
    });
    expect(line).toContain("BG rate +0.30/10min");
  });

  // --- Extras: runBGContext ---

  it("includes runBGContext pre data", () => {
    const ctx: RunBGContext = {
      activityId: "a1",
      category: "easy",
      pre: { entrySlope30m: -0.3, entryStability: 0.2, startBG: 10, readingCount: 6 },
      post: null,
      totalBGImpact: null,
    };
    const line = formatRunLine(makeEvent(), {}, { runBGContext: ctx });
    expect(line).toContain("entry: -0.3/10m (stable)");
  });

  it("includes runBGContext post data", () => {
    const ctx: RunBGContext = {
      activityId: "a1",
      category: "easy",
      pre: null,
      post: { recoveryDrop30m: -1.5, nadirPostRun: 4.8, timeToStable: 25, postRunHypo: false, endBG: 7.5, readingCount: 8 },
      totalBGImpact: null,
    };
    const line = formatRunLine(makeEvent(), {}, { runBGContext: ctx });
    expect(line).toContain("recovery 30m: -1.5, lowest post-run 4.8");
    expect(line).not.toContain("HYPO!");
  });

  it("appends HYPO! when post-run hypo", () => {
    const ctx: RunBGContext = {
      activityId: "a1",
      category: "easy",
      pre: null,
      post: { recoveryDrop30m: -2.5, nadirPostRun: 3.5, timeToStable: null, postRunHypo: true, endBG: 6.0, readingCount: 8 },
      totalBGImpact: null,
    };
    const line = formatRunLine(makeEvent(), {}, { runBGContext: ctx });
    expect(line).toContain("HYPO!");
  });

  it("skips runBGContext when null", () => {
    const line = formatRunLine(makeEvent(), {}, { runBGContext: null });
    expect(line).not.toContain("entry:");
    expect(line).not.toContain("recovery");
  });

  // --- Extras: bgSummary ---

  it("includes bgSummary with all fields", () => {
    const line = formatRunLine(makeEvent(), {}, {
      bgSummary: { startBG: 10.2, endBG: 7.5, dropRate: -0.54 },
    });
    expect(line).toContain("startBG 10.2, endBG 7.5, drop -0.54/10m");
  });

  it("handles bgSummary with null endBG and dropRate", () => {
    const line = formatRunLine(makeEvent(), {}, {
      bgSummary: { startBG: 9.8, endBG: null, dropRate: null },
    });
    expect(line).toContain("startBG 9.8");
    expect(line).not.toContain("endBG");
    expect(line).not.toContain("drop");
  });

  it("shows positive sign for rising dropRate", () => {
    const line = formatRunLine(makeEvent(), {}, {
      bgSummary: { startBG: 8.0, endBG: 9.5, dropRate: 0.3 },
    });
    expect(line).toContain("drop +0.30/10m");
  });

  // --- Extras: feedback ---

  it("includes feedback rating and comment", () => {
    const line = formatRunLine(makeEvent(), {}, {
      feedback: { rating: "bad", comment: "BG crashed hard" },
    });
    expect(line).toContain("feedback: bad");
    expect(line).toContain('"BG crashed hard"');
  });

  it("includes feedback carbs", () => {
    const line = formatRunLine(makeEvent(), {}, {
      feedback: { rating: "good", carbsG: 45 },
    });
    expect(line).toContain("feedback: good, 45g reported");
  });

  it("skips feedback when null", () => {
    const line = formatRunLine(makeEvent(), {}, { feedback: null });
    expect(line).not.toContain("feedback:");
  });

  it("skips feedback when all fields empty", () => {
    const line = formatRunLine(makeEvent(), {}, { feedback: {} });
    expect(line).not.toContain("feedback:");
  });

  // --- Combined ---

  it("outputs all sections in correct order", () => {
    const event = makeEvent({ distance: 7500, pace: 7.2, avgHr: 125, load: 42, carbsIngested: 32 });
    const ctx: RunBGContext = {
      activityId: "a1",
      category: "easy",
      pre: { entrySlope30m: -0.3, entryStability: 0.2, startBG: 10, readingCount: 6 },
      post: { recoveryDrop30m: -1.5, nadirPostRun: 4.8, timeToStable: 25, postRunHypo: false, endBG: 7.5, readingCount: 8 },
      totalBGImpact: -5,
    };
    const line = formatRunLine(
      event,
      { date: true, name: true, distance: true, pace: true, avgHr: true, load: true, carbsIngested: true },
      {
        bgStartAndRate: { startBG: 10.5, avgRate: -0.6, entrySlope: null },
        runBGContext: ctx,
        feedback: { rating: "good", comment: "felt fine" },
      },
    );

    // Verify ordering: event fields → bgStartAndRate → runBGContext → feedback
    const idx = (s: string) => line.indexOf(s);
    expect(idx("7.5km")).toBeLessThan(idx("startBG"));
    expect(idx("startBG")).toBeLessThan(idx("entry:"));
    expect(idx("entry:")).toBeLessThan(idx("recovery"));
    expect(idx("recovery")).toBeLessThan(idx("feedback:"));
  });
});

describe("classifyEntryLabel", () => {
  it("returns crashing for steep negative slope", () => {
    expect(classifyEntryLabel(-1.5, 0.3)).toBe("crashing");
  });

  it("returns volatile for high stability", () => {
    expect(classifyEntryLabel(0.0, 2.0)).toBe("volatile");
  });

  it("returns stable for flat, calm readings", () => {
    expect(classifyEntryLabel(0.1, 0.3)).toBe("stable");
  });

  it("returns dropping for moderate negative slope", () => {
    expect(classifyEntryLabel(-0.5, 0.3)).toBe("dropping");
  });

  it("returns rising for positive slope", () => {
    expect(classifyEntryLabel(0.5, 0.3)).toBe("rising");
  });

  it("returns unsteady for near-zero slope with moderate variability", () => {
    expect(classifyEntryLabel(0.1, 0.8)).toBe("unsteady");
  });
});
