/**
 * Shared display helpers for BG rate values.
 *
 * The model stores rates per-minute (mmol/L per min). At runner-realistic
 * magnitudes (-0.04 etc.) those values round to "-0.0" at 1 decimal and
 * make per-min thresholds (-0.5 = -30 mmol/hr; -1.5 = -90 mmol/hr) look
 * reasonable on paper while being physiologically unreachable. The whole
 * UI displays per-hour; convert at the display boundary, not in the model.
 *
 * One owner for this conversion — duplicated copies drifted before
 * (BGResponsePanel + BGCompact + BGScatterChart) and silently rendered
 * everything green / "Stable" because the per-min thresholds never fired.
 */

export function perHour(perMin: number): number {
  return perMin * 60;
}

/** Color token for a BG rate. Input is mmol/hr. */
export function rateColor(ratePerHour: number): string {
  if (ratePerHour > -1) return "var(--color-success)"; // stable
  if (ratePerHour > -3) return "var(--color-warning)"; // moderate drop
  return "var(--color-error)"; // fast drop
}

/** Plain-language label for a BG rate. Input is mmol/hr. */
export function rateLabel(ratePerHour: number): string {
  if (ratePerHour > -1) return "Stable";
  if (ratePerHour > -3) return "Moderate";
  return "Fast drop";
}
