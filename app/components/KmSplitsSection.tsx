import { computeKmSplits } from "@/lib/splits";
import { formatPace } from "@/lib/format";
import type { StreamData } from "@/lib/types";

interface KmSplitsSectionProps {
  streamData: StreamData;
  isLoading?: boolean;
}

function getZoneColor(paceMinPerKm: number): string {
  if (paceMinPerKm < 5.083) return "#ef4444"; // Hard: <5:05/km
  if (paceMinPerKm < 5.583) return "#f59e0b"; // Interval: 5:05-5:34
  if (paceMinPerKm < 7.0) return "#3b82f6"; // Race Pace: 5:35-6:59
  return "#22c55e"; // Easy: ≥7:00
}

function avgHrForWindow(
  startSec: number,
  endSec: number,
  hrData?: { time: number; value: number }[],
): number | null {
  if (!hrData || hrData.length === 0) return null;
  const startMin = Math.floor(startSec / 60);
  const endMin = Math.ceil(endSec / 60);
  const values = hrData
    .filter((p) => p.time >= startMin && p.time <= endMin)
    .map((p) => p.value);
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function elevForWindow(
  startSec: number,
  endSec: number,
  altData?: { time: number; value: number }[],
): number {
  if (!altData || altData.length === 0) return 0;
  const startMin = Math.round(startSec / 60);
  const endMin = Math.round(endSec / 60);
  const startAlt = altData.find((p) => p.time >= startMin)?.value;
  const endAlt = altData.findLast((p) => p.time <= endMin)?.value;
  if (startAlt == null || endAlt == null) return 0;
  return Math.round(endAlt - startAlt);
}

export function KmSplitsSection({
  streamData,
  isLoading,
}: KmSplitsSectionProps) {
  if (isLoading) {
    return (
      <div className="px-3 py-2.5">

        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-5 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const { distance, rawTime } = streamData;
  if (!distance || !rawTime || distance.length === 0 || rawTime.length === 0)
    return null;

  const rawSplits = computeKmSplits({ distance, time: rawTime });
  if (rawSplits.length === 0) return null;

  const splits = rawSplits.map((split) => ({
    ...split,
    avgHr: avgHrForWindow(
      split.startTimeSec,
      split.endTimeSec,
      streamData.heartrate,
    ),
    elevChange: elevForWindow(
      split.startTimeSec,
      split.endTimeSec,
      streamData.altitude,
    ),
  }));

  const fastestPace = Math.min(...splits.map((s) => s.paceMinPerKm));
  const maxSpeed = 60 / fastestPace;

  const gridCols = "28px 48px 1fr 40px 40px";

  return (
    <div className="px-4 py-3">
      <div className="text-sm font-semibold text-[#c4b5fd] mb-3">Splits</div>

      <div
        className="grid gap-2 pb-1.5 text-[11px] text-[#b8a5d4] uppercase tracking-wide border-b border-[#3d2b5a] mb-1"
        style={{ gridTemplateColumns: gridCols }}
      >
        <span>Km</span>
        <span>Pace</span>
        <span></span>
        <span className="text-right">Elev</span>
        <span className="text-right">HR</span>
      </div>

      {splits.map((split) => {
        const speed = 60 / split.paceMinPerKm;
        // Squared speed ratio: amplifies real pace differences (e.g. 6:52 vs 8:01)
        // while keeping trivial ones tight (e.g. 5:15 vs 5:18).
        // Linear speed ratio only shows ~15% visual difference for a full min/km gap
        // because speed (km/h) compresses pace differences. Squaring restores
        // perceptual proportion without distorting small variations.
        const barWidth = Math.round(Math.pow(speed / maxSpeed, 2) * 100);
        const color = getZoneColor(split.paceMinPerKm);

        return (
          <div
            key={split.km}
            className="grid gap-2 items-center py-1.5 text-[13px] border-b border-[#3d2b5a]/10 last:border-b-0"
            style={{ gridTemplateColumns: gridCols }}
          >
            <span className="text-[#b8a5d4] tabular-nums">{split.km}</span>
            <span className="text-white font-semibold tabular-nums">
              {formatPace(split.paceMinPerKm)}
            </span>
            <div className="w-full min-w-0">
              <div
                className="rounded-sm h-2"
                style={{ width: `${barWidth}%`, backgroundColor: color }}
              />
            </div>
            <span className="text-[#b8a5d4] tabular-nums text-right text-xs">
              {split.elevChange > 0
                ? `+${split.elevChange}`
                : split.elevChange}
            </span>
            <span className="text-[#c4b5fd] tabular-nums text-right text-xs">
              {split.avgHr ?? "\u2014"}
            </span>
          </div>
        );
      })}

      <div className="flex gap-3 mt-3 pt-2 border-t border-[#3d2b5a]/20 text-[10px] text-[#b8a5d4]">
        {[
          { color: "#ef4444", label: "Hard" },
          { color: "#f59e0b", label: "Interval" },
          { color: "#3b82f6", label: "Race" },
          { color: "#22c55e", label: "Easy" },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ backgroundColor: color }}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
