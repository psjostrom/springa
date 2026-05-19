import { describe, it, expect } from "vitest";
import { isByFeel, addByFeel, removeByFeel } from "../byFeel";

describe("isByFeel", () => {
  it("returns true when name ends with By Feel", () => {
    expect(isByFeel("W12 Easy By Feel")).toBe(true);
  });

  it("returns false for normal name", () => {
    expect(isByFeel("W12 Easy")).toBe(false);
  });

  it("returns false for partial match", () => {
    expect(isByFeel("W12 Easy By")).toBe(false);
  });
});

describe("addByFeel", () => {
  it("appends By Feel to name", () => {
    expect(addByFeel("W12 Easy")).toBe("W12 Easy By Feel");
  });

  it("does not double-append", () => {
    expect(addByFeel("W12 Easy By Feel")).toBe("W12 Easy By Feel");
  });

  it("works with long run names", () => {
    expect(addByFeel("W05 Long (12km)")).toBe("W05 Long (12km) By Feel");
  });

  it("works with strides names", () => {
    expect(addByFeel("W03 Easy + Strides")).toBe("W03 Easy + Strides By Feel");
  });
});

describe("removeByFeel", () => {
  it("removes By Feel suffix", () => {
    expect(removeByFeel("W12 Easy By Feel")).toBe("W12 Easy");
  });

  it("returns unchanged name when no suffix", () => {
    expect(removeByFeel("W12 Easy")).toBe("W12 Easy");
  });
});
