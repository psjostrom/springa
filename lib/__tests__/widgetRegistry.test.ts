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
    const saved = ["bg-response", "phase-tracker", "volume-trend", "fitness-insights", "fitness-chart", "pace-zones"];
    const layout = resolveLayout({ widgetOrder: saved });
    expect(layout.widgetOrder).toEqual(saved);
  });

  it("appends new widgets not in saved order", () => {
    const saved = ["phase-tracker", "fitness-insights"];
    const layout = resolveLayout({ widgetOrder: saved });
    expect(layout.widgetOrder.slice(0, 2)).toEqual(saved);
    // Remaining widgets appended in default order
    expect(layout.widgetOrder).toContain("fitness-chart");
    expect(layout.widgetOrder).toContain("volume-trend");
    expect(layout.widgetOrder).toContain("pace-zones");
    expect(layout.widgetOrder).toContain("bg-response");
    expect(layout.widgetOrder.length).toBe(DEFAULT_ORDER.length);
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
      hiddenWidgets: ["pace-zones", "bg-response"],
    });
    expect(layout.hiddenWidgets).toEqual(["pace-zones", "bg-response"]);
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
  const order: WidgetKey[] = ["phase-tracker", "fitness-insights", "fitness-chart"];

  it("moves a widget up", () => {
    const result = moveWidget(order, "fitness-insights", "up");
    expect(result).toEqual(["fitness-insights", "phase-tracker", "fitness-chart"]);
  });

  it("moves a widget down", () => {
    const result = moveWidget(order, "fitness-insights", "down");
    expect(result).toEqual(["phase-tracker", "fitness-chart", "fitness-insights"]);
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
    moveWidget(order, "fitness-insights", "up");
    expect(order).toEqual(original);
  });
});

describe("toggleWidget", () => {
  it("hides a visible widget", () => {
    const result = toggleWidget([], "pace-zones");
    expect(result).toEqual(["pace-zones"]);
  });

  it("unhides a hidden widget", () => {
    const result = toggleWidget(["pace-zones", "bg-response"], "pace-zones");
    expect(result).toEqual(["bg-response"]);
  });

  it("does not mutate original array", () => {
    const original: WidgetKey[] = ["pace-zones"];
    toggleWidget(original, "pace-zones");
    expect(original).toEqual(["pace-zones"]);
  });
});
