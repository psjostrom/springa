import { describe, it, expect } from "vitest";
import {
  DEFAULT_TABS,
  COMPLETED_RUN_WIDGETS,
  resolveModalLayout,
  toggleWidgetVisibility,
  type ModalTabLayout,
  type ModalWidgetId,
} from "../modalWidgets";

describe("DEFAULT_TABS", () => {
  it("has three tabs: overview, deep-dive, analysis", () => {
    expect(DEFAULT_TABS.map((t) => t.id)).toEqual([
      "overview",
      "deep-dive",
      "analysis",
    ]);
  });

  it("every widget id in tabs exists in the registry", () => {
    const registryIds = new Set(COMPLETED_RUN_WIDGETS.map((w) => w.id));
    for (const tab of DEFAULT_TABS) {
      for (const widgetId of tab.widgets) {
        expect(registryIds.has(widgetId)).toBe(true);
      }
    }
  });

  it("no widget id appears in multiple tabs", () => {
    const seen = new Set<string>();
    for (const tab of DEFAULT_TABS) {
      for (const widgetId of tab.widgets) {
        expect(seen.has(widgetId)).toBe(false);
        seen.add(widgetId);
      }
    }
  });
});

describe("resolveModalLayout", () => {
  it("returns default layout when nothing saved", () => {
    const layout = resolveModalLayout();
    expect(layout.overview.order).toEqual([
      "report-card", "stats", "pace-splits", "next-time", "carbs-ingested", "prerun-carbs", "feedback",
    ]);
    expect(layout.overview.hidden).toEqual([]);
    expect(layout["deep-dive"].order).toEqual(["stream-graph", "workout", "hr-zones", "route-map"]);
    expect(layout.analysis.order).toEqual(["run-analysis"]);
  });

  it("preserves saved order within a tab", () => {
    const saved: Partial<ModalTabLayout> = {
      "overview": {
        order: ["feedback", "report-card", "stats", "pace-splits", "next-time", "carbs-ingested", "prerun-carbs"],
        hidden: [],
      },
    };
    const layout = resolveModalLayout(saved);
    expect(layout.overview.order[0]).toBe("feedback");
    expect(layout.overview.order[1]).toBe("report-card");
  });

  it("appends new widgets not in saved order", () => {
    const saved: Partial<ModalTabLayout> = {
      "overview": { order: ["report-card", "stats"], hidden: [] },
    };
    const layout = resolveModalLayout(saved);
    expect(layout.overview.order.slice(0, 2)).toEqual(["report-card", "stats"]);
    expect(layout.overview.order).toContain("carbs-ingested");
    expect(layout.overview.order).toContain("feedback");
    expect(layout.overview.order.length).toBe(7);
  });

  it("strips stale widget ids no longer in registry", () => {
    const saved: Partial<ModalTabLayout> = {
      "overview": {
        order: ["report-card", "deleted-thing" as ModalWidgetId, "stats"],
        hidden: [],
      },
    };
    const layout = resolveModalLayout(saved);
    expect(layout.overview.order).not.toContain("deleted-thing");
    expect(layout.overview.order[0]).toBe("report-card");
    expect(layout.overview.order[1]).toBe("stats");
  });

  it("preserves hidden widgets", () => {
    const saved: Partial<ModalTabLayout> = {
      "overview": {
        order: [...DEFAULT_TABS[0].widgets],
        hidden: ["prerun-carbs"],
      },
    };
    const layout = resolveModalLayout(saved);
    expect(layout.overview.hidden).toEqual(["prerun-carbs"]);
  });

  it("strips stale keys from hidden", () => {
    const saved: Partial<ModalTabLayout> = {
      "overview": {
        order: [...DEFAULT_TABS[0].widgets],
        hidden: ["prerun-carbs", "nope" as ModalWidgetId],
      },
    };
    const layout = resolveModalLayout(saved);
    expect(layout.overview.hidden).toEqual(["prerun-carbs"]);
  });

  it("fills in missing tabs from defaults", () => {
    const saved: Partial<ModalTabLayout> = {
      "overview": { order: [...DEFAULT_TABS[0].widgets], hidden: [] },
    };
    const layout = resolveModalLayout(saved);
    expect(layout["deep-dive"].order).toEqual(["stream-graph", "workout", "hr-zones", "route-map"]);
    expect(layout.analysis.order).toEqual(["run-analysis"]);
  });
});

describe("toggleWidgetVisibility", () => {
  it("hides a visible widget", () => {
    const result = toggleWidgetVisibility([], "stats");
    expect(result).toEqual(["stats"]);
  });

  it("shows a hidden widget", () => {
    const result = toggleWidgetVisibility(["stats", "workout"], "stats");
    expect(result).toEqual(["workout"]);
  });

  it("does not mutate original array", () => {
    const original: ModalWidgetId[] = ["stats"];
    toggleWidgetVisibility(original, "stats");
    expect(original).toEqual(["stats"]);
  });
});

// localStorage tests are in modalWidgets.integration.test.tsx (needs jsdom)
