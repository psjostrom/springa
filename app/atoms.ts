import { atom } from "jotai";
import { mutate } from "swr";
import type { UserSettings } from "@/lib/settings";
import type { CalendarEvent, PaceTable, PaceCurveData } from "@/lib/types";
import type { BGResponseModel } from "@/lib/bgModel";
import type { EnrichedActivity } from "@/lib/activityStreamsDb";
import type { RunBGContext } from "@/lib/runBGContext";
import type { WellnessEntry } from "@/lib/intervalsApi";
import type { BGReading } from "@/lib/cgm";
import type { WidgetLayout } from "@/lib/widgetRegistry";
import { resolveLayout } from "@/lib/widgetRegistry";
import { enrichEvents } from "@/lib/enrichEvents";
import { recalcTotalCarbs } from "@/lib/workoutMath";
import { wellnessToFitnessData } from "@/lib/fitness";
import type { PhaseInfo } from "./hooks/usePhaseInfo";
import {
  extractZoneSegments,
  buildCalibratedPaceTable,
  toPaceTable,
} from "@/lib/paceCalibration";

// ─── Settings ────────────────────────────────────────────────

export const settingsAtom = atom<UserSettings | null>(null);
export const settingsLoadingAtom = atom(true);

export const apiKeyAtom = atom((get) => get(settingsAtom)?.intervalsApiKey ?? "");
export const sugarModeAtom = atom((get) => get(settingsAtom)?.sugarMode ?? false);

export const updateSettingsAtom = atom(
  null,
  async (_get, set, partial: Partial<UserSettings>) => {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
    if (!res.ok) throw new Error(`Settings save failed (${res.status})`);
    set(settingsAtom, (prev) => ({ ...(prev ?? {}), ...partial }));
  },
);

// ─── Calendar ────────────────────────────────────────────────

export const calendarEventsAtom = atom<CalendarEvent[]>([]);
export const calendarLoadingAtom = atom(false);
export const calendarErrorAtom = atom<string | null>(null);
// Write-only atom that triggers SWR revalidation for calendar data.
// Uses SWR's global mutate with the same key as useSharedCalendarData.
export const calendarReloadAtom = atom(null, (get) => {
  const apiKey = get(apiKeyAtom);
  if (apiKey) void mutate(["calendar-data", apiKey]);
});

/** Optimistically patch a single CalendarEvent by id after a widget save. */
export const patchCalendarEventAtom = atom(
  null,
  (_get, set, { id, patch }: { id: string; patch: Partial<CalendarEvent> }) => {
    set(calendarEventsAtom, (prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    );
  },
);

// ─── Current BG (CGM) ─────────────────────────────────────

export const currentBGAtom = atom<number | null>(null);
export const trendAtom = atom<string | null>(null);
export const trendSlopeAtom = atom<number | null>(null);
export const lastBGUpdateAtom = atom<Date | null>(null);
export const readingsAtom = atom<BGReading[]>([]);

// ─── Run Data / BG Model ────────────────────────────────────

export const bgModelAtom = atom<BGResponseModel | null>(null);
export const bgModelLoadingAtom = atom(false);
export const bgModelProgressAtom = atom<{ done: number; total: number }>({
  done: 0,
  total: 0,
});
export const bgActivityNamesAtom = atom<Map<string, string>>(new Map());
export const runBGContextsAtom = atom<Map<string, RunBGContext>>(new Map());
export const cachedActivitiesAtom = atom<EnrichedActivity[]>([]);

// ─── Wellness ────────────────────────────────────────────────

export const wellnessEntriesAtom = atom<WellnessEntry[]>([]);
export const wellnessLoadingAtom = atom(false);

// ─── Pace Curves ─────────────────────────────────────────────

export const paceCurveDataAtom = atom<PaceCurveData | null>(null);
export const paceCurveLoadingAtom = atom(false);

// ─── Derived ─────────────────────────────────────────────────

export const currentTsbAtom = atom<number | null>((get) => {
  const entries = get(wellnessEntriesAtom);
  const data = wellnessToFitnessData(entries);
  return data.length > 0 ? data[data.length - 1].tsb : null;
});

// MyLife scraper removed — IOB is no longer available, always null
export const currentIobAtom = atom<number | null>(null);

export const enrichedEventsAtom = atom((get) => {
  const events = enrichEvents(get(calendarEventsAtom), get(cachedActivitiesAtom));
  const paceTable = get(paceTableAtom);
  return recalcTotalCarbs(events, paceTable);
});

export const phaseInfoAtom = atom<PhaseInfo>({ name: "Build Phase", week: 0, progress: 0 });

export const paceCalibrationAtom = atom((get) => {
  const cached = get(cachedActivitiesAtom);
  const hrZones = get(settingsAtom)?.hrZones;
  if (!hrZones?.length || hrZones.length !== 5 || !cached.length) return null;
  const allSegments = cached.flatMap((a) =>
    a.pace && a.pace.length > 0 && a.hr.length > 0
      ? extractZoneSegments(
          a.hr,
          a.pace,
          hrZones,
          a.activityId,
          a.activityDate ?? "",
        )
      : [],
  );
  if (allSegments.length === 0) return null;
  return buildCalibratedPaceTable(allSegments);
});

export const paceTableAtom = atom<PaceTable | undefined>((get) => {
  const calibration = get(paceCalibrationAtom);
  return calibration ? toPaceTable(calibration) : undefined;
});

export const widgetLayoutAtom = atom((get) =>
  resolveLayout({
    widgetOrder: get(settingsAtom)?.widgetOrder,
    hiddenWidgets: get(settingsAtom)?.hiddenWidgets,
  }),
);

const _widgetSaveTimerAtom = atom<ReturnType<typeof setTimeout> | undefined>(
  undefined,
);

export const widgetSaveErrorAtom = atom<string | null>(null);

async function saveWidgetLayout(
  layout: WidgetLayout,
  setError: (v: string | null) => void,
) {
  try {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        widgetOrder: layout.widgetOrder,
        hiddenWidgets: layout.hiddenWidgets,
      }),
    });
    if (!res.ok) {
      setError(`Layout save failed (${res.status})`);
      return;
    }
    setError(null);
  } catch {
    setError("Layout save failed (network error)");
  }
}

export const updateWidgetLayoutAtom = atom(
  null,
  (get, set, layout: WidgetLayout) => {
    set(settingsAtom, (prev) => ({
      ...(prev ?? {}),
      widgetOrder: layout.widgetOrder,
      hiddenWidgets: layout.hiddenWidgets,
    }));
    const prev = get(_widgetSaveTimerAtom);
    if (prev) clearTimeout(prev);
    set(
      _widgetSaveTimerAtom,
      setTimeout(() => {
        void saveWidgetLayout(layout, (v) => { set(widgetSaveErrorAtom, v); });
      }, 800),
    );
  },
);
