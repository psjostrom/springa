import { Loader2 } from "lucide-react";
import type { PaceSuggestion } from "@/lib/paceInsight";

function formatTime(totalSecs: number): string {
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}:${String(rm).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function distanceLabel(km: number): string {
  if (Math.abs(km - 5) < 0.5) return "5K";
  if (Math.abs(km - 10) < 0.5) return "10K";
  if (Math.abs(km - 21.0975) < 0.5) return "Half";
  if (Math.abs(km - 42.195) < 0.5) return "Marathon";
  return `${km}km`;
}

interface PaceSuggestionCardProps {
  suggestion: PaceSuggestion;
  onAccept: () => void;
  onDismiss: () => void;
  isAccepting: boolean;
}

export function PaceSuggestionCard({ suggestion, onAccept, onDismiss, isAccepting }: PaceSuggestionCardProps) {
  const { direction, suggestedAbilitySecs, currentAbilitySecs, currentAbilityDist, z4ImprovementSecPerKm, cardiacCostChangePercent, raceResult, pbEvidence } = suggestion;

  const isImprovement = direction === "improvement";
  const label = distanceLabel(currentAbilityDist);

  const evidenceLines: string[] = [];
  if (raceResult?.distanceMatch) {
    const diff = Math.abs(currentAbilitySecs - raceResult.duration);
    const faster = raceResult.duration < currentAbilitySecs;
    evidenceLines.push(
      `You finished in ${formatTime(raceResult.duration)} — ${formatTime(diff)} ${faster ? "faster" : "slower"} than your current ${label} ability (${formatTime(currentAbilitySecs)}).`,
    );
  } else if (pbEvidence) {
    evidenceLines.push(
      `Your best ${label} effort was ${formatTime(pbEvidence.timeSeconds)} (${Math.round(pbEvidence.ageDays)} days ago) — your current setting looks too conservative.`,
    );
  } else {
    if (z4ImprovementSecPerKm != null) {
      const abs = Math.abs(z4ImprovementSecPerKm);
      evidenceLines.push(
        isImprovement
          ? `Your interval pace has improved by ${abs} sec/km over the last weeks.`
          : `Your interval pace has slowed by ${abs} sec/km over recent weeks.`,
      );
    }
    if (cardiacCostChangePercent != null) {
      const abs = Math.abs(cardiacCostChangePercent);
      evidenceLines.push(
        isImprovement
          ? `Your easy runs show ${abs.toFixed(0)}% better efficiency.`
          : `Your easy runs show ${abs.toFixed(0)}% higher effort for the same output.`,
      );
    }
  }

  const borderColor = isImprovement ? "border-brand/40" : "border-warning/40";
  const heading = raceResult?.distanceMatch
    ? `Race result: ${raceResult.name}`
    : isImprovement
      ? "Your paces may need updating"
      : "Your paces may need adjusting";

  const acceptLabel = isImprovement ? "Update plan" : "Adjust plan";

  return (
    <div className={`bg-surface rounded-xl border ${borderColor} p-4 space-y-3`}>
      <p className="text-sm font-semibold text-text">{heading}</p>

      {evidenceLines.map((line, i) => (
        <p key={i} className="text-sm text-muted">{line}</p>
      ))}

      {!isImprovement && !raceResult?.distanceMatch && (
        <p className="text-sm text-muted">Adjusting can reduce injury risk.</p>
      )}

      {raceResult && !raceResult.distanceMatch && (
        <p className="text-xs text-muted">Completed {raceResult.name} ({formatTime(raceResult.duration)}).</p>
      )}

      <p className="text-sm text-text">
        Suggested: <span className="font-semibold">{label} in {formatTime(suggestedAbilitySecs)}</span>
        <span className="text-muted"> (was {formatTime(currentAbilitySecs)})</span>
      </p>

      <div className="flex gap-3 pt-1">
        <button
          onClick={onAccept}
          disabled={isAccepting}
          className="px-4 py-2 text-sm font-bold rounded-lg bg-brand text-bg hover:bg-brand/90 transition disabled:opacity-50 flex items-center gap-2"
          aria-label={isAccepting ? "Updating paces..." : acceptLabel}
        >
          {isAccepting && <Loader2 className="w-4 h-4 animate-spin" />}
          {isAccepting ? "Updating..." : acceptLabel}
        </button>
        <button
          onClick={onDismiss}
          disabled={isAccepting}
          className="px-4 py-2 text-sm font-medium rounded-lg text-muted hover:text-text transition disabled:opacity-50"
          aria-label="Not now"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
