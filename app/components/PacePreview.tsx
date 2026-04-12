import { formatPace } from "@/lib/format";
import type { PaceTableResult } from "@/lib/paceTable";

export function PacePreview({ paceTable }: { paceTable: PaceTableResult }) {
  return (
    <div className="bg-surface-alt border border-border rounded-lg p-3 space-y-1 text-sm">
      <div className="flex justify-between text-muted">
        <span>Easy</span>
        <span>{formatPace(paceTable.z2.min)} &ndash; {formatPace(paceTable.z2.max)} /km</span>
      </div>
      <div className="flex justify-between text-muted">
        <span>Race Pace</span>
        <span>{formatPace(paceTable.z3.min)} &ndash; {formatPace(paceTable.z3.max)} /km</span>
      </div>
      <div className="flex justify-between text-muted">
        <span>Intervals</span>
        <span>{formatPace(paceTable.z4.min)} &ndash; {formatPace(paceTable.z4.max)} /km</span>
      </div>
    </div>
  );
}
