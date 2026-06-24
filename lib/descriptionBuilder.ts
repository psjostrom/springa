import { classifyHR, DEFAULT_LTHR } from "./constants";
import { formatPace, getZoneLabel, pctToMinPerKm } from "./format";
import type { ZoneName } from "./types";

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
  thresholdPace?: number,
): string {
  let currentSection = "";

  return description
    .split("\n")
    .map((line) => {
      if (!line.startsWith("- ")) {
        if (line.trim()) currentSection = line.trim();
        return line;
      }

      return stripStepTargets(line, currentSection, lthr, hrZones, thresholdPace);
    })
    .join("\n");
}

function stripStepTargets(
  line: string,
  currentSection: string,
  lthr: number,
  hrZones: number[],
  thresholdPace?: number,
): string {
  const hrMatch =
    /^- (.*?)(\d+(?:\.\d+)?(?:km|m|s)) (\d+)-(\d+)%\s*LTHR(?:\s*\([^)]+\))?((?:\s+.*)?)$/.exec(
      line,
    );

  if (hrMatch) {
    const [, label, duration, min, max, suffix = ""] = hrMatch;
    const supportedLabel = supportedStepLabel(label);
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

  const absPaceMatch =
    /^- (.*?)(\d+(?:\.\d+)?(?:km|m|s)) (\d{1,2}:\d{2})-(\d{1,2}:\d{2})\/km Pace((?:\s+.*)?)$/.exec(
      line,
    );

  if (absPaceMatch) {
    const [, label, duration, fastPace, slowPace, suffix = ""] = absPaceMatch;
    const resolvedLabel =
      supportedStepLabel(label) ??
      deriveAbsolutePaceEffortLabel(
        currentSection,
        line,
        fastPace,
        slowPace,
        thresholdPace,
      );
    return `- ${resolvedLabel} ${duration}${suffix}`;
  }

  const pctPaceMatch =
    /^- (.*?)(\d+(?:\.\d+)?(?:km|m|s)) (\d+)-(\d+)%\s*pace((?:\s+.*)?)$/.exec(
      line,
    );

  if (pctPaceMatch) {
    const [, label, duration, min, max, suffix = ""] = pctPaceMatch;
    const resolvedLabel =
      supportedStepLabel(label) ??
      derivePaceEffortLabel(currentSection, line, Number(min), Number(max));
    return `- ${resolvedLabel} ${duration}${suffix}`;
  }

  return line;
}

function supportedStepLabel(label: string | undefined): string | null {
  const trimmed = label?.trim();
  return trimmed && SUPPORTED_NO_PACE_LABELS.has(trimmed) ? trimmed : null;
}

function deriveHrEffortLabel(
  currentSection: string,
  line: string,
  minPct: number,
  maxPct: number,
  lthr: number,
  hrZones: number[],
): string {
  const contextLabel = deriveContextEffortLabel(currentSection, line);
  if (contextLabel) return contextLabel;

  if (isValidHrZones(lthr, hrZones)) {
    const midpointHr = lthr * ((minPct + maxPct) / 200);
    return getZoneLabel(classifyHR(midpointHr, hrZones));
  }

  if (maxPct <= 83) return "Easy";
  if (minPct >= 89) return "Fast";
  return "Race Pace";
}

function derivePaceEffortLabel(
  currentSection: string,
  line: string,
  minPct: number,
  maxPct: number,
): string {
  const contextLabel = deriveContextEffortLabel(currentSection, line);
  if (contextLabel) return contextLabel;

  return getZoneLabel(classifyPacePct((minPct + maxPct) / 2));
}

function deriveAbsolutePaceEffortLabel(
  currentSection: string,
  line: string,
  fastPace: string,
  slowPace: string,
  thresholdPace?: number,
): string {
  const contextLabel = deriveContextEffortLabel(currentSection, line);
  if (contextLabel) return contextLabel;

  if (thresholdPace && Number.isFinite(thresholdPace)) {
    const avgPace = (parsePaceStr(fastPace) + parsePaceStr(slowPace)) / 2;
    const avgPct = (thresholdPace / avgPace) * 100;
    return getZoneLabel(classifyPacePct(avgPct));
  }

  return "Easy";
}

function deriveContextEffortLabel(
  currentSection: string,
  line: string,
): string | null {
  const intensity = /(?:^|\s)intensity=(\w+)/.exec(line)?.[1];

  if (currentSection === "Warmup" || intensity === "warmup") return "Warmup";
  if (currentSection === "Cooldown" || intensity === "cooldown") return "Cooldown";
  if (intensity === "rest") return "Easy";
  return null;
}

function classifyPacePct(avgPct: number): ZoneName {
  if (avgPct >= 112) return "z5";
  if (avgPct >= 103) return "z4";
  if (avgPct >= 96) return "z3";
  return "z2";
}

function parsePaceStr(value: string): number {
  const [minutes, seconds] = value.split(":").map(Number);
  return minutes + seconds / 60;
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
