"use client";

import { type ReactNode, useState, useEffect, useMemo } from "react";
import {
  Loader2,
  Pencil,
  Check,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  RotateCcw,
  Battery,
  Route,
  Activity,
  BarChart3,
  Gauge,
  Timer,
  Droplets,
  ArrowUpFromLine,
  TrendingDown,
  Clock,
  Sparkles,
  ScatterChart,
  type LucideIcon,
} from "lucide-react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  apiKeyAtom,
  enrichedEventsAtom,
  calendarLoadingAtom,
  calendarErrorAtom,
  calendarReloadAtom,
  settingsAtom,
  bgModelAtom,
  bgModelLoadingAtom,
  bgModelProgressAtom,
  bgActivityNamesAtom,
  wellnessEntriesAtom,
  wellnessLoadingAtom,
  widgetLayoutAtom,
  updateWidgetLayoutAtom,
  widgetSaveErrorAtom,
  runBGContextsAtom,
  readingsAtom,
  phaseInfoAtom,
  paceCalibrationAtom,
  paceTableAtom,
} from "../atoms";
import type { CalendarEvent } from "@/lib/types";
import { wellnessToFitnessData, computeInsights } from "@/lib/fitness";
import type { WidgetKey } from "@/lib/widgetRegistry";
import { DEFAULT_WIDGETS, DEFAULT_LAYOUT, moveWidget, toggleWidget } from "@/lib/widgetRegistry";
import { fetchActivityById } from "@/lib/intervalsApi";
import { activityToCalendarEvent } from "@/lib/calendarPipeline";
import { TabBar } from "../components/TabBar";
import { VolumeCompact } from "../components/VolumeCompact";
import { BGCompact } from "../components/BGCompact";
import { PacePBs } from "../components/PacePBs";
import { PhaseTracker } from "../components/PhaseTracker";
import { VolumeTrendChart } from "../components/VolumeTrendChart";
import { FitnessChart } from "../components/FitnessChart";
import { FitnessInsightsPanel } from "../components/FitnessInsightsPanel";
import { BGResponsePanel, StartingBGSection, EntrySlopeSection, TimeDecaySection, BGPatternsPanel } from "../components/BGResponsePanel";
import { BGScatterChart } from "../components/BGScatterChart";
import { PaceCalibrationCard } from "../components/PaceCalibrationCard";
import { PaceCurvesWidget } from "../components/PaceCurvesWidget";
import { ReadinessPanel } from "../components/ReadinessPanel";
import { ErrorCard } from "../components/ErrorCard";
import { EventModal } from "../components/EventModal";
import { WidgetLoadingCard } from "../components/WidgetLoadingCard";
import { useActivityStream } from "../hooks/useActivityStream";
import { usePaceCurves } from "../hooks/usePaceCurves";
import { mergeStreamData } from "@/lib/enrichEvents";
import { estimateWorkoutDistance, estimatePlanEventDistance, getPlanWeekContext, getWeekIdx } from "@/lib/workoutMath";
import { generateFullPlan } from "@/lib/workoutGenerators";
import { DEFAULT_LTHR } from "@/lib/constants";
import type { CategoryBGResponse } from "@/lib/bgModel";

const LABEL_MAP = new Map(DEFAULT_WIDGETS.map((w) => [w.key, w.label]));

const ICON_MAP: Record<WidgetKey, LucideIcon> = {
  readiness: Battery,
  "phase-tracker": Route,
  "fitness-chart": Activity,
  "volume-trend": BarChart3,
  "pace-zones": Gauge,
  "pace-curves": Timer,
  "bg-categories": Droplets,
  "bg-start-level": ArrowUpFromLine,
  "bg-entry-slope": TrendingDown,
  "bg-time-decay": Clock,
  "bg-patterns": Sparkles,
  "bg-scatter": ScatterChart,
};

// Extra context shown after the heading (e.g. "LTHR 168", "5 runs analyzed")
type WidgetMeta = Record<WidgetKey, string | null>;

