import { describe, it, expect } from "vitest";
import { parseNextTime } from "../parseNextTime";

describe("parseNextTime", () => {
  it("extracts bullets after **Next Time**: heading", () => {
    const markdown = `**Key Metrics**:
- BG started at 10.0, dropped to 8.2

**Next Time**:
- Cap easy pace at ~7:15/km
- Add ~10g extra carbs on fatigued days`;

    expect(parseNextTime(markdown)).toEqual([
      "Cap easy pace at ~7:15/km",
      "Add ~10g extra carbs on fatigued days",
    ]);
  });

  it("returns empty array when no Next Time section", () => {
    expect(parseNextTime("**Key Metrics**:\n- Some metric")).toEqual([]);
  });

  it("returns empty array for null/undefined input", () => {
    expect(parseNextTime(null)).toEqual([]);
    expect(parseNextTime(undefined)).toEqual([]);
  });

  it("stops at the next heading", () => {
    const markdown = `**Next Time**:
- Do this

**Some Other Section**:
- Not this`;

    expect(parseNextTime(markdown)).toEqual(["Do this"]);
  });

  it("handles Next Time without colon", () => {
    const markdown = `**Next Time**
- Adjust fuel to 60g/h`;

    expect(parseNextTime(markdown)).toEqual(["Adjust fuel to 60g/h"]);
  });
});
