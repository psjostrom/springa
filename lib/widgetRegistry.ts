// Widget registry — pure types and helpers, no React or API calls.

export type WidgetKey =
  | "phase-tracker"
  | "fitness-insights"
  | "fitness-chart"
  | "volume-trend"
  | "pace-zones"
  | "bg-response";

export interface WidgetDef {
  key: WidgetKey;
  label: string;
}

export const DEFAULT_WIDGETS: readonly WidgetDef[] = [
  { key: "phase-tracker", label: "Training Progress" },
  { key: "fitness-insights", label: "Fitness Insights" },
  { key: "fitness-chart", label: "Fitness Chart" },
  { key: "volume-trend", label: "Volume Trend" },
  { key: "pace-zones", label: "Pace Zones" },
  { key: "bg-response", label: "BG Response" },
] as const;

export const DEFAULT_ORDER: readonly WidgetKey[] = DEFAULT_WIDGETS.map((w) => w.key);

export interface WidgetLayout {
  widgetOrder: WidgetKey[];
  hiddenWidgets: WidgetKey[];
}

export const DEFAULT_LAYOUT: WidgetLayout = {
  widgetOrder: [...DEFAULT_ORDER],
  hiddenWidgets: [],
};

const VALID_KEYS = new Set<string>(DEFAULT_ORDER);

/**
 * Merge a saved layout with the current widget registry.
 * - Preserves saved order for keys that still exist
 * - Appends new widgets not present in saved order
 * - Strips stale keys that no longer exist in the registry
 */
export function resolveLayout(saved?: {
  widgetOrder?: string[];
  hiddenWidgets?: string[];
}): WidgetLayout {
  if (!saved?.widgetOrder || saved.widgetOrder.length === 0) {
    return { ...DEFAULT_LAYOUT, hiddenWidgets: [] };
  }

  // Keep only valid keys, preserving saved order
  const order = saved.widgetOrder.filter((k) => VALID_KEYS.has(k)) as WidgetKey[];

  // Append any new widgets not in saved order
  for (const key of DEFAULT_ORDER) {
    if (!order.includes(key)) {
      order.push(key);
    }
  }

  const hidden = (saved.hiddenWidgets ?? []).filter((k) => VALID_KEYS.has(k)) as WidgetKey[];

  return { widgetOrder: order, hiddenWidgets: hidden };
}

/** Swap a widget one position up or down. Returns a new array (no-op at boundaries). */
export function moveWidget(
  order: readonly WidgetKey[],
  key: WidgetKey,
  direction: "up" | "down",
): WidgetKey[] {
  const arr = [...order];
  const idx = arr.indexOf(key);
  if (idx === -1) return arr;

  const target = direction === "up" ? idx - 1 : idx + 1;
  if (target < 0 || target >= arr.length) return arr;

  [arr[idx], arr[target]] = [arr[target], arr[idx]];
  return arr;
}

/** Toggle a widget's hidden state. Returns a new array. */
export function toggleWidget(
  hidden: readonly WidgetKey[],
  key: WidgetKey,
): WidgetKey[] {
  return hidden.includes(key)
    ? hidden.filter((k) => k !== key)
    : [...hidden, key];
}
