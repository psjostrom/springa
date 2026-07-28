import {
  canUseHeartRateMetric,
  type EffortMetric,
} from "@/lib/effortMetric";

const HR_DISABLED_HINT = "Sync HR zones from Intervals.icu first";

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
    <select
      aria-label="Effort metric"
      value={value}
      disabled={disabled}
      onChange={(e) => {
        onChange(e.target.value as EffortMetric);
      }}
      className="px-3 py-1.5 text-sm bg-surface-alt hover:bg-border text-muted rounded-lg transition disabled:opacity-50 border border-border focus:outline-none focus:ring-2 focus:ring-brand"
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
  );
}
