import { describe, it, expect, beforeEach } from "vitest";
import {
  loadModalLayout,
  saveModalLayout,
  type ModalTabLayout,
} from "../modalWidgets";

describe("localStorage persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loadModalLayout returns undefined when nothing saved", () => {
    expect(loadModalLayout()).toBeUndefined();
  });

  it("round-trips through save and load", () => {
    const layout: ModalTabLayout = {
      "overview": {
        order: ["stats", "report-card", "pace-splits", "workout", "carbs-ingested", "prerun-carbs"],
        hidden: ["prerun-carbs"],
      },
      "deep-dive": { order: ["stream-graph", "hr-zones", "route-map"], hidden: [] },
      "analysis": { order: ["run-analysis", "feedback"], hidden: [] },
    };
    saveModalLayout(layout);
    const loaded = loadModalLayout();
    expect(loaded).toEqual(layout);
  });

  it("loadModalLayout returns undefined for corrupted JSON", () => {
    localStorage.setItem("springa:modal-widget-layout", "not json");
    expect(loadModalLayout()).toBeUndefined();
  });
});
