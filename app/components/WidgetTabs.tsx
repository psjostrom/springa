"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useAtomValue } from "jotai";
import { enrichedEventsAtom } from "../atoms";
import type {
  ModalWidgetId,
  ModalTabId,
  ModalTabLayout,
  WidgetProps,
} from "@/lib/modalWidgets";
import {
  DEFAULT_TABS,
  resolveModalLayout,
  loadModalLayout,
  saveModalLayout,
  toggleWidgetVisibility,
} from "@/lib/modalWidgets";
import { RunReportCard } from "./RunReportCard";
import { RunAnalysis } from "./RunAnalysis";
import { HRZoneBreakdown } from "./HRZoneBreakdown";
import { WorkoutStreamGraph } from "./WorkoutStreamGraph";
import { RouteMap } from "./RouteMap";
import { KmSplitsSection } from "./KmSplitsSection";
import { WorkoutCard } from "./WorkoutCard";
import { HRMiniChart } from "./HRMiniChart";
import { StatsWidget } from "./StatsWidget";
import { CarbsWidget } from "./CarbsWidget";
import { PreRunCarbsWidget } from "./PreRunCarbsWidget";
import { FeedbackWidget } from "./FeedbackWidget";
import { WidgetList } from "./WidgetList";

const widgetRenderMap: Record<ModalWidgetId, (props: WidgetProps) => React.ReactNode | null> = {
  "report-card": (p) => (
    <RunReportCard
      event={p.event}
      isLoadingStreamData={p.isLoadingStreamData}
      runBGContext={p.runBGContext}
    />
  ),
  "stats": (p) => <StatsWidget {...p} />,
  "pace-splits": (p) =>
    p.event.streamData?.distance || p.isLoadingStreamData ? (
      <KmSplitsSection
        streamData={p.event.streamData ?? {}}
        isLoading={p.isLoadingStreamData}
      />
    ) : null,
  "workout": (p) =>
    p.event.description ? (
      <WorkoutCard
        description={p.event.description}
        fuelRate={p.event.fuelRate}
        paceTable={p.paceTable}
        hrZones={p.hrZones}
        lthr={p.lthr}
      >
        {p.event.type === "completed" && p.event.zoneTimes ? (
          <HRMiniChart
            z1={p.event.zoneTimes.z1}
            z2={p.event.zoneTimes.z2}
            z3={p.event.zoneTimes.z3}
            z4={p.event.zoneTimes.z4}
            z5={p.event.zoneTimes.z5}
            maxHeight={48}
            hrData={p.event.streamData?.heartrate}
            hrZones={p.hrZones}
          />
        ) : p.isLoadingStreamData ? (
          <div className="skeleton h-12 w-full rounded" />
        ) : null}
      </WorkoutCard>
    ) : null,
  "carbs-ingested": (p) => <CarbsWidget {...p} />,
  "prerun-carbs": (p) => <PreRunCarbsWidget {...p} />,
  "stream-graph": (p) =>
    p.event.streamData && Object.keys(p.event.streamData).length > 0 ? (
      <WorkoutStreamGraph streamData={p.event.streamData} glucose={p.event.glucose} />
    ) : p.isLoadingStreamData ? (
      <div className="px-3 py-2.5">
        <div className="skeleton h-40 w-full" />
      </div>
    ) : (
      <div className="text-sm text-[#b8a5d4] italic px-3 py-2.5">
        Detailed workout data (graphs) not available for this activity
      </div>
    ),
  "hr-zones": (p) =>
    p.event.zoneTimes ? (
      <div className="px-3 py-2.5">
        <div className="text-sm font-semibold text-[#c4b5fd] mb-3">Heart Rate Zones</div>
        <HRZoneBreakdown {...p.event.zoneTimes} />
      </div>
    ) : p.isLoadingStreamData ? (
      <div className="px-3 py-2.5">
        <div className="text-sm font-semibold text-[#c4b5fd] mb-3">Heart Rate Zones</div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-5 w-full" />
          ))}
        </div>
      </div>
    ) : null,
  "route-map": (p) =>
    p.event.streamData?.latlng && p.event.streamData.latlng.length > 0 ? (
      <div className="px-3 py-2.5">
        <div className="text-sm font-semibold text-[#c4b5fd] mb-3">Route</div>
        <RouteMap latlng={p.event.streamData.latlng} className="h-48" />
      </div>
    ) : p.isLoadingStreamData ? (
      <div className="px-3 py-2.5">
        <div className="text-sm font-semibold text-[#c4b5fd] mb-3">Route</div>
        <div className="skeleton h-48 w-full rounded-lg" />
      </div>
    ) : null,
  "run-analysis": (p) =>
    p.event.activityId ? (
      <RunAnalysis
        event={p.event}
        runBGContext={p.runBGContext}
        bgModel={p.bgModel}
        isLoadingStreamData={p.isLoadingStreamData}
      />
    ) : null,
  "feedback": (p) => <FeedbackWidget {...p} />,
};

interface WidgetTabsProps {
  widgetProps: WidgetProps;
}

export function WidgetTabs({ widgetProps }: WidgetTabsProps) {
  // Subscribe to the atom so widget patches (carbs, feedback, etc.) are reflected
  // immediately without waiting for the parent to re-derive the event from the atom.
  const enrichedEvents = useAtomValue(enrichedEventsAtom);
  const liveEvent = useMemo(
    () => enrichedEvents.find((e) => e.id === widgetProps.event.id),
    [enrichedEvents, widgetProps.event.id],
  );
  const effectiveProps: WidgetProps = liveEvent
    ? { ...widgetProps, event: { ...liveEvent, streamData: widgetProps.event.streamData ?? liveEvent.streamData } }
    : widgetProps;

  const [activeTab, setActiveTab] = useState<ModalTabId>("overview");
  const [layout, setLayout] = useState<ModalTabLayout>(() =>
    resolveModalLayout(loadModalLayout()),
  );

  const tabLayout = layout[activeTab];

  const handleReorder = useCallback(
    (newOrder: ModalWidgetId[]) => {
      setLayout((prev) => {
        const next = { ...prev, [activeTab]: { ...prev[activeTab], order: newOrder } };
        return next;
      });
    },
    [activeTab],
  );

  const handleToggle = useCallback(
    (widgetId: ModalWidgetId) => {
      setLayout((prev) => {
        const tab = prev[activeTab];
        return {
          ...prev,
          [activeTab]: { ...tab, hidden: toggleWidgetVisibility(tab.hidden, widgetId) },
        };
      });
    },
    [activeTab],
  );

  // Persist layout changes outside the state updater (skip initial render)
  const isInitialRender = useRef(true);
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    saveModalLayout(layout);
  }, [layout]);

  return (
    <div className="space-y-2">
      {/* Tab bar */}
      <div className="flex border-b border-[#3d2b5a]">
        {DEFAULT_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); }}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "text-[#ff2d95] border-b-2 border-[#ff2d95]"
                : "text-[#b8a5d4] hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      <WidgetList
        key={activeTab}
        order={tabLayout.order}
        hidden={tabLayout.hidden}
        widgetProps={effectiveProps}
        renderMap={widgetRenderMap}
        onReorder={handleReorder}
        onToggle={handleToggle}
      />
    </div>
  );
}
