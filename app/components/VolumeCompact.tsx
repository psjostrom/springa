"use client";

interface VolumeCompactProps {
  actualKm: number;
  targetKm: number;
  completedRuns: number;
  totalRuns: number;
}

export function VolumeCompact({ actualKm, targetKm, completedRuns, totalRuns }: VolumeCompactProps) {
  if (targetKm <= 0 && actualKm <= 0) return null;
  const pct = targetKm > 0 ? Math.min(100, Math.round((actualKm / targetKm) * 100)) : 0;

  return (
    <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-4">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xl font-bold text-white">{Math.round(actualKm)} km</span>
        <span className="text-sm text-[#b8a5d4]">{Math.round(targetKm)} km target</span>
      </div>
      <div
        className="h-2 bg-[#2a1f45] rounded-full overflow-hidden mb-1.5"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: pct >= 100 ? "#39ff14" : "#06b6d4",
          }}
        />
      </div>
      <span className="text-xs text-[#8b7ba8]">{completedRuns} of {totalRuns} runs</span>
    </div>
  );
}