function WidgetHeading({ widgetKey, meta }: { widgetKey: WidgetKey; meta?: string | null }) {
  const Icon = ICON_MAP[widgetKey];
  const label = LABEL_MAP.get(widgetKey) ?? widgetKey;
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon className="w-4 h-4 text-chart-secondary" />
      <span className="text-sm font-semibold uppercase text-muted">
        {label}
      </span>
      {meta && (
        <span className="text-xs text-muted">{meta}</span>
      )}
    </div>
  );
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
    <div className="flex items-center gap-2 bg-surface-alt rounded-lg px-3 py-1.5 mb-1">
      <span className="text-xs font-semibold uppercase text-muted flex-1 truncate">
        {label}
      </span>
      <button
        onClick={() => { onMove(widgetKey, "up"); }}
        disabled={isFirst}
        className="p-1 rounded text-muted hover:text-brand disabled:opacity-30 disabled:hover:text-muted transition"
        aria-label="Move up"
      >
        <ChevronUp size={16} />
      </button>
      <button
        onClick={() => { onMove(widgetKey, "down"); }}
        disabled={isLast}
        className="p-1 rounded text-muted hover:text-brand disabled:opacity-30 disabled:hover:text-muted transition"
        aria-label="Move down"
      >
        <ChevronDown size={16} />
      </button>
      <button
        onClick={() => { onToggle(widgetKey); }}
        className={`p-1 rounded transition ${isHidden ? "text-muted/60" : "text-muted hover:text-brand"}`}
        aria-label={isHidden ? "Show widget" : "Hide widget"}
      >
        {isHidden ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

const INTEL_TABS = [
  { id: "overview" as const, label: "Overview" },
  { id: "deep-dive" as const, label: "Deep Dive" },
  { id: "analysis" as const, label: "Analysis" },
];

type IntelTabId = (typeof INTEL_TABS)[number]["id"];

export function IntelScreen() {
  const apiKey = useAtomValue(apiKeyAtom);
  const events = useAtomValue(enrichedEventsAtom);
  const eventsLoading = useAtomValue(calendarLoadingAtom);
  const eventsError = useAtomValue(calendarErrorAtom);
  const onRetryLoad = useSetAtom(calendarReloadAtom);
  const settings = useAtomValue(settingsAtom);
  const bgModel = useAtomValue(bgModelAtom);
  const bgModelLoading = useAtomValue(bgModelLoadingAtom);
  const bgModelProgress = useAtomValue(bgModelProgressAtom);
  const bgActivityNames = useAtomValue(bgActivityNamesAtom);

  const wellnessEntries = useAtomValue(wellnessEntriesAtom);
  const wellnessLoading = useAtomValue(wellnessLoadingAtom);
  const widgetLayout = useAtomValue(widgetLayoutAtom);
  const updateLayout = useSetAtom(updateWidgetLayoutAtom);
  const widgetSaveError = useAtomValue(widgetSaveErrorAtom);
  const dismissWidgetSaveError = useSetAtom(widgetSaveErrorAtom);
  const runBGContexts = useAtomValue(runBGContextsAtom);
  const { name: phaseName, week: currentWeek, progress } = useAtomValue(phaseInfoAtom);
  const paceCalibration = useAtomValue(paceCalibrationAtom);
  const paceTable = useAtomValue(paceTableAtom);
  const totalWeeks = settings?.totalWeeks ?? 18;
  const raceDate = settings?.raceDate ?? "2026-06-13";
  const raceDist = settings?.raceDist;
  const startKm = settings?.startKm;
  const lthr = settings?.lthr;
  const hrZones = settings?.hrZones;

  const [activeTab, setActiveTab] = useState<IntelTabId>("overview");
  const [editMode, setEditMode] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [fetchedEvent, setFetchedEvent] = useState<CalendarEvent | null>(null);
  const [isFetchingEvent, setIsFetchingEvent] = useState(false);

  // Find event in local array (fetched event is handled below after effect)
  const eventFromArray = selectedActivityId
    ? events.find((e) => e.activityId === selectedActivityId)
    : null;

  // Fetch old activity if not in events array
  useEffect(() => {
    const existsInEvents = selectedActivityId
      ? events.some((e) => e.activityId === selectedActivityId)
      : true;

    if (!selectedActivityId || existsInEvents) {
      return;
    }

    // Need to fetch old activity
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading state before async fetch is valid
    setIsFetchingEvent(true);
    void fetchActivityById(apiKey, selectedActivityId).then((activity) => {
      if (cancelled) return;
      if (activity) {
        setFetchedEvent(activityToCalendarEvent(activity));
      }
      setIsFetchingEvent(false);
    });
    return () => { cancelled = true; };
  }, [selectedActivityId, events, apiKey]);

  // Only use fetched event if it matches the currently selected activity
  const effectiveFetchedEvent = selectedActivityId
    && !events.some((e) => e.activityId === selectedActivityId)
    && fetchedEvent?.activityId === selectedActivityId
    ? fetchedEvent
    : null;

  // Combine: prefer event from array, fall back to fetched event for old activities
  const selectedEvent = eventFromArray ?? effectiveFetchedEvent;

  // Lazy-load stream data when modal opens
  const { data: streamData, isLoading: isLoadingStreamData } = useActivityStream(
    selectedEvent?.activityId ?? null,
    apiKey
  );
  const bgReadings = useAtomValue(readingsAtom);

  // Enrich selected event with stream data
  const enrichedSelectedEvent = useMemo(
    () => selectedEvent && streamData ? mergeStreamData(selectedEvent, streamData, bgReadings) : selectedEvent,
    [selectedEvent, streamData, bgReadings],
  );

  const handleCloseModal = () => {
    setSelectedActivityId(null);
  };

  const fitnessData = wellnessToFitnessData(wellnessEntries);

  const insights = fitnessData.length > 0 ? computeInsights(fitnessData, events) : null;

  const { data: paceCurveData } = usePaceCurves(apiKey, "all");

  // Plan is deterministic — separate memo to avoid regenerating on every events change
  const planTarget = useMemo(() => {
    if (hrZones?.length !== 5) return null;
    const { planStartMonday, currentWeekIdx } = getPlanWeekContext(raceDate, totalWeeks);
    if (currentWeekIdx < 0 || currentWeekIdx >= totalWeeks) return null;

    const planEvents = generateFullPlan(null, raceDate, raceDist ?? 16, totalWeeks, startKm ?? 8, lthr ?? DEFAULT_LTHR, hrZones, settings?.includeBasePhase ?? false);
    let targetKm = 0;
    let totalRuns = 0;
    for (const pe of planEvents) {
      if (getWeekIdx(pe.start_date_local, planStartMonday) !== currentWeekIdx) continue;
      if (/bonus|optional/i.test(pe.name)) continue;
      targetKm += estimatePlanEventDistance(pe, paceTable);
      totalRuns++;
    }
    return { planStartMonday, currentWeekIdx, targetKm: Math.round(targetKm * 10) / 10, totalRuns };
  }, [raceDate, totalWeeks, raceDist, startKm, lthr, hrZones, paceTable, settings]);

  // Completed volume — depends on events
  const currentWeekVolume = useMemo(() => {
    if (!planTarget) return null;
    const { planStartMonday, currentWeekIdx, targetKm, totalRuns } = planTarget;

    let actualKm = 0;
    let completedRuns = 0;
    for (const event of events) {
      if (event.type !== "completed") continue;
      if (getWeekIdx(event.date, planStartMonday) === currentWeekIdx) {
        actualKm += estimateWorkoutDistance(event, paceTable);
        completedRuns++;
      }
    }

    return {
      actualKm: Math.round(actualKm * 10) / 10,
      targetKm: Math.round(targetKm * 10) / 10,
      completedRuns,
      totalRuns,
    };
  }, [events, planTarget, paceTable]);

  // BG categories for BGCompact (Overview tab)
  const bgCategories = useMemo(() =>
    bgModel ? Object.values(bgModel.categories).filter((c): c is CategoryBGResponse => c != null) : [],
    [bgModel]
  );

  // Per-widget contextual meta (shown after heading)
  const widgetMeta: Partial<WidgetMeta> = {
    "pace-zones": lthr ? `LTHR ${lthr}` : null,
    "bg-categories": bgModel ? `${bgModel.activitiesAnalyzed} runs analyzed` : null,
  };

  // Resolve readiness renderer
  let readinessRenderer: (() => ReactNode) | null = null;
  if (wellnessLoading) readinessRenderer = () => <WidgetLoadingCard label="Loading wellness data..." />;
  else if (wellnessEntries.length > 0) readinessRenderer = () => <ReadinessPanel entries={wellnessEntries} />;

  // Resolve fitness-chart renderer
  let fitnessChartRenderer: (() => ReactNode) | null = null;
  if (eventsError) {
    fitnessChartRenderer = () => (
      <div className="bg-surface rounded-xl border border-border p-6">
        <ErrorCard message={eventsError} onRetry={onRetryLoad} />
      </div>
    );
  } else if (wellnessLoading || eventsLoading) {
    fitnessChartRenderer = () => <WidgetLoadingCard label="Loading fitness data..." />;
  } else if (fitnessData.length > 0) {
    fitnessChartRenderer = () => (
      <div className="bg-surface rounded-xl border border-border p-4 space-y-4">
        <FitnessChart data={fitnessData} />
        {insights && <FitnessInsightsPanel insights={insights} />}
      </div>
    );
  }

  const widgetRenderMap: Record<WidgetKey, (() => ReactNode) | null> = {
    readiness: readinessRenderer,
    "phase-tracker": () => (
      <PhaseTracker
        phaseName={phaseName}
        currentWeek={currentWeek}
        totalWeeks={totalWeeks}
        progress={progress}
        raceDate={raceDate}
        includeBasePhase={settings?.includeBasePhase}
      />
    ),
    "fitness-chart": fitnessChartRenderer,
    "volume-trend": () => (
      <VolumeTrendChart
        events={events}
        raceDate={raceDate}
        totalWeeks={totalWeeks}
        raceDist={raceDist}
        startKm={startKm}
        lthr={lthr}
        hrZones={hrZones}
        paceTable={paceTable}
        includeBasePhase={settings?.includeBasePhase}
      />
    ),
    "pace-zones":
      paceCalibration && lthr
        ? () => <PaceCalibrationCard calibration={paceCalibration} />
        : null,
    "pace-curves": () => <PaceCurvesWidget onActivitySelect={setSelectedActivityId} />,
    "bg-categories": bgModelLoading
      ? () => <WidgetLoadingCard label={`Analyzing BG response... ${bgModelProgress.done}/${bgModelProgress.total} runs`} />
      : bgModel
        ? () => <BGResponsePanel model={bgModel} activityNames={bgActivityNames} />
        : null,
    "bg-start-level":
      bgModel && bgModel.bgByStartLevel.length > 0
        ? () => <StartingBGSection bands={bgModel.bgByStartLevel} />
        : null,
    "bg-entry-slope":
      bgModel && bgModel.bgByEntrySlope.length > 0
        ? () => <EntrySlopeSection slopes={bgModel.bgByEntrySlope} />
        : null,
    "bg-time-decay":
      bgModel && bgModel.bgByTime.length > 0
        ? () => <TimeDecaySection buckets={bgModel.bgByTime} />
        : null,
    "bg-patterns": () => <BGPatternsPanel events={events} />,
    "bg-scatter":
      bgModel
        ? () => <BGScatterChart model={bgModel} />
        : null,
  };

  const handleMove = (key: WidgetKey, dir: "up" | "down") => {
    const newOrder = moveWidget(widgetLayout.widgetOrder, key, dir);
    updateLayout({ ...widgetLayout, widgetOrder: newOrder });
  };

  const handleToggle = (key: WidgetKey) => {
    const newHidden = toggleWidget(widgetLayout.hiddenWidgets, key);
    updateLayout({ ...widgetLayout, hiddenWidgets: newHidden });
  };

  const handleReset = () => {
    updateLayout({ ...DEFAULT_LAYOUT, hiddenWidgets: [] });
  };

  // Widgets that live on Overview only — excluded from the Deep Dive widget loop
  const OVERVIEW_ONLY = new Set<WidgetKey>(["readiness", "phase-tracker"]);

  const firstVisibleKey = editMode
    ? widgetLayout.widgetOrder.find((k) => !OVERVIEW_ONLY.has(k))
    : widgetLayout.widgetOrder.find(
        (k) => !OVERVIEW_ONLY.has(k) && !widgetLayout.hiddenWidgets.includes(k) && widgetRenderMap[k] != null,
      );

  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        <TabBar tabs={INTEL_TABS} activeTab={activeTab} onTabChange={setActiveTab} />

        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Phase Tracker */}
            <div>
              <WidgetHeading widgetKey="phase-tracker" meta={widgetMeta["phase-tracker"]} />
              <PhaseTracker phaseName={phaseName} currentWeek={currentWeek} totalWeeks={totalWeeks} progress={progress} raceDate={raceDate} includeBasePhase={settings?.includeBasePhase} />
            </div>

            {/* Readiness */}
            {(wellnessLoading || wellnessEntries.length > 0) && (
              <div>
                <WidgetHeading widgetKey="readiness" meta={widgetMeta.readiness} />
                {wellnessLoading ? <WidgetLoadingCard label="Loading wellness data..." /> : <ReadinessPanel entries={wellnessEntries} />}
              </div>
            )}

            {/* Volume Compact */}
            {currentWeekVolume && (
              <div>
                <WidgetHeading widgetKey="volume-trend" meta={null} />
                <VolumeCompact {...currentWeekVolume} />
              </div>
            )}

            {/* BG Compact */}
            {bgModelLoading ? (
              <WidgetLoadingCard label={`Analyzing BG response... ${bgModelProgress.done}/${bgModelProgress.total} runs`} />
            ) : bgCategories.length > 0 ? (
              <div>
                <WidgetHeading widgetKey="bg-categories" meta={widgetMeta["bg-categories"]} />
                <BGCompact categories={bgCategories} />
              </div>
            ) : null}

            {/* Pace PBs */}
            {paceCurveData && paceCurveData.bestEfforts.length > 0 && (
              <div>
                <WidgetHeading widgetKey="pace-curves" meta={null} />
                <PacePBs bestEfforts={paceCurveData.bestEfforts} longestRun={paceCurveData.longestRun} onActivitySelect={setSelectedActivityId} />
              </div>
            )}
          </div>
        )}

        {activeTab === "deep-dive" && (
          <>
            {/* Widget loop */}
            {widgetLayout.widgetOrder.map((key, idx) => {
              if (OVERVIEW_ONLY.has(key)) return null;

              const isHidden = widgetLayout.hiddenWidgets.includes(key);
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
                        className="absolute top-0 right-0 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold uppercase transition bg-surface-alt text-muted hover:text-brand hover:bg-border"
                        aria-label={editMode ? "Done editing" : "Edit layout"}
                      >
                        {editMode ? <Check size={14} /> : <Pencil size={14} />}
                        {editMode ? "Done" : "Edit"}
                      </button>
                    )}
                    {editMode && isHidden ? (
                      <div className="opacity-30 pointer-events-none select-none">
                        <div className="bg-surface rounded-xl border border-border p-4">
                          <div className="text-xs text-muted uppercase font-semibold">
                            {LABEL_MAP.get(key) ?? key} (hidden)
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <WidgetHeading widgetKey={key} meta={widgetMeta[key]} />
                        {render?.()}
                      </>
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
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold uppercase transition bg-surface border border-border text-muted hover:text-brand hover:border-brand/40"
                >
                  <RotateCcw size={14} />
                  Reset to default
                </button>
              </div>
            )}

          </>
        )}

        {activeTab === "analysis" && (
          <div>
            <WidgetHeading widgetKey="bg-patterns" meta={null} />
            {widgetRenderMap["bg-patterns"]?.()}
          </div>
        )}

        {/* Widget layout save error — outside tab conditionals so it's visible after switching tabs */}
        {widgetSaveError && (
          <div className="flex items-center justify-center gap-2 pb-4">
            <p className="text-xs text-red-400">{widgetSaveError}</p>
            <button
              onClick={() => { dismissWidgetSaveError(null); }}
              className="text-xs text-red-400/60 hover:text-red-400 underline"
            >
              dismiss
            </button>
          </div>
        )}
      </div>

      {/* Activity Detail Modal */}
      {(Boolean(enrichedSelectedEvent) || isFetchingEvent) && (
        isFetchingEvent ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-surface rounded-xl border border-border p-6">
              <div className="flex items-center gap-3 text-muted">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading activity...</span>
              </div>
            </div>
          </div>
        ) : enrichedSelectedEvent && (
          <EventModal
            event={enrichedSelectedEvent}
            onClose={handleCloseModal}
            onDateSaved={() => { /* no-op: PB modal */ }}
            onDelete={() => Promise.resolve() /* no-op: PB modal */}
            isLoadingStreamData={isLoadingStreamData}
            apiKey={apiKey}
            runBGContexts={runBGContexts}
            paceTable={paceTable}
            bgModel={bgModel}
            hrZones={hrZones}
            lthr={lthr}
          />
        )
      )}
    </div>
  );
}
