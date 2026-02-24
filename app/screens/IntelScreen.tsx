"use client";

import { type ReactNode, useMemo, useState } from "react";
import {
  Loader2,
  Pencil,
  Check,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  RotateCcw,
} from "lucide-react";
import type { CalendarEvent } from "@/lib/types";
import type { CachedActivity } from "@/lib/settings";
import { computeFitnessData, computeInsights } from "@/lib/fitness";
import type { BGResponseModel } from "@/lib/bgModel";
import { extractZoneSegments, buildCalibratedPaceTable, toPaceTable } from "@/lib/paceCalibration";
import type { WidgetKey, WidgetLayout } from "@/lib/widgetRegistry";
import { DEFAULT_WIDGETS, DEFAULT_LAYOUT, moveWidget, toggleWidget } from "@/lib/widgetRegistry";
import { PhaseTracker } from "../components/PhaseTracker";
import { VolumeTrendChart } from "../components/VolumeTrendChart";
import { FitnessChart } from "../components/FitnessChart";
import { FitnessInsightsPanel } from "../components/FitnessInsightsPanel";
import { BGResponsePanel } from "../components/BGResponsePanel";
import { BGScatterChart } from "../components/BGScatterChart";
import { PaceCalibrationCard } from "../components/PaceCalibrationCard";
import { ErrorCard } from "../components/ErrorCard";

const LABEL_MAP = new Map(DEFAULT_WIDGETS.map((w) => [w.key, w.label]));

interface IntelScreenProps {
  apiKey: string;
  events: CalendarEvent[];
  eventsLoading: boolean;
  eventsError: string | null;
  onRetryLoad: () => void;
  phaseName: string;
  currentWeek: number;
  totalWeeks: number;
  progress: number;
  bgModel: BGResponseModel | null;
  bgModelLoading: boolean;
  bgModelProgress: { done: number; total: number };
  raceDate: string;
  raceDist?: number;
  prefix?: string;
  startKm?: number;
  lthr?: number;
  bgActivityNames: Map<string, string>;
  cachedActivities: CachedActivity[];
  widgetLayout: WidgetLayout;
  onWidgetLayoutChange: (layout: WidgetLayout) => void;
}

