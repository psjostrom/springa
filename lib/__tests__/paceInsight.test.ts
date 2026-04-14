import { describe, it, expect } from "vitest";
import { categoryFromExternalId, temperatureCorrectHr, computeCardiacCostTrend, generatePaceSuggestion } from "../paceInsight";
import type { ZoneSegment } from "../paceCalibration";
import type { CalendarEvent, BestEffort } from "../types";

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function z2Seg(hr: number, pace: number, date: string): ZoneSegment {
  return { zone: "z2", avgHr: hr, avgPace: pace, durationMin: 10, activityId: "a1", activityDate: date };
}

function improvingZ4Segments(): ZoneSegment[] {
  return [
    { zone: "z4", avgHr: 162, avgPace: 5.30, durationMin: 4, activityId: "s1", activityDate: daysAgo(80) },
    { zone: "z4", avgHr: 162, avgPace: 5.25, durationMin: 4, activityId: "s2", activityDate: daysAgo(60) },
    { zone: "z4", avgHr: 162, avgPace: 5.20, durationMin: 4, activityId: "s3", activityDate: daysAgo(40) },
    { zone: "z4", avgHr: 162, avgPace: 5.15, durationMin: 4, activityId: "s4", activityDate: daysAgo(20) },
    { zone: "z4", avgHr: 162, avgPace: 5.10, durationMin: 4, activityId: "s5", activityDate: daysAgo(5) },
  ];
}

function improvingZ2Segments(): ZoneSegment[] {
  return [
    { zone: "z2", avgHr: 145, avgPace: 7.0, durationMin: 10, activityId: "e1", activityDate: daysAgo(50) },
    { zone: "z2", avgHr: 144, avgPace: 7.0, durationMin: 10, activityId: "e2", activityDate: daysAgo(46) },
    { zone: "z2", avgHr: 146, avgPace: 7.0, durationMin: 10, activityId: "e3", activityDate: daysAgo(42) },
    { zone: "z2", avgHr: 145, avgPace: 7.0, durationMin: 10, activityId: "e4", activityDate: daysAgo(38) },
    { zone: "z2", avgHr: 135, avgPace: 7.0, durationMin: 10, activityId: "e5", activityDate: daysAgo(22) },
    { zone: "z2", avgHr: 136, avgPace: 7.0, durationMin: 10, activityId: "e6", activityDate: daysAgo(18) },
    { zone: "z2", avgHr: 134, avgPace: 7.0, durationMin: 10, activityId: "e7", activityDate: daysAgo(14) },
    { zone: "z2", avgHr: 135, avgPace: 7.0, durationMin: 10, activityId: "e8", activityDate: daysAgo(10) },
  ];
}

function makeEvent(overrides: Partial<CalendarEvent> & { id: string; date: Date }): CalendarEvent {
  return {
    name: "Run",
    description: "",
    type: "completed",
    category: "easy",
    ...overrides,
  };
}

