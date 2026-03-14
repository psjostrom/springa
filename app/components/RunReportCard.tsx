"use client";

import { useState } from "react";
import { Droplets, Clock, Heart } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CalendarEvent } from "@/lib/types";
import type { RunBGContext } from "@/lib/runBGContext";
import { buildReportCard } from "@/lib/reportCard";

const RATING_COLORS = {
  good: "#39ff14",
  ok: "#fbbf24",
  bad: "#ff3366",
} as const;

const RATING_FRACTIONS = { good: 0.9, ok: 0.55, bad: 0.25 } as const;

// --- Popover ---

interface PopoverContent {
  title: string;
  lines: { label: string; value: string }[];
  description: string;
}

function BGPopover({ content, onClose }: { content: PopoverContent; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-4 w-72 shadow-xl" onClick={(e) => { e.stopPropagation(); }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-white">{content.title}</span>
          <button onClick={onClose} aria-label="Close" className="text-[#b8a5d4] hover:text-white text-sm">✕</button>
        </div>
        <div className="space-y-1.5 text-sm mb-3">
          {content.lines.map((line) => (
            <div key={line.label} className="flex justify-between">
              <span className="text-[#b8a5d4]">{line.label}</span>
              <span className="text-white">{line.value}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-[#8b7ba8] leading-relaxed">{content.description}</p>
      </div>
    </div>
  );
}

// --- Card component (matches StatsWidget pattern) ---

interface BGCardProps {
  icon: LucideIcon;
  iconColor: string;
  label: string;
  value: string;
  unit: string;
  judgmentLabel: string;
  judgmentColor: string;
  fraction: number;
  popover: PopoverContent;
}

function BGCard({ icon: Icon, iconColor, label, value, unit, judgmentLabel, judgmentColor, fraction, popover }: BGCardProps) {
  const [showPopover, setShowPopover] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => { setShowPopover(true); }}
        className="bg-[#2a1f3d] rounded-lg p-3 space-y-1.5 text-left transition-colors active:bg-[#3d2b5a]"
      >
        <div className="flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5" style={{ color: iconColor }} />
          <span className="text-xs text-[#b8a5d4]">{label}</span>
          <span className="ml-auto text-xs font-medium" style={{ color: judgmentColor }}>
            {judgmentLabel}
          </span>
        </div>
        <div className="text-lg font-bold text-white">
          {value} <span className="text-sm text-[#8b7ba8] font-normal">{unit}</span>
        </div>
        <div className="h-1 bg-[#1e1535] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.round(fraction * 100)}%`, backgroundColor: judgmentColor }}
          />
        </div>
      </button>
      {showPopover && <BGPopover content={popover} onClose={() => { setShowPopover(false); }} />}
    </>
  );
}

function SkeletonCard({ label }: { label: string }) {
  return (
    <div className="bg-[#2a1f3d] rounded-lg p-3 space-y-1.5">
      <div className="text-xs text-[#b8a5d4]">{label}</div>
      <div className="skeleton h-6 w-24" />
      <div className="skeleton h-1 w-full rounded-full" />
    </div>
  );
}

// --- Widget ---

interface RunReportCardProps {
  event: CalendarEvent;
  isLoadingStreamData?: boolean;
  runBGContext?: RunBGContext | null;
}

export function RunReportCard({ event, isLoadingStreamData, runBGContext }: RunReportCardProps) {
  if (event.type !== "completed") return null;

  const report = buildReportCard(event, runBGContext);
  const streamLoading = isLoadingStreamData && !event.streamData;

  // Nothing to show and not loading
  if (!report.bg && !report.entryTrend && !report.recovery && !streamLoading) {
    return null;
  }

  const cards: React.ReactNode[] = [];

  // Blood Glucose
  if (streamLoading && !report.bg) {
    cards.push(<SkeletonCard key="bg" label="Blood Glucose" />);
  } else if (report.bg) {
    const bg = report.bg;
    let bgLabel: string;
    if (bg.hypo) bgLabel = "Hypo";
    else if (bg.dropRate < -1.0) bgLabel = "Dropping";
    else bgLabel = "Stable";
    cards.push(
      <BGCard
        key="bg"
        icon={Droplets}
        iconColor="#06b6d4"
        label="Blood Glucose"
        value={`${bg.startBG.toFixed(1)} → ${bg.minBG.toFixed(1)}`}
        unit=""
        judgmentLabel={bgLabel}
        judgmentColor={RATING_COLORS[bg.rating]}
        fraction={RATING_FRACTIONS[bg.rating]}
        popover={{
          title: "Blood Glucose",
          lines: [
            { label: "Start BG", value: `${bg.startBG.toFixed(1)} mmol/L` },
            { label: "Min BG", value: `${bg.minBG.toFixed(1)} mmol/L` },
            { label: "Drop rate", value: `${bg.dropRate.toFixed(2)} /10m` },
            { label: "Hypo", value: bg.hypo ? "Yes" : "No" },
          ],
          description: "BG response during the run. Stable (drop < 1.0/10m) is good. Hypo (< 3.9) or fast drop (> 2.0/10m) flags a problem.",
        }}
      />
    );
  }

  // Pre-Run
  if (report.entryTrend) {
    const et = report.entryTrend;
    const sign = et.slope30m >= 0 ? "+" : "";
    cards.push(
      <BGCard
        key="entry"
        icon={Clock}
        iconColor="#c4b5fd"
        label="Pre-Run"
        value={et.label}
        unit=""
        judgmentLabel={`${sign}${et.slope30m.toFixed(1)}/10m`}
        judgmentColor={RATING_COLORS[et.rating]}
        fraction={RATING_FRACTIONS[et.rating]}
        popover={{
          title: "Pre-Run BG Trend",
          lines: [
            { label: "BG direction", value: `${sign}${et.slope30m.toFixed(1)} mmol/L per 10 min` },
            { label: "How steady", value: et.stability < 0.5 ? "Very steady" : et.stability < 1.0 ? "Steady" : et.stability < 2.0 ? "Some swings" : "Volatile" },
          ],
          description: "How your BG was behaving in the 30 minutes before starting. Stable or gently rising is ideal for a safe run.",
        }}
      />
    );
  }

  // Recovery
  if (report.recovery) {
    const rec = report.recovery;
    const sign = rec.drop30m >= 0 ? "+" : "";
    cards.push(
      <BGCard
        key="recovery"
        icon={Heart}
        iconColor="#39ff14"
        label="Recovery"
        value={rec.label}
        unit=""
        judgmentLabel={`low ${rec.nadir.toFixed(1)}`}
        judgmentColor={RATING_COLORS[rec.rating]}
        fraction={RATING_FRACTIONS[rec.rating]}
        popover={{
          title: "Post-Run Recovery",
          lines: [
            { label: "BG change (30 min)", value: `${sign}${rec.drop30m.toFixed(1)} mmol/L` },
            { label: "Lowest BG after run", value: `${rec.nadir.toFixed(1)} mmol/L` },
            { label: "Post-run hypo", value: rec.postHypo ? "Yes" : "No" },
          ],
          description: "How your BG behaved in the 2 hours after finishing. Clean means no crash. The lowest point shows how far BG dropped.",
        }}
      />
    );
  }

  return (
    <div className="p-2">
      <div className="grid grid-cols-3 gap-2">
        {cards}
      </div>
    </div>
  );
}
