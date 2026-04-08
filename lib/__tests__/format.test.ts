import { describe, it, expect } from "vitest";
import { formatGoalTime } from "../format";

describe("formatGoalTime", () => {
  it("formats times >=1h as H:MM", () => {
    expect(formatGoalTime(8400)).toBe("2:20"); // 2h20m
    expect(formatGoalTime(3600)).toBe("1:00"); // 1h exactly
    expect(formatGoalTime(7200)).toBe("2:00"); // 2h
    expect(formatGoalTime(5430)).toBe("1:30"); // 1h30m
  });

  it("formats times <1h as MM (minutes only)", () => {
    expect(formatGoalTime(1620)).toBe("27"); // 27 min
    expect(formatGoalTime(300)).toBe("5"); // 5 min
    expect(formatGoalTime(3540)).toBe("59"); // 59 min
    expect(formatGoalTime(60)).toBe("1"); // 1 min
  });

  it("ignores seconds in the output", () => {
    expect(formatGoalTime(8415)).toBe("2:20"); // 2h20m15s → "2:20"
    expect(formatGoalTime(1635)).toBe("27"); // 27m15s → "27"
  });
});
