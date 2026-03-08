import { describe, it, expect } from "vitest";
import {
  resolveLayout,
  moveWidget,
  toggleWidget,
  DEFAULT_ORDER,
  type WidgetKey,
} from "../widgetRegistry";

describe("resolveLayout", () => {
  it("returns default layout when no saved data", () => {
    const layout = resolveLayout();
    expect(layout.widgetOrder).toEqual([...DEFAULT_ORDER]);
    expect(layout.hiddenWidgets).toEqual([]);
  });

  it("returns default layout for empty saved order", () => {
    const layout = resolveLayout({ widgetOrder: [], hiddenWidgets: [] });
    expect(layout.widgetOrder).toEqual([...DEFAULT_ORDER]);
  });

  it("preserves saved order", () => {
    const saved = ["bg-categories", "phase-tracker", "volume-trend", "fitness-chart", "pace-zones", "readiness"];
    const layout = resolveLayout({ widgetOrder: saved });
    // Saved order preserved, plus new widgets appended
    expect(layout.widgetOrder.slice(0, 6)).toEqual(saved);
  });

  it("appends new widgets not in saved order", () => {
    const saved = ["phase-tracker", "fitness-chart"];
    const layout = resolveLayout({ widgetOrder: saved });
    expect(layout.widgetOrder.slice(0, 2)).toEqual(saved);
    // Remaining widgets appended in default order
    expect(layout.widgetOrder).toContain("volume-trend");
    expect(layout.widgetOrder).toContain("pace-zones");
    expect(layout.widgetOrder).toContain("bg-categories");
    expect(layout.widgetOrder.length).toBe(DEFAULT_ORDER.length);
  });

  it("strips old fitness-insights key from saved layouts", () => {
    const saved = ["phase-tracker", "fitness-insights" as WidgetKey, "fitness-chart"];
    const layout = resolveLayout({ widgetOrder: saved });
    expect(layout.widgetOrder).not.toContain("fitness-insights");
    expect(layout.widgetOrder[0]).toBe("phase-tracker");
    expect(layout.widgetOrder[1]).toBe("fitness-chart");
  });

  it("removes stale keys no longer in registry", () => {
    const saved = ["phase-tracker", "deleted-widget" as WidgetKey, "volume-trend"];
    const layout = resolveLayout({ widgetOrder: saved });
    expect(layout.widgetOrder).not.toContain("deleted-widget");
    expect(layout.widgetOrder[0]).toBe("phase-tracker");
    expect(layout.widgetOrder[1]).toBe("volume-trend");
  });

  it("preserves hidden widgets", () => {
    const layout = resolveLayout({
      widgetOrder: [...DEFAULT_ORDER],
      hiddenWidgets: ["pace-zones", "bg-categories"],
    });
    expect(layout.hiddenWidgets).toEqual(["pace-zones", "bg-categories"]);
  });

  it("strips stale keys from hiddenWidgets", () => {
    const layout = resolveLayout({
      widgetOrder: [...DEFAULT_ORDER],
      hiddenWidgets: ["pace-zones", "nope" as WidgetKey],
    });
    expect(layout.hiddenWidgets).toEqual(["pace-zones"]);
  });
});

describe("moveWidget", () => {
  const order: WidgetKey[] = ["phase-tracker", "volume-trend", "fitness-chart"];

  it("moves a widget up", () => {
    const result = moveWidget(order, "volume-trend", "up");
    expect(result).toEqual(["volume-trend", "phase-tracker", "fitness-chart"]);
  });

  it("moves a widget down", () => {
    const result = moveWidget(order, "volume-trend", "down");
    expect(result).toEqual(["phase-tracker", "fitness-chart", "volume-trend"]);
  });

  it("no-op when first widget moves up", () => {
    const result = moveWidget(order, "phase-tracker", "up");
    expect(result).toEqual(order);
  });

  it("no-op when last widget moves down", () => {
    const result = moveWidget(order, "fitness-chart", "down");
    expect(result).toEqual(order);
  });

  it("does not mutate original array", () => {
    const original = [...order];
    moveWidget(order, "volume-trend", "up");
    expect(order).toEqual(original);
  });
});

describe("toggleWidget", () => {
  it("hides a visible widget", () => {
    const result = toggleWidget([], "pace-zones");
    expect(result).toEqual(["pace-zones"]);
  });

  it("unhides a hidden widget", () => {
    const result = toggleWidget(["pace-zones", "bg-categories"], "pace-zones");
    expect(result).toEqual(["bg-categories"]);
  });

  it("does not mutate original array", () => {
    const original: WidgetKey[] = ["pace-zones"];
    toggleWidget(original, "pace-zones");
    expect(original).toEqual(["pace-zones"]);
  });
});