function WidgetEditBar({
  widgetKey,
  label,
  isFirst,
  isLast,
  isHidden,
  onMove,
  onToggle,
}: {
  widgetKey: WidgetKey;
  label: string;
  isFirst: boolean;
  isLast: boolean;
  isHidden: boolean;
  onMove: (key: WidgetKey, dir: "up" | "down") => void;
  onToggle: (key: WidgetKey) => void;
}) {
  return (
    <div className="flex items-center gap-2 bg-[#2a1f3d] rounded-lg px-3 py-1.5 mb-1">
      <span className="text-xs font-semibold uppercase text-[#c4b5fd] flex-1 truncate">
        {label}
      </span>
      <button
        onClick={() => onMove(widgetKey, "up")}
        disabled={isFirst}
        className="p-1 rounded text-[#c4b5fd] hover:text-[#00ffff] disabled:opacity-30 disabled:hover:text-[#c4b5fd] transition"
        aria-label="Move up"
      >
        <ChevronUp size={16} />
      </button>
      <button
        onClick={() => onMove(widgetKey, "down")}
        disabled={isLast}
        className="p-1 rounded text-[#c4b5fd] hover:text-[#00ffff] disabled:opacity-30 disabled:hover:text-[#c4b5fd] transition"
        aria-label="Move down"
      >
        <ChevronDown size={16} />
      </button>
      <button
        onClick={() => onToggle(widgetKey)}
        className={`p-1 rounded transition ${isHidden ? "text-[#6b5b8a] hover:text-[#c4b5fd]" : "text-[#c4b5fd] hover:text-[#00ffff]"}`}
        aria-label={isHidden ? "Show widget" : "Hide widget"}
      >
        {isHidden ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function IntelScreen({
  events,
  eventsLoading,
  eventsError,
  onRetryLoad,
  phaseName,
  currentWeek,
  totalWeeks,
  progress,
  raceDate,
  raceDist,
  prefix,
  startKm,
  lthr,
  bgModel,
  bgModelLoading,
  bgModelProgress,
  bgActivityNames,
  cachedActivities,
  widgetLayout,
  onWidgetLayoutChange,
}: IntelScreenProps) {
  const [editMode, setEditMode] = useState(false);

  const fitnessData = useMemo(
    () => computeFitnessData(events, 180),
    [events],
  );

  const insights = useMemo(
    () => (fitnessData.length > 0 ? computeInsights(fitnessData, events) : null),
    [fitnessData, events],
  );

  const paceCalibration = useMemo(() => {
    if (!lthr || cachedActivities.length === 0) return null;
    const allSegments = cachedActivities.flatMap((a) =>
      a.pace && a.pace.length > 0 && a.hr.length > 0
        ? extractZoneSegments(a.hr, a.pace, lthr, a.activityId, a.activityDate ?? "")
        : [],
    );
    if (allSegments.length === 0) return null;
    return buildCalibratedPaceTable(allSegments);
  }, [cachedActivities, lthr]);

  const paceTable = useMemo(
    () => paceCalibration ? toPaceTable(paceCalibration) : undefined,
    [paceCalibration],
  );

  // Widget render map — each key maps to a render function or null if data unavailable
  const widgetRenderMap: Record<WidgetKey, (() => ReactNode) | null> = {
    "phase-tracker": () => (
      <div>
        <label className="block text-sm font-semibold uppercase text-[#b8a5d4] mb-2">
          Training Progress
        </label>
        <PhaseTracker
          phaseName={phaseName}
          currentWeek={currentWeek}
          totalWeeks={totalWeeks}
          progress={progress}
        />
      </div>
    ),
    "fitness-insights":
      eventsError
        ? () => (
            <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-6">
              <ErrorCard message={eventsError} onRetry={onRetryLoad} />
            </div>
          )
        : eventsLoading
          ? () => (
              <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-6">
                <div className="flex items-center justify-center py-8 text-[#b8a5d4]">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  <span className="text-sm">Loading fitness data...</span>
                </div>
              </div>
            )
          : fitnessData.length > 0 && insights
            ? () => (
                <div>
                  <label className="block text-sm font-semibold uppercase text-[#b8a5d4] mb-2">
                    Fitness Insights
                  </label>
                  <FitnessInsightsPanel insights={insights} />
                </div>
              )
            : null,
    "fitness-chart":
      !eventsError && !eventsLoading && fitnessData.length > 0 && insights
        ? () => (
            <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-4">
              <div className="text-sm font-semibold text-[#c4b5fd] mb-3">
                Fitness / Fatigue / Form
              </div>
              <FitnessChart data={fitnessData} />
            </div>
          )
        : null,
    "volume-trend": () => (
      <VolumeTrendChart
        events={events}
        raceDate={raceDate}
        totalWeeks={totalWeeks}
        raceDist={raceDist}
        prefix={prefix}
        startKm={startKm}
        lthr={lthr}
        paceTable={paceTable}
      />
    ),
    "pace-zones":
      paceCalibration && lthr
        ? () => <PaceCalibrationCard calibration={paceCalibration} lthr={lthr!} />
        : null,
    "bg-response": bgModelLoading
      ? () => (
          <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-6">
            <div className="flex items-center justify-center py-8 text-[#b8a5d4]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">
                Analyzing BG response... {bgModelProgress.done}/{bgModelProgress.total} runs
              </span>
            </div>
          </div>
        )
      : bgModel
        ? () => (
            <div className="space-y-4">
              <BGResponsePanel model={bgModel} activityNames={bgActivityNames} />
              <BGScatterChart model={bgModel} />
            </div>
          )
        : null,
  };

  const handleMove = (key: WidgetKey, dir: "up" | "down") => {
    const newOrder = moveWidget(widgetLayout.widgetOrder, key, dir);
    onWidgetLayoutChange({ ...widgetLayout, widgetOrder: newOrder });
  };

  const handleToggle = (key: WidgetKey) => {
    const newHidden = toggleWidget(widgetLayout.hiddenWidgets, key);
    onWidgetLayoutChange({ ...widgetLayout, hiddenWidgets: newHidden });
  };

  const handleReset = () => {
    onWidgetLayoutChange({ ...DEFAULT_LAYOUT, hiddenWidgets: [] });
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0d0a1a]">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        {/* Edit mode toggle */}
        <div className="flex items-center justify-end">
          <button
            onClick={() => setEditMode(!editMode)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase transition bg-[#2a1f3d] text-[#c4b5fd] hover:text-[#00ffff] hover:bg-[#3d2b5a]"
            aria-label={editMode ? "Done editing" : "Edit layout"}
          >
            {editMode ? <Check size={14} /> : <Pencil size={14} />}
            {editMode ? "Done" : "Edit"}
          </button>
        </div>

        {/* Widget loop */}
        {widgetLayout.widgetOrder.map((key, idx) => {
          const isHidden = widgetLayout.hiddenWidgets.includes(key);
          const render = widgetRenderMap[key];

          // In normal mode, skip hidden widgets
          if (!editMode && isHidden) return null;
          // In normal mode, skip widgets with no data
          if (!editMode && !render) return null;

          return (
            <div key={key}>
              {editMode && (
                <WidgetEditBar
                  widgetKey={key}
                  label={LABEL_MAP.get(key) ?? key}
                  isFirst={idx === 0}
                  isLast={idx === widgetLayout.widgetOrder.length - 1}
                  isHidden={isHidden}
                  onMove={handleMove}
                  onToggle={handleToggle}
                />
              )}
              {editMode && isHidden ? (
                <div className="opacity-30 pointer-events-none select-none">
                  <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-4">
                    <div className="text-xs text-[#6b5b8a] uppercase font-semibold">
                      {LABEL_MAP.get(key) ?? key} (hidden)
                    </div>
                  </div>
                </div>
              ) : (
                render?.()
              )}
            </div>
          );
        })}

        {/* Reset to default */}
        {editMode && (
          <div className="flex justify-center pt-2 pb-4">
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold uppercase transition bg-[#1e1535] border border-[#3d2b5a] text-[#b8a5d4] hover:text-[#ff2d95] hover:border-[#ff2d95]/40"
            >
              <RotateCcw size={14} />
              Reset to default
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
