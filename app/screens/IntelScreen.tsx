"use client";

import { type ReactNode, useState } from "react";
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
import type { CachedActivity } from "@/lib/bgCacheDb";
import { computeFitnessData, computeInsights } from "@/lib/fitness";
import type { BGResponseModel } from "@/lib/bgModel";
import { extractZoneSegments, buildCalibratedPaceTable, toPaceTable } from "@/lib/paceCalibration";
import type { WidgetKey, WidgetLayout } from "@/lib/widgetRegistry";
import { DEFAULT_WIDGETS, DEFAULT_LAYOUT, moveWidget, toggleWidget, toggleCollapse } from "@/lib/widgetRegistry";
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
        onClick={() => { onMove(widgetKey, "up"); }}
        disabled={isFirst}
        className="p-1 rounded text-[#c4b5fd] hover:text-[#00ffff] disabled:opacity-30 disabled:hover:text-[#c4b5fd] transition"
        aria-label="Move up"
      >
        <ChevronUp size={16} />
      </button>
      <button
        onClick={() => { onMove(widgetKey, "down"); }}
        disabled={isLast}
        className="p-1 rounded text-[#c4b5fd] hover:text-[#00ffff] disabled:opacity-30 disabled:hover:text-[#c4b5fd] transition"
        aria-label="Move down"
      >
        <ChevronDown size={16} />
      </button>
      <button
        onClick={() => { onToggle(widgetKey); }}
        className={`p-1 rounded transition ${isHidden ? "text-[#6b5b8a] hover:text-[#c4b5fd]" : "text-[#c4b5fd] hover:text-[#00ffff]"}`}
        aria-label={isHidden ? "Show widget" : "Hide widget"}
      >
        {isHidden ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function CollapsibleHeader({
  label,
  summary,
  isCollapsed,
  onToggle,
}: {
  label: string;
  summary?: string;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 bg-[#1e1535] rounded-xl border border-[#3d2b5a] px-4 py-3 text-left hover:bg-[#2a1f3d] active:bg-[#2a1f3d] transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-[#c4b5fd] uppercase tracking-wide">
          {label}
        </div>
        {summary && (
          <div className="text-sm text-[#b8a5d4] mt-0.5 truncate">{summary}</div>
        )}
      </div>
      {isCollapsed ? (
        <ChevronDown size={18} className="text-[#6b5b8a] flex-shrink-0" />
      ) : (
        <ChevronUp size={18} className="text-[#c4b5fd] flex-shrink-0" />
      )}
    </button>
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

  const fitnessData = computeFitnessData(events, 180);

  const insights = fitnessData.length > 0 ? computeInsights(fitnessData, events) : null;

  const paceCalibration = (() => {
    if (!lthr || cachedActivities.length === 0) return null;
    const allSegments = cachedActivities.flatMap((a) =>
      a.pace && a.pace.length > 0 && a.hr.length > 0
        ? extractZoneSegments(a.hr, a.pace, lthr, a.activityId, a.activityDate ?? "")
        : [],
    );
    if (allSegments.length === 0) return null;
    return buildCalibratedPaceTable(allSegments);
  })();

  const paceTable = paceCalibration ? toPaceTable(paceCalibration) : undefined;

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
        ? () => <PaceCalibrationCard calibration={paceCalibration} lthr={lthr} />
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
              <BGResponsePanel model={bgModel} activityNames={bgActivityNames} events={events} />
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
    onWidgetLayoutChange({ ...DEFAULT_LAYOUT });
  };

  const handleCollapse = (key: WidgetKey) => {
    const newCollapsed = toggleCollapse(widgetLayout.collapsedWidgets, key);
    onWidgetLayoutChange({ ...widgetLayout, collapsedWidgets: newCollapsed });
  };

  // Generate one-line summaries for collapsed widgets
  const widgetSummaries: Partial<Record<WidgetKey, string>> = {};

  if (insights) {
    widgetSummaries["fitness-insights"] = `CTL ${insights.currentCtl} · Ramp ${insights.rampRate > 0 ? "+" : ""}${insights.rampRate}/wk`;
    widgetSummaries["fitness-chart"] = "CTL/ATL/TSB over time";
  }

  if (paceCalibration) {
    const steady = paceCalibration.table.steady;
    const tempo = paceCalibration.table.tempo;
    if (steady.calibrated && tempo.calibrated) {
      const fmtPace = (minPerKm: number) => {
        const m = Math.floor(minPerKm);
        const sec = Math.round((minPerKm - m) * 60);
        return `${m}:${sec.toString().padStart(2, "0")}`;
      };
      widgetSummaries["pace-zones"] = `Steady: ${fmtPace(steady.pace)} · Tempo: ${fmtPace(tempo.pace)}`;
    }
  }

  if (bgModel) {
    const cats = Object.entries(bgModel.categories).filter(
      (entry): entry is [string, NonNullable<(typeof entry)[1]>] =>
        entry[1] != null && entry[1].sampleCount >= 3
    );
    if (cats.length > 0) {
      const rate = cats[0][1].avgRate.toFixed(1);
      widgetSummaries["bg-response"] = `${cats.length} workout types · avg ${rate} mmol/10min`;
    }
  }

  widgetSummaries["volume-trend"] = `Week ${currentWeek} of ${totalWeeks}`;

  // Widgets that should NOT be collapsible (always expanded)
  const nonCollapsible: WidgetKey[] = ["phase-tracker", "fitness-insights"];

  const firstVisibleKey = editMode
    ? widgetLayout.widgetOrder[0]
    : widgetLayout.widgetOrder.find(
        (k) => !widgetLayout.hiddenWidgets.includes(k) && widgetRenderMap[k] != null,
      );

  return (
    <div className="h-full overflow-y-auto bg-[#0d0a1a]">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        {/* Widget loop */}
        {widgetLayout.widgetOrder.map((key, idx) => {
          const isHidden = widgetLayout.hiddenWidgets.includes(key);
          const isCollapsed = widgetLayout.collapsedWidgets.includes(key);
          const isCollapsible = !nonCollapsible.includes(key);
          const render = widgetRenderMap[key];

          // In normal mode, skip hidden widgets
          if (!editMode && isHidden) return null;
          // In normal mode, skip widgets with no data
          if (!editMode && !render) return null;

          const isFirst = key === firstVisibleKey;

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
              <div className={isFirst ? "relative" : undefined}>
                {isFirst && (
                  <button
                    onClick={() => { setEditMode(!editMode); }}
                    className="absolute top-0 right-0 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold uppercase transition bg-[#2a1f3d]/80 text-[#c4b5fd] hover:text-[#00ffff] hover:bg-[#3d2b5a]"
                    aria-label={editMode ? "Done editing" : "Edit layout"}
                  >
                    {editMode ? <Check size={14} /> : <Pencil size={14} />}
                    {editMode ? "Done" : "Edit"}
                  </button>
                )}
                {editMode && isHidden ? (
                  <div className="opacity-30 pointer-events-none select-none">
                    <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-4">
                      <div className="text-xs text-[#6b5b8a] uppercase font-semibold">
                        {LABEL_MAP.get(key) ?? key} (hidden)
                      </div>
                    </div>
                  </div>
                ) : isCollapsible && !editMode ? (
                  <div className="space-y-2">
                    <CollapsibleHeader
                      label={LABEL_MAP.get(key) ?? key}
                      summary={widgetSummaries[key]}
                      isCollapsed={isCollapsed}
                      onToggle={() => { handleCollapse(key); }}
                    />
                    {!isCollapsed && <div className="pt-1">{render?.()}</div>}
                  </div>
                ) : (
                  render?.()
                )}
              </div>
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
