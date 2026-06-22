import { describe, expect, it } from "vitest";
import { addByFeel, isByFeel, removeByFeel } from "../byFeel";

describe("by feel name helpers", () => {
  it("detects only the By Feel suffix", () => {
    expect(isByFeel("W12 Easy By Feel")).toBe(true);
    expect(isByFeel("W12 Easy")).toBe(false);
    expect(isByFeel("W12 Easy By")).toBe(false);
  });

  it("adds the suffix once", () => {
    expect(addByFeel("W12 Easy")).toBe("W12 Easy By Feel");
    expect(addByFeel("W12 Easy By Feel")).toBe("W12 Easy By Feel");
    expect(addByFeel("W05 Long (12km)")).toBe("W05 Long (12km) By Feel");
  });

  it("removes the suffix when present", () => {
    expect(removeByFeel("W12 Easy By Feel")).toBe("W12 Easy");
    expect(removeByFeel("W12 Easy")).toBe("W12 Easy");
  });
});
