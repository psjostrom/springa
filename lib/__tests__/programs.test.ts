import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/lib/types";
import type { UserSettings } from "@/lib/settings";
import {
  buildDefaultNewProgramDraft,
  buildProgramConfigKey,
  buildProgramConfigKeyFromSettings,
  getNewProgramTimelineWarning,
  getProgramWeeks,
  isProgramFinished,
  validateNewProgramDraft,
} from "../programs";

function plannedEvent(date: string): CalendarEvent {
  return {
    id: `event-${date}`,
    date: new Date(`${date}T12:00:00`),
    name: "W01 Easy",
    description: "Easy run",
    type: "planned",
    category: "easy",
  };
}

const now = new Date("2026-06-24T10:00:00");

describe("isProgramFinished", () => {
  it("returns true when race date is past and no future planned workouts remain", () => {
    const settings: UserSettings = { raceDate: "2026-06-13" };

    expect(isProgramFinished(settings, [], now)).toBe(true);
  });

  it("returns false when the race date is today or in the future", () => {
    expect(isProgramFinished({ raceDate: "2026-06-24" }, [], now)).toBe(false);
    expect(isProgramFinished({ raceDate: "2026-07-01" }, [], now)).toBe(false);
  });

  it("returns false when future planned workouts still exist", () => {
    const settings: UserSettings = { raceDate: "2026-06-13" };

    expect(isProgramFinished(settings, [plannedEvent("2026-06-25")], now)).toBe(false);
  });
});

describe("getProgramWeeks", () => {
  it("counts calendar weeks until the race with a 10 week minimum", () => {
    expect(getProgramWeeks("2026-08-01", now)).toBe(10);
    expect(getProgramWeeks("2026-11-01", now)).toBeGreaterThan(12);
  });
});

describe("buildDefaultNewProgramDraft", () => {
  it("prefills from settings and moves the race date into the future", () => {
    const draft = buildDefaultNewProgramDraft({
      raceName: "EcoTrail",
      raceDist: 16,
      raceDate: "2026-06-13",
      currentAbilityDist: 10,
      currentAbilitySecs: 3300,
      runDays: [2, 4, 0],
      longRunDay: 0,
      totalWeeks: 18,
      startKm: 8,
      includeBasePhase: false,
    }, now);

    expect(draft.raceName).toBe("");
    expect(draft.raceDist).toBe(16);
    expect(draft.raceDate).toBe("2026-10-28");
    expect(draft.currentAbilityDist).toBe(10);
    expect(draft.currentAbilitySecs).toBe(3300);
    expect(draft.runDays).toEqual([2, 4, 0]);
    expect(draft.longRunDay).toBe(0);
    expect(draft.totalWeeks).toBe(18);
    expect(draft.startKm).toBe(8);
  });

  it("fills missing current fitness time from the saved fitness distance", () => {
    const draft = buildDefaultNewProgramDraft({
      raceDist: 16,
      currentAbilityDist: 10,
      runDays: [2, 4, 0],
      longRunDay: 0,
      totalWeeks: 18,
      startKm: 8,
    }, now);

    expect(draft.currentAbilityDist).toBe(10);
    expect(draft.currentAbilitySecs).toBeGreaterThan(0);
  });
});

describe("validateNewProgramDraft", () => {
  const validDraft = buildDefaultNewProgramDraft({
    raceDist: 16,
    currentAbilityDist: 10,
    currentAbilitySecs: 3300,
    runDays: [2, 4, 0],
    longRunDay: 0,
    totalWeeks: 18,
    startKm: 8,
  }, now);

  it("accepts a complete valid draft", () => {
    expect(validateNewProgramDraft(validDraft, now)).toBeNull();
  });

  it("accepts the default 12-week race date it creates", () => {
    const draft = buildDefaultNewProgramDraft({
      raceDist: 16,
      currentAbilityDist: 10,
      currentAbilitySecs: 3300,
      runDays: [2, 4, 0],
      longRunDay: 0,
      totalWeeks: 12,
      startKm: 8,
    }, now);

    expect(draft.raceDate).toBe("2026-09-16");
    expect(validateNewProgramDraft(draft, now)).toBeNull();
  });

  it("rejects too-soon race dates", () => {
    expect(validateNewProgramDraft({ ...validDraft, raceDate: "2026-08-01" }, now)).toBe(
      "Race date must be at least 10 weeks away.",
    );
  });

  it("accepts a compressed 10-week race date", () => {
    const draft = { ...validDraft, raceDate: "2026-09-02", totalWeeks: 10 };

    expect(validateNewProgramDraft(draft, now)).toBeNull();
  });

  it("rejects schedules without a long run day", () => {
    expect(validateNewProgramDraft({ ...validDraft, longRunDay: undefined }, now)).toBe(
      "Pick a long run day.",
    );
  });

  it("rejects schedules with fewer than two run days", () => {
    expect(validateNewProgramDraft({ ...validDraft, runDays: [0] }, now)).toBe(
      "Pick at least two run days.",
    );
  });
});

describe("getNewProgramTimelineWarning", () => {
  it("warns for a compressed timeline below the recommended 12 weeks", () => {
    expect(getNewProgramTimelineWarning({ raceDate: "2026-09-02" }, now)).toContain(
      "compressed 10-week",
    );
  });

  it("does not warn for a 12-week or longer timeline", () => {
    expect(
      getNewProgramTimelineWarning({ raceDate: "2026-09-16" }, now),
    ).toBeNull();
  });
});

describe("buildProgramConfigKey", () => {
  it("serializes all fields that affect generated workouts", () => {
    const key = buildProgramConfigKey({
      raceName: "Stockholm Half",
      raceDist: 21.0975,
      raceDate: "2026-10-28",
      currentAbilityDist: 10,
      currentAbilitySecs: 3300,
      runDays: [2, 4, 0],
      longRunDay: 0,
      clubDay: 4,
      clubType: "speed",
      totalWeeks: 18,
      startKm: 8,
      includeBasePhase: true,
    });

    expect(JSON.parse(key)).toEqual({
      raceName: "Stockholm Half",
      raceDist: 21.0975,
      raceDate: "2026-10-28",
      currentAbilityDist: 10,
      currentAbilitySecs: 3300,
      runDays: [0, 2, 4],
      longRunDay: 0,
      clubDay: 4,
      clubType: "speed",
      totalWeeks: 18,
      startKm: 8,
      includeBasePhase: true,
    });
  });

  it("uses the same canonical key for a draft and the saved settings it writes", () => {
    const draftKey = buildProgramConfigKey({
      raceName: "",
      raceDist: 16,
      raceDate: "2026-10-28",
      currentAbilityDist: 10,
      currentAbilitySecs: 3300,
      runDays: [2, 4, 0],
      longRunDay: 0,
      clubDay: undefined,
      clubType: undefined,
      totalWeeks: 18,
      startKm: 8,
      includeBasePhase: false,
    });

    const settingsKey = buildProgramConfigKeyFromSettings({
      raceName: null as unknown as string,
      raceDist: 16,
      raceDate: "2026-10-28",
      currentAbilityDist: 10,
      currentAbilitySecs: 3300,
      runDays: [0, 2, 4],
      longRunDay: 0,
      clubDay: null as unknown as number,
      clubType: null as unknown as string,
      totalWeeks: 18,
      startKm: 8,
      includeBasePhase: false,
    });

    expect(draftKey).toBe(settingsKey);
  });
});
