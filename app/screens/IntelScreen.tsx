"use client";

import { type ReactNode, useState, useEffect } from "react";
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
  runBGContextsAtom,
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
import { useActivityStream } from "../hooks/useActivityStream";

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
      <Icon className="w-4 h-4 text-[#06b6d4]" />
      <span className="text-sm font-semibold uppercase text-[#b8a5d4]">
        {label}
      </span>
      {meta && (
        <span className="text-xs text-[#8b7ba8]">{meta}</span>
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
  const runBGContexts = useAtomValue(runBGContextsAtom);
  const { name: phaseName, week: currentWeek, progress } = useAtomValue(phaseInfoAtom);
  const paceCalibration = useAtomValue(paceCalibrationAtom);
  const paceTable = useAtomValue(paceTableAtom);
  const totalWeeks = settings?.totalWeeks ?? 18;
  const raceDate = settings?.raceDate ?? "2026-06-13";
  const raceDist = settings?.raceDist;
  const prefix = settings?.prefix;
  const startKm = settings?.startKm;
  const lthr = settings?.lthr;
  const hrZones = settings?.hrZones;

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

  // Enrich selected event with stream data
  const enrichedSelectedEvent = selectedEvent && streamData
    ? {
        ...selectedEvent,
        streamData: {
          ...selectedEvent.streamData,
          ...streamData.streamData,
        },
        avgHr: streamData.avgHr ?? selectedEvent.avgHr,
        maxHr: streamData.maxHr ?? selectedEvent.maxHr,
      }
    : selectedEvent;

  const handleActivitySelect = (activityId: string) => {
    setSelectedActivityId(activityId);
  };

  const handleCloseModal = () => {
    setSelectedActivityId(null);
  };

  // For PB activities, date/delete operations don't make sense - use no-ops
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleDateSaved = (eventId: string, newDate: Date) => { /* no-op for PB modal */ };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleDelete = async (eventId: string) => { /* no-op for PB modal */ };

  const fitnessData = wellnessToFitnessData(wellnessEntries);

  const insights = fitnessData.length > 0 ? computeInsights(fitnessData, events) : null;

  // Per-widget contextual meta (shown after heading)
  const widgetMeta: Partial<WidgetMeta> = {
    "pace-zones": lthr ? `LTHR ${lthr}` : null,
    "bg-categories": bgModel ? `${bgModel.activitiesAnalyzed} runs analyzed` : null,
  };

  // Widget render map — each key maps to a render function or null if data unavailable
  const widgetRenderMap: Record<WidgetKey, (() => ReactNode) | null> = {
    readiness: wellnessLoading
      ? () => (
          <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-6">
            <div className="flex items-center justify-center py-8 text-[#b8a5d4]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Loading wellness data...</span>
            </div>
          </div>
        )
      : wellnessEntries.length > 0
        ? () => <ReadinessPanel entries={wellnessEntries} />
        : null,
    "phase-tracker": () => (
      <PhaseTracker
        phaseName={phaseName}
        currentWeek={currentWeek}
        totalWeeks={totalWeeks}
        progress={progress}
        raceDate={raceDate}
      />
    ),
    "fitness-chart":
      eventsError
        ? () => (
            <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-6">
              <ErrorCard message={eventsError} onRetry={onRetryLoad} />
            </div>
          )
        : (wellnessLoading || eventsLoading)
          ? () => (
              <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-6">
                <div className="flex items-center justify-center py-8 text-[#b8a5d4]">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  <span className="text-sm">Loading fitness data...</span>
                </div>
              </div>
            )
          : fitnessData.length > 0
            ? () => (
                <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-4 space-y-4">
                  <FitnessChart data={fitnessData} />
                  {insights && <FitnessInsightsPanel insights={insights} />}
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
        hrZones={hrZones}
        paceTable={paceTable}
      />
    ),
    "pace-zones":
      paceCalibration && lthr
        ? () => <PaceCalibrationCard calibration={paceCalibration} />
        : null,
    "pace-curves": () => <PaceCurvesWidget onActivitySelect={handleActivitySelect} />,
    "bg-categories": bgModelLoading
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
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold uppercase transition bg-[#1e1535] border border-[#3d2b5a] text-[#b8a5d4] hover:text-[#ff2d95] hover:border-[#ff2d95]/40"
            >
              <RotateCcw size={14} />
              Reset to default
            </button>
          </div>
        )}
      </div>

      {/* Activity Detail Modal */}
      {(Boolean(enrichedSelectedEvent) || isFetchingEvent) && (
        isFetchingEvent ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-6">
              <div className="flex items-center gap-3 text-[#b8a5d4]">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading activity...</span>
              </div>
            </div>
          </div>
        ) : enrichedSelectedEvent && (
          <EventModal
            event={enrichedSelectedEvent}
            onClose={handleCloseModal}
            onDateSaved={handleDateSaved}
            onDelete={handleDelete}
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
