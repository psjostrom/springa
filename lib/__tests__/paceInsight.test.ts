import { describe, it, expect } from "vitest";
import { categoryFromExternalId } from "../paceInsight";

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
