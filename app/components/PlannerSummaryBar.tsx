import type { UserSettings } from "@/lib/settings";
import { differenceInWeeks, parseISO } from "date-fns";

interface PlannerSummaryBarProps {
  settings: UserSettings;
  hasPlan: boolean;
  onEdit: () => void;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function PlannerSummaryBar({ settings, hasPlan, onEdit }: PlannerSummaryBarProps) {
  const dayCount = settings.runDays?.length ?? 0;
  const longRunLabel = settings.longRunDay != null ? DAY_LABELS[settings.longRunDay] : "auto";

  const raceSegment = settings.raceName
    ? settings.raceName + (settings.raceDist ? ` ${settings.raceDist}km` : "")
    : settings.raceDist
      ? `${settings.raceDist}km`
      : null;

  const weeksToGo = settings.raceDate
    ? differenceInWeeks(parseISO(settings.raceDate), new Date())
    : null;

  return (
    <div className="bg-surface-alt border border-border rounded-xl px-4 py-3 flex items-center justify-between gap-2">
      <div className="text-sm text-text truncate flex items-center gap-1 flex-wrap">
        <span>{dayCount} days/wk</span>
        <span className="text-border-subtle">&middot;</span>
        <span>Long: {longRunLabel}</span>
        {raceSegment && (
          <>
            <span className="text-border-subtle">&middot;</span>
            <span>{raceSegment}</span>
          </>
        )}
        {hasPlan && weeksToGo != null && weeksToGo > 0 && (
          <>
            <span className="text-border-subtle">&middot;</span>
            <span className="text-success">{weeksToGo} wks to go</span>
          </>
        )}
        {hasPlan && weeksToGo === 0 && (
          <>
            <span className="text-border-subtle">&middot;</span>
            <span className="text-brand font-bold">Race week!</span>
          </>
        )}
      </div>
      <button
        onClick={onEdit}
        className="text-brand text-sm font-medium shrink-0 hover:underline"
      >
        Edit
      </button>
    </div>
  );
}
