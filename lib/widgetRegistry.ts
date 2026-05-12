// Widget registry — pure types and helpers, no React or API calls.

export type WidgetKey =
  | "readiness"
  | "phase-tracker"
  | "upcoming"
  | "fitness-chart"
  | "volume-trend"
  | "pace-zones"
  | "pace-curves"
  | "bg-categories"
  | "bg-after"
  | "distance-readiness"
  | "bg-scatter";

export interface WidgetDef {
  key: WidgetKey;
  label: string;
}

export const DEFAULT_WIDGETS: readonly WidgetDef[] = [
  { key: "readiness", label: "Readiness" },
  { key: "phase-tracker", label: "Training Progress" },
  { key: "upcoming", label: "Upcoming" },
  { key: "fitness-chart", label: "Fitness / Fatigue / Form" },
  { key: "volume-trend", label: "Volume Trend" },
  { key: "pace-zones", label: "Pace Zones" },
  { key: "pace-curves", label: "Personal Bests" },
  { key: "bg-categories", label: "During the Run" },
  { key: "bg-after", label: "After the Run" },
  { key: "distance-readiness", label: "Distance Readiness" },
  { key: "bg-scatter", label: "BG Scatter Chart" },
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
 * Migrate legacy widget keys saved in user layouts to their current names.
 * Lets us rename a key (registry + UI) without losing the user's saved
 * position for that widget. Keep entries here forever — old layouts in the
 * DB never get rewritten unless the user touches their layout.
 */
const LEGACY_KEY_MIGRATIONS: Record<string, WidgetKey> = {
  tomorrow: "upcoming", // PR #192: widget label "Tomorrow" → "Upcoming", key followed in cleanup
};

function isValidWidgetKey(key: string): key is WidgetKey {
  return VALID_KEYS.has(key);
}

function normalizeKey(raw: string): WidgetKey | null {
  const migrated = LEGACY_KEY_MIGRATIONS[raw] ?? raw;
  return isValidWidgetKey(migrated) ? migrated : null;
}

/**
 * Merge a saved layout with the current widget registry.
 * - Preserves saved order for keys that still exist (migrating legacy keys)
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

  const seen = new Set<WidgetKey>();
  const order: WidgetKey[] = [];
  for (const raw of saved.widgetOrder) {
    const k = normalizeKey(raw);
    if (k && !seen.has(k)) {
      order.push(k);
      seen.add(k);
    }
  }

  // Append any new widgets not in saved order
  for (const key of DEFAULT_ORDER) {
    if (!order.includes(key)) {
      order.push(key);
    }
  }

  const hidden: WidgetKey[] = [];
  const seenHidden = new Set<WidgetKey>();
  for (const raw of saved.hiddenWidgets ?? []) {
    const k = normalizeKey(raw);
    if (k && !seenHidden.has(k)) {
      hidden.push(k);
      seenHidden.add(k);
    }
  }

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
