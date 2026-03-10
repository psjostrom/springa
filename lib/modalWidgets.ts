// Modal widget registry — types, defaults, and layout logic for the EventModal widget system.
// Separate from widgetRegistry.ts which handles the dashboard (IntelScreen) widgets.

import type { CalendarEvent, PaceTable } from "./types";
import type { RunBGContext } from "./runBGContext";
import type { BGResponseModel } from "./bgModel";

/** Common props passed to every modal widget. Widgets destructure only what they need. */
export interface WidgetProps {
  event: CalendarEvent;
  isLoadingStreamData?: boolean;
  runBGContext?: RunBGContext | null;
  bgModel?: BGResponseModel | null;
  paceTable?: PaceTable;
  hrZones?: number[];
  lthr?: number;
  apiKey: string;
}

export type ModalWidgetId =
  | "report-card"
  | "stats"
  | "pace-splits"
  | "workout"
  | "carbs-ingested"
  | "prerun-carbs"
  | "stream-graph"
  | "hr-zones"
  | "route-map"
  | "run-analysis"
  | "feedback";

export interface ModalWidgetDef {
  id: ModalWidgetId;
  label: string;
}

export const COMPLETED_RUN_WIDGETS: readonly ModalWidgetDef[] = [
  { id: "report-card", label: "Report Card" },
  { id: "stats", label: "Stats" },
  { id: "pace-splits", label: "Pace Splits" },
  { id: "workout", label: "Workout" },
  { id: "carbs-ingested", label: "Carbs Ingested" },
  { id: "prerun-carbs", label: "Pre-Run Carbs" },
  { id: "stream-graph", label: "Stream Graph" },
  { id: "hr-zones", label: "HR Zones" },
  { id: "route-map", label: "Route Map" },
  { id: "run-analysis", label: "Run Analysis" },
  { id: "feedback", label: "Feedback" },
] as const;

export type ModalTabId = "overview" | "deep-dive" | "analysis";

export interface TabConfig {
  id: ModalTabId;
  label: string;
  widgets: ModalWidgetId[];
}

export const DEFAULT_TABS: readonly TabConfig[] = [
  {
    id: "overview",
    label: "Overview",
    widgets: ["report-card", "stats", "pace-splits", "workout", "carbs-ingested", "prerun-carbs"],
  },
  {
    id: "deep-dive",
    label: "Deep Dive",
    widgets: ["stream-graph", "hr-zones", "route-map"],
  },
  {
    id: "analysis",
    label: "Analysis",
    widgets: ["run-analysis", "feedback"],
  },
] as const;

// --- Layout types ---

export type ModalTabLayout = Record<ModalTabId, {
  order: ModalWidgetId[];
  hidden: ModalWidgetId[];
}>;

// --- Layout resolution ---

const ALL_WIDGET_IDS = new Set<string>(COMPLETED_RUN_WIDGETS.map((w) => w.id));

/**
 * Merge a saved layout with the current tab/widget config.
 * - Preserves saved order for widgets that still exist in the tab
 * - Appends new widgets not in saved order
 * - Strips stale widget ids no longer in the registry
 * - Fills in missing tabs from defaults
 */
export function resolveModalLayout(saved?: Partial<ModalTabLayout>): ModalTabLayout {
  const result = {} as ModalTabLayout;

  for (const tab of DEFAULT_TABS) {
    const tabWidgets = new Set<string>(tab.widgets);
    const savedTab = saved?.[tab.id];
    const savedOrder: string[] = savedTab?.order ?? [];
    const savedHidden: string[] = savedTab?.hidden ?? [];

    if (savedOrder.length === 0) {
      result[tab.id] = { order: [...tab.widgets], hidden: [] };
      continue;
    }

    // Filter to valid ids that belong to this tab
    const order: ModalWidgetId[] = [];
    for (const id of savedOrder) {
      if (ALL_WIDGET_IDS.has(id) && tabWidgets.has(id)) {
        order.push(id as ModalWidgetId);
      }
    }

    // Append new widgets not in saved order
    for (const id of tab.widgets) {
      if (!order.includes(id)) {
        order.push(id);
      }
    }

    const hidden: ModalWidgetId[] = [];
    for (const id of savedHidden) {
      if (ALL_WIDGET_IDS.has(id) && tabWidgets.has(id)) {
        hidden.push(id as ModalWidgetId);
      }
    }

    result[tab.id] = { order, hidden };
  }

  return result;
}

// --- Toggle ---

/** Toggle a widget's visibility. Returns new hidden array. */
export function toggleWidgetVisibility(
  hidden: readonly ModalWidgetId[],
  id: ModalWidgetId,
): ModalWidgetId[] {
  return hidden.includes(id)
    ? hidden.filter((k) => k !== id)
    : [...hidden, id];
}

// --- localStorage persistence ---

const STORAGE_KEY = "springa:modal-widget-layout";

/** Load saved layout from localStorage. Returns undefined if not found or invalid. */
export function loadModalLayout(): Partial<ModalTabLayout> | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw) as ModalTabLayout;
  } catch {
    return undefined;
  }
}

/** Save layout to localStorage. */
export function saveModalLayout(layout: ModalTabLayout): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
}
