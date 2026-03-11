"use client";

import type { CalendarEvent } from "@/lib/types";
import type { RunBGContext } from "@/lib/runBGContext";
import {
  buildReportCard,
  type BGScore,
  type HRZoneScore,
  type FuelScore,
  type EntryTrendScore,
  type RecoveryScore,
} from "@/lib/reportCard";

const RATING_COLORS = {
  good: "#22c55e",
  ok: "#eab308",
  bad: "#ef4444",
} as const;

function Dot({ rating }: { rating: "good" | "ok" | "bad" }) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ backgroundColor: RATING_COLORS[rating] }}
    />
  );
}

function BGCell({ score }: { score: BGScore }) {
  const label = score.hypo ? "Hypo" : score.dropRate < -1.0 ? "Dropping" : "Stable";
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[#b8a5d4] text-xs">Blood Glucose</div>
      <div className="flex items-center gap-1.5">
        <Dot rating={score.rating} />
        <span className="text-white text-sm font-semibold">{label}</span>
      </div>
      <div className="text-[#b8a5d4] text-xs">
        {score.startBG.toFixed(1)} → {score.minBG.toFixed(1)}
      </div>
    </div>
  );
}

function HRCell({ score }: { score: HRZoneScore }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[#b8a5d4] text-xs">HR Zone</div>
      <div className="flex items-center gap-1.5">
        <Dot rating={score.rating} />
        <span className="text-white text-sm font-semibold">
          {Math.round(score.pctInTarget)}% {score.targetZone}
        </span>
      </div>
    </div>
  );
}

function FuelCell({ score }: { score: FuelScore }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[#b8a5d4] text-xs">Fuel</div>
      <div className="flex items-center gap-1.5">
        <Dot rating={score.rating} />
        <span className="text-white text-sm font-semibold">
          {Math.round(score.actual)}g / {Math.round(score.planned)}g
        </span>
      </div>
    </div>
  );
}

function EntryTrendCell({ score }: { score: EntryTrendScore }) {
  const sign = score.slope30m >= 0 ? "+" : "";
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[#b8a5d4] text-xs">Pre-Run</div>
      <div className="flex items-center gap-1.5">
        <Dot rating={score.rating} />
        <span className="text-white text-sm font-semibold">{score.label}</span>
      </div>
      <div className="text-[#b8a5d4] text-xs">
        {sign}{score.slope30m.toFixed(1)}/10m
      </div>
    </div>
  );
}

function RecoveryCell({ score }: { score: RecoveryScore }) {
  const sign = score.drop30m >= 0 ? "+" : "";
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[#b8a5d4] text-xs">Recovery</div>
      <div className="flex items-center gap-1.5">
        <Dot rating={score.rating} />
        <span className="text-white text-sm font-semibold">{score.label}</span>
      </div>
      <div className="text-[#b8a5d4] text-xs">
        30m: {sign}{score.drop30m.toFixed(1)}, low {score.nadir.toFixed(1)}
      </div>
    </div>
  );
}

function SkeletonCell({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[#b8a5d4] text-xs">{label}</div>
      <div className="skeleton h-5 w-20" />
    </div>
  );
}

interface RunReportCardProps {
  event: CalendarEvent;
  isLoadingStreamData?: boolean;
  runBGContext?: RunBGContext | null;
}

export function RunReportCard({ event, isLoadingStreamData, runBGContext }: RunReportCardProps) {
  if (event.type !== "completed") return null;

  const report = buildReportCard(event, runBGContext);
  const streamLoading = isLoadingStreamData && !event.streamData;
  const hrLoading = isLoadingStreamData && !event.zoneTimes;

  // Nothing to show and not loading
  if (!report.bg && !report.hrZone && !report.fuel && !report.entryTrend && !report.recovery && !streamLoading && !hrLoading) {
    return null;
  }

  const row1: React.ReactNode[] = [];
  if (streamLoading && !report.bg) row1.push(<SkeletonCell key="bg" label="Blood Glucose" />);
  else if (report.bg) row1.push(<BGCell key="bg" score={report.bg} />);
  if (hrLoading && !report.hrZone) row1.push(<SkeletonCell key="hr" label="HR Zone" />);
  else if (report.hrZone) row1.push(<HRCell key="hr" score={report.hrZone} />);
  if (report.fuel) row1.push(<FuelCell key="fuel" score={report.fuel} />);

  const row2: React.ReactNode[] = [];
  if (report.entryTrend) row2.push(<EntryTrendCell key="entry" score={report.entryTrend} />);
  if (report.recovery) row2.push(<RecoveryCell key="recovery" score={report.recovery} />);

  return (
    <div className="space-y-1.5 p-2">
      {row1.length > 0 && (
        <div className={`bg-[#2a1f3d] rounded-lg px-3 py-2.5 grid gap-2 text-sm`} style={{ gridTemplateColumns: `repeat(${row1.length}, 1fr)` }}>
          {row1}
        </div>
      )}
      {row2.length > 0 && (
        <div className={`bg-[#2a1f3d] rounded-lg px-3 py-2.5 grid gap-2 text-sm`} style={{ gridTemplateColumns: `repeat(${row2.length}, 1fr)` }}>
          {row2}
        </div>
      )}
    </div>
  );
}
