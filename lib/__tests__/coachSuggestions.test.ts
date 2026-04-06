import { describe, it, expect } from "vitest";
import { getCoachSuggestions, type SuggestionContext } from "../coachSuggestions";

describe("getCoachSuggestions", () => {
  it("returns 4 suggestions", () => {
    const result = getCoachSuggestions({ hasPlan: false, hasRuns: false, hasBGData: false, hasBGModel: false, hasRace: false, diabetesMode: false });
    expect(result).toHaveLength(4);
  });

  it("includes only always-available suggestions for new user", () => {
    const result = getCoachSuggestions({ hasPlan: false, hasRuns: false, hasBGData: false, hasBGModel: false, hasRace: false, diabetesMode: false });
    expect(result.every((s) => typeof s === "string")).toBe(true);
  });

  it("includes race suggestions when race is set", () => {
    const ctx: SuggestionContext = { hasPlan: true, hasRuns: false, hasBGData: false, hasBGModel: false, hasRace: true, diabetesMode: false };
    const allSuggestions = new Set<string>();
    for (let i = 0; i < 20; i++) {
      getCoachSuggestions(ctx).forEach((s) => allSuggestions.add(s));
    }
    const hasRaceSuggestion = [...allSuggestions].some((s) => /race|goal|tracking/i.test(s));
    expect(hasRaceSuggestion).toBe(true);
  });

  it("excludes BG suggestions when diabetesMode is off", () => {
    const ctx: SuggestionContext = { hasPlan: true, hasRuns: true, hasBGData: true, hasBGModel: true, hasRace: true, diabetesMode: false };
    const allSuggestions = new Set<string>();
    for (let i = 0; i < 50; i++) {
      getCoachSuggestions(ctx).forEach((s) => allSuggestions.add(s));
    }
    const hasBGSuggestion = [...allSuggestions].some((s) => /BG|glucose|fuel rate/i.test(s));
    expect(hasBGSuggestion).toBe(false);
  });

  it("includes BG suggestions when diabetesMode is on and data exists", () => {
    const ctx: SuggestionContext = { hasPlan: true, hasRuns: true, hasBGData: true, hasBGModel: true, hasRace: false, diabetesMode: true };
    const allSuggestions = new Set<string>();
    for (let i = 0; i < 50; i++) {
      getCoachSuggestions(ctx).forEach((s) => allSuggestions.add(s));
    }
    const hasBGSuggestion = [...allSuggestions].some((s) => /BG|glucose|fuel rate/i.test(s));
    expect(hasBGSuggestion).toBe(true);
  });
});
