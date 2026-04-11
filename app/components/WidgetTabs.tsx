"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useAtomValue } from "jotai";
import useSWR from "swr";
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
import { Droplets, Activity, Utensils, MessageSquare, BarChart3, Gauge, Heart, MapPin, type LucideIcon } from "lucide-react";
import { RunReportCard } from "./RunReportCard";
import { RunAnalysis } from "./RunAnalysis";
import { HRZoneBreakdown } from "./HRZoneBreakdown";
import { PaceZoneBreakdown } from "./PaceZoneBreakdown";
import { WorkoutStreamGraph } from "./WorkoutStreamGraph";
import { RouteMap } from "./RouteMap";
import { KmSplitsSection } from "./KmSplitsSection";
import { WorkoutCard } from "./WorkoutCard";
import { HRMiniChart } from "./HRMiniChart";
import { StatsWidget } from "./StatsWidget";
import { CarbsWidget } from "./CarbsWidget";
import { PreRunCarbsWidget } from "./PreRunCarbsWidget";
import { FeedbackWidget } from "./FeedbackWidget";
import { NextTimeWidget } from "./NextTimeWidget";
import { WidgetList } from "./WidgetList";
import { TabBar } from "./TabBar";

function NextTimeSWRBridge({ activityId }: { activityId: string }) {
  const { data: analysis } = useSWR<string>(
    ["run-analysis", activityId],
    null, // read from cache — RunAnalysis on Analysis tab populates it
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  );
  if (!analysis) return null; // shows nothing until analysis is generated via Analysis tab
  return <NextTimeWidget analysis={analysis} />;
}

const widgetRenderMap: Record<ModalWidgetId, (props: WidgetProps) => React.ReactNode | null> = {
  "report-card": (p) => (
    <RunReportCard
      event={p.event}
      isLoadingStreamData={p.isLoadingStreamData}
      runBGContext={p.runBGContext}
    />
  ),
  "stats": (p) => <StatsWidget {...p} />,
  "next-time": (p) =>
    p.event.activityId ? (
      <NextTimeSWRBridge activityId={p.event.activityId} />
    ) : null,
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
      <div className="text-sm text-muted italic px-3 py-2.5">
        Detailed workout data (graphs) not available for this activity
      </div>
    ),
  "hr-zones": (p) =>
    p.event.zoneTimes ? (
      <HRZoneBreakdown {...p.event.zoneTimes} />
    ) : p.isLoadingStreamData ? (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton h-5 w-full" />
        ))}
      </div>
    ) : null,
  "pace-zones": (p) =>
    p.event.streamData?.pace && p.event.streamData.pace.length > 0 && p.racePacePerKm ? (
      <PaceZoneBreakdown
        paceData={p.event.streamData.pace}
        thresholdPace={p.racePacePerKm}
      />
    ) : p.isLoadingStreamData ? (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton h-5 w-full" />
        ))}
      </div>
    ) : null,
  "route-map": (p) =>
    p.event.streamData?.latlng && p.event.streamData.latlng.length > 0 ? (
      <RouteMap latlng={p.event.streamData.latlng} className="h-48" />
    ) : p.isLoadingStreamData ? (
      <div className="skeleton h-48 w-full rounded-lg" />
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
  "feedback": (p) => p.event.activityId ? <FeedbackWidget {...p} /> : null,
};

function SectionHeading({ icon: Icon, iconColor, label }: { icon: LucideIcon; iconColor: string; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon className="w-4 h-4" style={{ color: iconColor }} />
      <span className="text-sm font-semibold uppercase text-muted">{label}</span>
    </div>
  );
}

const SECTION_HEADINGS: Partial<Record<ModalWidgetId, React.ReactNode>> = {
  "report-card": <SectionHeading icon={Droplets} iconColor="var(--color-chart-secondary)" label="Blood Glucose" />,
  "stats": <SectionHeading icon={Activity} iconColor="var(--color-chart-secondary)" label="Performance" />,
  "carbs-ingested": <SectionHeading icon={Utensils} iconColor="var(--color-warning)" label="Fueling" />,
  "feedback": <SectionHeading icon={MessageSquare} iconColor="var(--color-muted)" label="Feedback" />,
  "pace-splits": <SectionHeading icon={BarChart3} iconColor="var(--color-chart-secondary)" label="Pace Splits" />,
  "hr-zones": <SectionHeading icon={Heart} iconColor="var(--color-error)" label="Heart Rate Zones" />,
  "pace-zones": <SectionHeading icon={Gauge} iconColor="var(--color-chart-secondary)" label="Pace Zones" />,
  "route-map": <SectionHeading icon={MapPin} iconColor="var(--color-success)" label="Route" />,
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
      <TabBar
        tabs={DEFAULT_TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Active tab content */}
      <WidgetList
        key={activeTab}
        order={tabLayout.order}
        hidden={tabLayout.hidden}
        widgetProps={effectiveProps}
        renderMap={widgetRenderMap}
        onReorder={handleReorder}
        onToggle={handleToggle}
        sectionHeadings={SECTION_HEADINGS}
      />
    </div>
  );
}
