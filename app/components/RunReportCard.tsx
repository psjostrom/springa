"use client";

import type { CalendarEvent } from "@/lib/types";
import {
  buildReportCard,
  type BGScore,
  type HRZoneScore,
  type FuelScore,
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
}

export function RunReportCard({ event, isLoadingStreamData }: RunReportCardProps) {
  if (event.type !== "completed") return null;

  const report = buildReportCard(event);
  const streamLoading = isLoadingStreamData && !event.streamData;
  const hrLoading = isLoadingStreamData && !event.hrZones;

  // Nothing to show and not loading
  if (!report.bg && !report.hrZone && !report.fuel && !streamLoading && !hrLoading) {
    return null;
  }

  return (
    <div className="bg-[#2a1f3d] rounded-lg px-4 py-3 grid grid-cols-3 gap-3 text-sm mt-3">
      {streamLoading && !report.bg ? (
        <SkeletonCell label="Blood Glucose" />
      ) : report.bg ? (
        <BGCell score={report.bg} />
      ) : (
        <div />
      )}

      {hrLoading && !report.hrZone ? (
        <SkeletonCell label="HR Zone" />
      ) : report.hrZone ? (
        <HRCell score={report.hrZone} />
      ) : (
        <div />
      )}

      {report.fuel ? (
        <FuelCell score={report.fuel} />
      ) : (
        <div />
      )}
    </div>
  );
}