describe("categoryFromExternalId", () => {
  it("maps speed prefix to interval", () => {
    expect(categoryFromExternalId("speed-5")).toBe("interval");
  });

  it("maps club prefix to interval", () => {
    expect(categoryFromExternalId("club-3")).toBe("interval");
  });

  it("maps easy prefix to easy", () => {
    expect(categoryFromExternalId("easy-5-3")).toBe("easy");
  });

  it("maps free prefix to easy", () => {
    expect(categoryFromExternalId("free-5-3")).toBe("easy");
  });

  it("maps long prefix to long", () => {
    expect(categoryFromExternalId("long-5")).toBe("long");
  });

  it("maps race prefix to race", () => {
    expect(categoryFromExternalId("race")).toBe("race");
  });

  it("maps ondemand prefix to other", () => {
    expect(categoryFromExternalId("ondemand-2026-04-13")).toBe("other");
  });

  it("returns null for unknown prefix", () => {
    expect(categoryFromExternalId("unknown-123")).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(categoryFromExternalId(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(categoryFromExternalId("")).toBeNull();
  });
});

describe("temperatureCorrectHr", () => {
  it("returns uncorrected HR below 15C threshold", () => {
    expect(temperatureCorrectHr(140, 0)).toBe(140); // Jan (-1C)
    expect(temperatureCorrectHr(140, 3)).toBe(140); // Apr (7C)
    expect(temperatureCorrectHr(140, 4)).toBe(140); // May (12C)
  });

  it("corrects HR above 15C threshold", () => {
    // June = 17C -> correction = (17-15) * 1.8 = 3.6
    expect(temperatureCorrectHr(140, 5)).toBeCloseTo(136.4, 1);
    // July = 20C -> correction = (20-15) * 1.8 = 9.0
    expect(temperatureCorrectHr(140, 6)).toBeCloseTo(131, 1);
    // August = 19C -> correction = (19-15) * 1.8 = 7.2
    expect(temperatureCorrectHr(140, 7)).toBeCloseTo(132.8, 1);
  });

  it("handles month 11 (December, 0C) with no correction", () => {
    expect(temperatureCorrectHr(150, 11)).toBe(150);
  });
});

describe("computeCardiacCostTrend", () => {
  it("returns negative change when cardiac cost is dropping (improvement)", () => {
    const segments: ZoneSegment[] = [
      z2Seg(145, 7.0, daysAgo(50)),
      z2Seg(144, 7.0, daysAgo(46)),
      z2Seg(146, 7.0, daysAgo(42)),
      z2Seg(145, 7.0, daysAgo(38)),
      z2Seg(135, 7.0, daysAgo(22)),
      z2Seg(136, 7.0, daysAgo(18)),
      z2Seg(134, 7.0, daysAgo(14)),
      z2Seg(135, 7.0, daysAgo(10)),
    ];
    const result = computeCardiacCostTrend(segments);
    expect(result).not.toBeNull();
    expect(result!.changePercent).toBeLessThan(-3);
    expect(result!.direction).toBe("improving");
  });

  it("returns positive change when cardiac cost is rising (regression)", () => {
    const segments: ZoneSegment[] = [
      z2Seg(135, 7.0, daysAgo(50)),
      z2Seg(136, 7.0, daysAgo(46)),
      z2Seg(134, 7.0, daysAgo(42)),
      z2Seg(135, 7.0, daysAgo(38)),
      z2Seg(148, 7.0, daysAgo(22)),
      z2Seg(149, 7.0, daysAgo(18)),
      z2Seg(147, 7.0, daysAgo(14)),
      z2Seg(148, 7.0, daysAgo(10)),
    ];
    const result = computeCardiacCostTrend(segments);
    expect(result).not.toBeNull();
    expect(result!.changePercent).toBeGreaterThan(5);
    expect(result!.direction).toBe("regressing");
  });

  it("returns null when change is within noise range", () => {
    const segments: ZoneSegment[] = [
      z2Seg(140, 7.0, daysAgo(50)),
      z2Seg(141, 7.0, daysAgo(46)),
      z2Seg(139, 7.0, daysAgo(42)),
      z2Seg(140, 7.0, daysAgo(38)),
      z2Seg(140, 7.0, daysAgo(22)),
      z2Seg(141, 7.0, daysAgo(18)),
      z2Seg(139, 7.0, daysAgo(14)),
      z2Seg(140, 7.0, daysAgo(10)),
    ];
    expect(computeCardiacCostTrend(segments)).toBeNull();
  });

  it("returns null with insufficient data in either window", () => {
    const segments: ZoneSegment[] = [
      z2Seg(145, 7.0, daysAgo(50)),
      z2Seg(144, 7.0, daysAgo(46)),
      z2Seg(135, 7.0, daysAgo(22)),
      z2Seg(136, 7.0, daysAgo(18)),
      z2Seg(134, 7.0, daysAgo(14)),
      z2Seg(135, 7.0, daysAgo(10)),
    ];
    expect(computeCardiacCostTrend(segments)).toBeNull();
  });
});

describe("generatePaceSuggestion", () => {
  const baseAbility = { currentAbilitySecs: 5388, currentAbilityDist: 16 }; // 16km in 1:29:48 → Z4 ≈ 5:14-5:36/km

  function completedEvents(): CalendarEvent[] {
    // Regular training — no gaps
    return Array.from({ length: 12 }, (_, i) =>
      makeEvent({ id: `r${i}`, date: new Date(Date.now() - (80 - i * 7) * 86400000), type: "completed" }),
    );
  }

  it("returns high confidence when both Z4 pace and cardiac cost improve", () => {
    const segments = [...improvingZ4Segments(), ...improvingZ2Segments()];
    const result = generatePaceSuggestion({
      segments,
      events: completedEvents(),
      ...baseAbility,
    });
    expect(result).not.toBeNull();
    expect(result!.direction).toBe("improvement");
    expect(result!.confidence).toBe("high");
    expect(result!.z4ImprovementSecPerKm).not.toBeNull();
    expect(result!.z4ImprovementSecPerKm!).toBeLessThan(0); // negative = faster
    expect(result!.cardiacCostChangePercent).not.toBeNull();
    expect(result!.cardiacCostChangePercent!).toBeLessThan(0);
    expect(result!.suggestedAbilitySecs).toBeLessThan(result!.currentAbilitySecs);
  });

  it("returns medium confidence with Z4 signal only", () => {
    const result = generatePaceSuggestion({
      segments: improvingZ4Segments(),
      events: completedEvents(),
      ...baseAbility,
    });
    expect(result).not.toBeNull();
    expect(result!.direction).toBe("improvement");
    expect(result!.confidence).toBe("medium");
    expect(result!.z4ImprovementSecPerKm).not.toBeNull();
    expect(result!.cardiacCostChangePercent).toBeNull();
  });

  it("returns null when no trend signals are present", () => {
    const flatZ4: ZoneSegment[] = [
      { zone: "z4", avgHr: 162, avgPace: 5.20, durationMin: 4, activityId: "s1", activityDate: daysAgo(80) },
      { zone: "z4", avgHr: 162, avgPace: 5.20, durationMin: 4, activityId: "s2", activityDate: daysAgo(40) },
      { zone: "z4", avgHr: 162, avgPace: 5.20, durationMin: 4, activityId: "s3", activityDate: daysAgo(5) },
    ];
    const result = generatePaceSuggestion({
      segments: flatZ4,
      events: completedEvents(),
      ...baseAbility,
    });
    expect(result).toBeNull();
  });

  it("returns null when dismissed within 4 weeks", () => {
    const segments = [...improvingZ4Segments(), ...improvingZ2Segments()];
    const result = generatePaceSuggestion({
      segments,
      events: completedEvents(),
      ...baseAbility,
      paceSuggestionDismissedAt: Date.now() - 14 * 86400000,
    });
    expect(result).toBeNull();
  });

  it("returns suggestion after 5-week-old dismiss", () => {
    const segments = [...improvingZ4Segments(), ...improvingZ2Segments()];
    const result = generatePaceSuggestion({
      segments,
      events: completedEvents(),
      ...baseAbility,
      paceSuggestionDismissedAt: Date.now() - 35 * 86400000,
    });
    expect(result).not.toBeNull();
  });

  it("caps suggested change at 2% of current ability time", () => {
    // Exaggerated improvement — very steep slope
    const steepZ4: ZoneSegment[] = [
      { zone: "z4", avgHr: 162, avgPace: 6.00, durationMin: 4, activityId: "s1", activityDate: daysAgo(80) },
      { zone: "z4", avgHr: 162, avgPace: 5.80, durationMin: 4, activityId: "s2", activityDate: daysAgo(60) },
      { zone: "z4", avgHr: 162, avgPace: 5.50, durationMin: 4, activityId: "s3", activityDate: daysAgo(40) },
      { zone: "z4", avgHr: 162, avgPace: 5.10, durationMin: 4, activityId: "s4", activityDate: daysAgo(20) },
      { zone: "z4", avgHr: 162, avgPace: 4.60, durationMin: 4, activityId: "s5", activityDate: daysAgo(5) },
    ];
    const result = generatePaceSuggestion({
      segments: steepZ4,
      events: completedEvents(),
      ...baseAbility,
    });
    expect(result).not.toBeNull();
    const maxDelta = Math.round(baseAbility.currentAbilitySecs * 0.02);
    const actualDelta = Math.abs(result!.suggestedAbilitySecs - result!.currentAbilitySecs);
    expect(actualDelta).toBeLessThanOrEqual(maxDelta);
  });

  it("returns null on conflicting signals", () => {
    // Z4 improving but cardiac cost regressing
    const improvingZ4 = improvingZ4Segments();
    const regressingZ2: ZoneSegment[] = [
      z2Seg(135, 7.0, daysAgo(50)),
      z2Seg(136, 7.0, daysAgo(46)),
      z2Seg(134, 7.0, daysAgo(42)),
      z2Seg(135, 7.0, daysAgo(38)),
      z2Seg(148, 7.0, daysAgo(22)),
      z2Seg(149, 7.0, daysAgo(18)),
      z2Seg(147, 7.0, daysAgo(14)),
      z2Seg(148, 7.0, daysAgo(10)),
    ];
    const result = generatePaceSuggestion({
      segments: [...improvingZ4, ...regressingZ2],
      events: completedEvents(),
      ...baseAbility,
    });
    expect(result).toBeNull();
  });

  it("detects regression with high confidence", () => {
    // Z4 getting slower + cardiac cost rising
    const regressingZ4: ZoneSegment[] = [
      { zone: "z4", avgHr: 162, avgPace: 5.10, durationMin: 4, activityId: "s1", activityDate: daysAgo(80) },
      { zone: "z4", avgHr: 162, avgPace: 5.15, durationMin: 4, activityId: "s2", activityDate: daysAgo(60) },
      { zone: "z4", avgHr: 162, avgPace: 5.20, durationMin: 4, activityId: "s3", activityDate: daysAgo(40) },
      { zone: "z4", avgHr: 162, avgPace: 5.25, durationMin: 4, activityId: "s4", activityDate: daysAgo(20) },
      { zone: "z4", avgHr: 162, avgPace: 5.35, durationMin: 4, activityId: "s5", activityDate: daysAgo(5) },
    ];
    const regressingZ2: ZoneSegment[] = [
      z2Seg(135, 7.0, daysAgo(50)),
      z2Seg(136, 7.0, daysAgo(46)),
      z2Seg(134, 7.0, daysAgo(42)),
      z2Seg(135, 7.0, daysAgo(38)),
      z2Seg(148, 7.0, daysAgo(22)),
      z2Seg(149, 7.0, daysAgo(18)),
      z2Seg(147, 7.0, daysAgo(14)),
      z2Seg(148, 7.0, daysAgo(10)),
    ];
    const result = generatePaceSuggestion({
      segments: [...regressingZ4, ...regressingZ2],
      events: completedEvents(),
      ...baseAbility,
    });
    expect(result).not.toBeNull();
    expect(result!.direction).toBe("regression");
    expect(result!.confidence).toBe("high");
    expect(result!.suggestedAbilitySecs).toBeGreaterThan(result!.currentAbilitySecs);
  });

  it("returns null without ability settings", () => {
    const segments = [...improvingZ4Segments(), ...improvingZ2Segments()];
    const result = generatePaceSuggestion({
      segments,
      events: completedEvents(),
      currentAbilitySecs: 0,
      currentAbilityDist: 0,
    });
    expect(result).toBeNull();
  });
});

describe("generatePaceSuggestion — race result", () => {
  const baseAbility = { currentAbilitySecs: 5388, currentAbilityDist: 16 }; // 16km in 1:29:48 → Z4 ≈ 5:14-5:36/km

  function completedEvents(): CalendarEvent[] {
    return Array.from({ length: 12 }, (_, i) =>
      makeEvent({ id: `r${i}`, date: new Date(Date.now() - (80 - i * 7) * 86400000), type: "completed" }),
    );
  }

  it("uses direct comparison when race distance matches reference", () => {
    const raceEvent = makeEvent({
      id: "race-1",
      date: new Date(Date.now() - 10 * 86400000),
      type: "completed",
      category: "race",
      distance: 15500, // 15.5km, within 10% of 16km reference
      duration: 5200,  // faster than 5388
      name: "Spring 16K",
    });
    const events = [...completedEvents(), raceEvent];
    const result = generatePaceSuggestion({
      segments: [],
      events,
      ...baseAbility,
    });
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe("high");
    expect(result!.raceResult).not.toBeNull();
    expect(result!.raceResult!.distanceMatch).toBe(true);
    expect(result!.suggestedAbilitySecs).toBe(5200); // direct race time, no cap
  });

  it("does not suggest regression from a single slow race — falls through to trends", () => {
    const raceEvent = makeEvent({
      id: "race-1",
      date: new Date(Date.now() - 10 * 86400000),
      type: "completed",
      category: "race",
      distance: 16000,
      duration: 5600, // slower than 5388
      name: "Slow 16K",
    });
    const events = [...completedEvents(), raceEvent];
    // No trend segments → no trend signal → null (race alone doesn't trigger regression)
    const result = generatePaceSuggestion({
      segments: [],
      events,
      ...baseAbility,
    });
    expect(result).toBeNull();
  });

  it("attaches race result to trend suggestion when distance does not match", () => {
    const raceEvent = makeEvent({
      id: "race-1",
      date: new Date(Date.now() - 10 * 86400000),
      type: "completed",
      category: "race",
      distance: 5000, // not within 10% of 16000
      duration: 1200,
      name: "Park Run",
    });
    const events = [...completedEvents(), raceEvent];
    const segments = [...improvingZ4Segments(), ...improvingZ2Segments()];
    const result = generatePaceSuggestion({
      segments,
      events,
      ...baseAbility,
    });
    expect(result).not.toBeNull();
    expect(result!.raceResult).not.toBeNull();
    expect(result!.raceResult!.distanceMatch).toBe(false);
    expect(result!.raceResult!.name).toBe("Park Run");
    // Suggestion is from trends, not race
    expect(result!.z4ImprovementSecPerKm).not.toBeNull();
  });

  it("returns null with non-matching race and no trends", () => {
    const raceEvent = makeEvent({
      id: "race-1",
      date: new Date(Date.now() - 10 * 86400000),
      type: "completed",
      category: "race",
      distance: 5000,
      duration: 1200,
      name: "Park Run",
    });
    const events = [...completedEvents(), raceEvent];
    const result = generatePaceSuggestion({
      segments: [],
      events,
      ...baseAbility,
    });
    expect(result).toBeNull();
  });
});

describe("generatePaceSuggestion — break detection", () => {
  const baseAbility = { currentAbilitySecs: 5388, currentAbilityDist: 16 }; // 16km in 1:29:48 → Z4 ≈ 5:14-5:36/km

  it("returns null when there is a 14+ day gap and fewer than 4 post-break runs", () => {
    // Runs early, then a big gap, then only 2 post-break runs
    const events: CalendarEvent[] = [
      makeEvent({ id: "r1", date: new Date(Date.now() - 70 * 86400000), type: "completed" }),
      makeEvent({ id: "r2", date: new Date(Date.now() - 63 * 86400000), type: "completed" }),
      makeEvent({ id: "r3", date: new Date(Date.now() - 56 * 86400000), type: "completed" }),
      // 14+ day gap (56 → 30 = 26 days)
      makeEvent({ id: "r4", date: new Date(Date.now() - 30 * 86400000), type: "completed" }),
      makeEvent({ id: "r5", date: new Date(Date.now() - 23 * 86400000), type: "completed" }),
      makeEvent({ id: "r6", date: new Date(Date.now() - 16 * 86400000), type: "completed" }),
    ];
    const segments = [...improvingZ4Segments(), ...improvingZ2Segments()];
    const result = generatePaceSuggestion({
      segments,
      events,
      ...baseAbility,
    });
    expect(result).toBeNull();
  });
});

describe("generatePaceSuggestion — PB calibration gap", () => {
  const baseAbility = { currentAbilitySecs: 2220, currentAbilityDist: 5 }; // 37:00 5K

  function completedEvents(): CalendarEvent[] {
    return Array.from({ length: 12 }, (_, i) =>
      makeEvent({ id: `r${i}`, date: new Date(Date.now() - (80 - i * 7) * 86400000), type: "completed" }),
    );
  }

  function makePB(timeSeconds: number, ageDays: number): BestEffort[] {
    return [{
      distance: 5000,
      label: "5km",
      timeSeconds,
      pace: timeSeconds / 5000 * 1000 / 60,
      activityDate: daysAgo(ageDays),
    }];
  }

  it("fires when PB within 90 days is >10% faster than predicted time", () => {
    // 37:00 (2220s) vs PB 26:39 (1599s) = 28% gap, 60 days old
    const result = generatePaceSuggestion({
      segments: [], events: completedEvents(), ...baseAbility,
      bestEfforts: makePB(1599, 60),
    });
    expect(result).not.toBeNull();
    expect(result!.direction).toBe("improvement");
    expect(result!.confidence).toBe("high");
    expect(result!.suggestedAbilitySecs).toBe(1599);
    expect(result!.pbEvidence!.timeSeconds).toBe(1599);
    expect(result!.pbEvidence!.ageDays).toBeGreaterThanOrEqual(60);
    expect(result!.pbEvidence!.ageDays).toBeLessThanOrEqual(61);
  });

  it("does not fire when PB gap is <10%", () => {
    // 27:00 (1620s) vs PB 26:39 (1599s) = 1.3% gap
    const result = generatePaceSuggestion({
      segments: [], events: completedEvents(),
      currentAbilitySecs: 1620, currentAbilityDist: 5,
      bestEfforts: makePB(1599, 60),
    });
    expect(result).toBeNull();
  });

  it("uses 20% threshold for PB aged 91-180 days", () => {
    // 37:00 (2220s) vs PB 26:39 (1599s) = 28% > 20% — fires even at 120 days
    const result = generatePaceSuggestion({
      segments: [], events: completedEvents(), ...baseAbility,
      bestEfforts: makePB(1599, 120),
    });
    expect(result).not.toBeNull();
    expect(result!.direction).toBe("improvement");
    expect(result!.suggestedAbilitySecs).toBe(1599);
  });

  it("does not fire for PB aged 91-180 days with gap 10-20%", () => {
    // 29:00 (1740s) vs PB 26:00 (1560s) = 10.3% — below 20% threshold for old PB
    const result = generatePaceSuggestion({
      segments: [], events: completedEvents(),
      currentAbilitySecs: 1740, currentAbilityDist: 5,
      bestEfforts: makePB(1560, 150),
    });
    expect(result).toBeNull();
  });

  it("does not fire for PB older than 180 days", () => {
    const result = generatePaceSuggestion({
      segments: [], events: completedEvents(), ...baseAbility,
      bestEfforts: makePB(1599, 200),
    });
    expect(result).toBeNull();
  });

  it("does not fire when PB is slower than predicted time", () => {
    // Setting 24:00 (1440s), PB 26:39 (1599s) — PB is slower
    const result = generatePaceSuggestion({
      segments: [], events: completedEvents(),
      currentAbilitySecs: 1440, currentAbilityDist: 5,
      bestEfforts: makePB(1599, 60),
    });
    expect(result).toBeNull();
  });

  it("does not fire without best efforts data", () => {
    const result = generatePaceSuggestion({
      segments: [], events: completedEvents(), ...baseAbility,
    });
    expect(result).toBeNull();
  });

  it("uses trend suggestion when PB fires but trends show regression", () => {
    // PB says improvement but Z4 + cardiac cost say regression → trust trends
    const regressingZ4: ZoneSegment[] = [
      { zone: "z4", avgHr: 162, avgPace: 5.10, durationMin: 4, activityId: "s1", activityDate: daysAgo(80) },
      { zone: "z4", avgHr: 162, avgPace: 5.15, durationMin: 4, activityId: "s2", activityDate: daysAgo(60) },
      { zone: "z4", avgHr: 162, avgPace: 5.20, durationMin: 4, activityId: "s3", activityDate: daysAgo(40) },
      { zone: "z4", avgHr: 162, avgPace: 5.25, durationMin: 4, activityId: "s4", activityDate: daysAgo(20) },
      { zone: "z4", avgHr: 162, avgPace: 5.35, durationMin: 4, activityId: "s5", activityDate: daysAgo(5) },
    ];
    const result = generatePaceSuggestion({
      segments: regressingZ4, events: completedEvents(), ...baseAbility,
      bestEfforts: makePB(1599, 60),
    });
    expect(result).not.toBeNull();
    expect(result!.direction).toBe("regression");
    expect(result!.suggestedAbilitySecs).toBeGreaterThan(baseAbility.currentAbilitySecs);
    expect(result!.pbEvidence).toBeUndefined();
  });

  it("uses PB suggestion when PB fires and trends also show improvement", () => {
    // Setting 35:00 (2100s), PB 27:10 (1630s), trends improving
    // PB gives bigger correction than 2% trend cap
    const result = generatePaceSuggestion({
      segments: improvingZ4Segments(), events: completedEvents(),
      currentAbilitySecs: 2100, currentAbilityDist: 5,
      bestEfforts: makePB(1630, 21),
    });
    expect(result).not.toBeNull();
    expect(result!.direction).toBe("improvement");
    expect(result!.suggestedAbilitySecs).toBe(1630); // PB, not 2% of 2100
    expect(result!.pbEvidence).not.toBeNull();
  });
});
