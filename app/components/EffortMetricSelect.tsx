import { ChevronDown } from "lucide-react";
import {
  canUseHeartRateMetric,
  type EffortMetric,
} from "@/lib/effortMetric";

const HR_DISABLED_HINT = "Sync HR zones from Intervals.icu first";

const CONTROL_CLASS =
  "h-8 text-sm bg-surface-alt hover:bg-border text-muted rounded-lg border border-border transition disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-brand";

interface EffortMetricSelectProps {
  value: EffortMetric;
  onChange: (metric: EffortMetric) => void;
  disabled?: boolean;
  lthr?: number;
  hrZones?: number[];
}

export function EffortMetricSelect({
  value,
  onChange,
  disabled = false,
  lthr,
  hrZones,
}: EffortMetricSelectProps) {
  const hrAvailable = canUseHeartRateMetric(lthr, hrZones);

  return (
    <div className="relative inline-flex">
      <select
        aria-label="Effort metric"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value as EffortMetric);
        }}
        className={`${CONTROL_CLASS} appearance-none pl-3 pr-8`}
      >
        <option value="pace">By Pace</option>
        <option
          value="hr"
          disabled={!hrAvailable}
          title={!hrAvailable ? HR_DISABLED_HINT : undefined}
        >
          By Heart Rate
        </option>
        <option value="feel">By Feel</option>
      </select>
      <ChevronDown
        size={14}
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted"
      />
    </div>
  );
}
