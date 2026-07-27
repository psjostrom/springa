import { describe, it, expect } from "vitest";
import {
  detectEffortMetric,
  reemitWorkoutDescription,
  reemitWorkoutName,
} from "../reemitWorkout";
import { TEST_HR_ZONES, TEST_LTHR } from "./testConstants";

const ctx = {
  lthr: TEST_LTHR,
  hrZones: [...TEST_HR_ZONES],
  thresholdPace: 5.5,
};

const easyPace = `Warmup
- Warmup 10m 6:15-7:52/km Pace intensity=warmup

Main set
- Easy 35m 6:15-7:52/km Pace intensity=active

Cooldown
- Cooldown 15m 6:15-7:52/km Pace intensity=cooldown
`;

const intervalsPace = `Warmup
- Warmup 10m 6:15-7:52/km Pace intensity=warmup

Main set 5x
- Interval 5m 4:57-5:11/km Pace intensity=active
- Walk 2m intensity=rest

Cooldown
- Cooldown 5m 6:15-7:52/km Pace intensity=cooldown
`;

const racePaceBlock = `Main set
- Race Pace 5m 5:24-5:33/km Pace intensity=active
- Walk 2m intensity=rest
`;

describe("reemitWorkoutDescription", () => {
  it("pace → hr keeps structure and intensity tags", () => {
    const out = reemitWorkoutDescription(easyPace, "hr", {
      lthr: TEST_LTHR,
      hrZones: [...TEST_HR_ZONES],
      thresholdPace: 5.5,
    });
    expect(out).toMatch(/Warmup/);
    expect(out).toMatch(/% LTHR \(\d+-\d+ bpm\)/);
    expect(out).toMatch(/intensity=warmup/);
    expect(out).toMatch(/intensity=active/);
    expect(out).not.toMatch(/\/km Pace/);
  });

  it("hr → feel strips targets", () => {
    const hr = reemitWorkoutDescription(easyPace, "hr", ctx);
    const feel = reemitWorkoutDescription(hr, "feel", ctx);
    expect(feel).not.toMatch(/% LTHR|\/km Pace|% pace/);
    expect(feel).toMatch(/Easy 35m intensity=active/);
  });

  it("feel → pace restores pace targets from labels/zones", () => {
    const feel = reemitWorkoutDescription(easyPace, "feel", ctx);
    const pace = reemitWorkoutDescription(feel, "pace", ctx);
    expect(pace).toMatch(/\/km Pace|% pace/);
  });

  it("throws when re-emitting to HR without valid LTHR zones", () => {
    expect(() =>
      reemitWorkoutDescription(easyPace, "hr", {
        lthr: TEST_LTHR,
        hrZones: [],
        thresholdPace: 5.5,
      }),
    ).toThrow(/HR|zones/i);
  });

  it("walk/uphill stay targetless in all modes", () => {
    const hills = `Main set 6x
- Uphill 2m intensity=active
- Downhill 3m intensity=rest
`;
    for (const m of ["pace", "hr", "feel"] as const) {
      const out = reemitWorkoutDescription(hills, m, ctx);
      expect(out).toMatch(/Uphill 2m intensity=active/);
      expect(out).not.toMatch(/Uphill 2m .*LTHR|Uphill 2m .*Pace/);
    }
  });

  it("preserves Interval and Race Pace labels when converting", () => {
    const hrIntervals = reemitWorkoutDescription(intervalsPace, "hr", ctx);
    expect(hrIntervals).toMatch(/Interval 5m \d+-\d+% LTHR/);
    expect(hrIntervals).toMatch(/Walk 2m intensity=rest/);
    expect(hrIntervals).not.toMatch(/Walk 2m .*LTHR|Walk 2m .*Pace/);

    const feelRace = reemitWorkoutDescription(racePaceBlock, "feel", ctx);
    const paceRace = reemitWorkoutDescription(feelRace, "pace", ctx);
    expect(paceRace).toMatch(/Race Pace 5m .*(\/km Pace|% pace)/);
    expect(paceRace).toMatch(/Walk 2m intensity=rest/);
  });

  it("throws on unparseable step lines", () => {
    expect(() =>
      reemitWorkoutDescription("- not a valid step\n", "pace", ctx),
    ).toThrow(/Cannot re-emit workout step/);
  });

  it("throws on near-miss target lines instead of frankenstein re-emit", () => {
    // lowercase /km pace misses abs-pace regex (requires capital P)
    expect(() =>
      reemitWorkoutDescription(
        "- Easy 35m 6:15-7:52/km pace intensity=active\n",
        "hr",
        ctx,
      ),
    ).toThrow(/Cannot re-emit workout step/);

    // junk prefix before otherwise-valid absolute pace
    expect(() =>
      reemitWorkoutDescription(
        "- Easy 35m approx 6:15-7:52/km Pace intensity=active\n",
        "hr",
        ctx,
      ),
    ).toThrow(/Cannot re-emit workout step/);

    // % Pace (capital P) misses %-pace regex (requires lowercase pace)
    expect(() =>
      reemitWorkoutDescription(
        "- Easy 35m 30-88% Pace intensity=active\n",
        "hr",
        ctx,
      ),
    ).toThrow(/Cannot re-emit workout step/);
  });
});

describe("detectEffortMetric", () => {
  it("uses name suffix and description markers", () => {
    const feelDesc = reemitWorkoutDescription(easyPace, "feel", ctx);
    const hrDesc = reemitWorkoutDescription(easyPace, "hr", ctx);

    expect(detectEffortMetric("W05 Easy By Feel", feelDesc)).toBe("feel");
    expect(detectEffortMetric("W05 Easy", easyPace)).toBe("pace");
    expect(detectEffortMetric("W05 Easy", hrDesc)).toBe("hr");
  });
});

describe("reemitWorkoutName", () => {
  it("strips legacy By Feel suffix and never adds it", () => {
    expect(reemitWorkoutName("W05 Easy", "feel")).toBe("W05 Easy");
    expect(reemitWorkoutName("W05 Easy By Feel", "pace")).toBe("W05 Easy");
    expect(reemitWorkoutName("W05 Easy By Feel", "hr")).toBe("W05 Easy");
    expect(reemitWorkoutName("W05 Easy By Feel", "feel")).toBe("W05 Easy");
  });
});
