import { classifyHR, DEFAULT_LTHR } from "./constants";
import { formatPace, getZoneLabel, pctToMinPerKm } from "./format";

const SUPPORTED_NO_PACE_LABELS = new Set([
  "Cooldown",
  "Downhill",
  "Easy",
  "Fast",
  "Free",
  "Hard",
  "Interval",
  "Race",
  "Race Pace",
  "Recovery",
  "Stride",
  "Tempo",
  "Threshold",
  "Uphill",
  "Walk",
  "Warmup",
]);

/** Format a single workout step line with LTHR zone and BPM range. */
export function formatStep(
  duration: string,
  minPct: number,
  maxPct: number,
  lthr: number,
  note?: string,
): string {
  const minBpm = Math.floor(lthr * minPct);
  const maxBpm = Math.ceil(lthr * maxPct);
  const core = `${duration} ${Math.round(minPct * 100)}-${Math.round(maxPct * 100)}% LTHR (${minBpm}-${maxBpm} bpm)`;
  return note ? `${note} ${core}` : core;
}

/** Format a pace-based workout step for Intervals.icu.
 *  minPct/maxPct are Intervals.icu pace percentages (higher = faster).
 *  Pass null for both to create a step with no pace target (walk, effort-based).
 *  When thresholdPaceMinPerKm is provided, emits absolute pace syntax
 *  (e.g. "5:33-5:44/km Pace") instead of percentage syntax. */
export function formatPaceStep(
  duration: string,
  minPct: number | null,
  maxPct: number | null,
  note?: string,
  thresholdPace?: number,
): string {
  const prefix = note ? `${note} ` : "";
  if (minPct == null || maxPct == null) return `${prefix}${duration}`;
  if (thresholdPace) {
    const fastPace = pctToMinPerKm(maxPct, thresholdPace);
    const slowPace = pctToMinPerKm(minPct, thresholdPace);
    return `${prefix}${duration} ${formatPace(fastPace)}-${formatPace(slowPace)}/km Pace`;
  }
  return `${prefix}${duration} ${minPct}-${maxPct}% pace`;
}

/** Build a workout description from warmup, main steps, and cooldown. */
export function createWorkoutText(
  warmup: string,
  mainSteps: string[],
  cooldown: string,
  repeats = 1,
  notes?: string,
): string {
  const lines: string[] = [];

  if (notes) {
    lines.push(notes, "");
  }

  lines.push(
    "Warmup",
    `- ${warmup}`,
    "",
    repeats > 1 ? `Main set ${repeats}x` : "Main set",
    ...mainSteps.map((s) => `- ${s}`),
    "",
    "Cooldown",
    `- ${cooldown}`,
    "",
  );

  return lines.join("\n");
}

/** Strip pace and HR targets from step lines while keeping labels and tags. */
export function stripWorkoutTargets(
  description: string,
  lthr = DEFAULT_LTHR,
  hrZones: number[] = [],
): string {
  let currentSection = "";

  return description
    .split("\n")
    .map((line) => {
      if (!line.startsWith("- ")) {
        if (line.trim()) currentSection = line.trim();
        return line;
      }

      return stripStepTargets(line, currentSection, lthr, hrZones);
    })
    .join("\n");
}

function stripStepTargets(
  line: string,
  currentSection: string,
  lthr: number,
  hrZones: number[],
): string {
  const hrMatch =
    /^- (.*?)(\d+(?:\.\d+)?(?:km|m|s)) (\d+)-(\d+)%\s*LTHR(?:\s*\([^)]+\))?((?:\s+.*)?)$/.exec(
      line,
    );

  if (hrMatch) {
    const [, label, duration, min, max, suffix = ""] = hrMatch;
    const existingLabel = label.trim();
    const supportedLabel = SUPPORTED_NO_PACE_LABELS.has(existingLabel)
      ? existingLabel
      : null;
    const resolvedLabel =
      supportedLabel ??
      deriveHrEffortLabel(
        currentSection,
        line,
        Number(min),
        Number(max),
        lthr,
        hrZones,
      );
    return `- ${resolvedLabel} ${duration}${suffix}`;
  }

  return line
    .replace(/\s+\d{1,2}:\d{2}-\d{1,2}:\d{2}\/km Pace/g, "")
    .replace(/\s+\d+-\d+% pace/g, "");
}

function deriveHrEffortLabel(
  currentSection: string,
  line: string,
  minPct: number,
  maxPct: number,
  lthr: number,
  hrZones: number[],
): string {
  const intensity = /(?:^|\s)intensity=(\w+)/.exec(line)?.[1];

  if (currentSection === "Warmup" || intensity === "warmup") return "Warmup";
  if (currentSection === "Cooldown" || intensity === "cooldown") return "Cooldown";
  if (intensity === "rest") return "Easy";

  if (isValidHrZones(lthr, hrZones)) {
    const midpointHr = lthr * ((minPct + maxPct) / 200);
    return getZoneLabel(classifyHR(midpointHr, hrZones));
  }

  if (maxPct <= 83) return "Easy";
  if (minPct >= 89) return "Fast";
  return "Race Pace";
}

function isValidHrZones(lthr: number, hrZones: number[]): boolean {
  return (
    Number.isFinite(lthr) &&
    hrZones.length === 5 &&
    hrZones.every((zone) => Number.isFinite(zone))
  );
}

/** Build a single-step workout description (no warmup/cooldown structure). */
export function createSimpleWorkoutText(
  step: string,
  notes?: string,
): string {
  const lines: string[] = [];

  if (notes) {
    lines.push(notes, "");
  }

  lines.push(`- ${step}`, "");

  return lines.join("\n");
}
