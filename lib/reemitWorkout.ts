import { addByFeel, removeByFeel } from "./byFeel";
import { resolveZoneBand, classifyHR, DEFAULT_LTHR } from "./constants";
import { formatStep, formatPaceStep } from "./descriptionBuilder";
import {
  canUseHeartRateMetric,
  detectEffortMetric,
  type EffortMetric,
} from "./effortMetric";
import type { ZoneName } from "./types";
import {
  ALWAYS_TARGETLESS_LABELS,
  HM_ZONE_DEFAULTS,
  isTargetlessZone,
} from "./zoneTargets";

export { detectEffortMetric };

export interface ReemitContext {
  lthr: number;
  hrZones: number[];
  thresholdPace?: number;
}

const DURATION_RE = /\d+(?:\.\d+)?(?:km|m|s)/;

const LABEL_TO_ZONE: Record<string, ZoneName | "walk"> = {
  Warmup: "z2",
  Easy: "z2",
  Cooldown: "z2",
  Downhill: "z2",
  Recovery: "z1",
  Free: "z1",
  "Race Pace": "z3",
  Race: "z3",
  Tempo: "z3",
  Interval: "z4",
  Fast: "z4",
  Threshold: "z4",
  Hard: "z5",
  Stride: "z5",
  Uphill: "z5",
  Walk: "walk",
};

interface ParsedStep {
  label: string | undefined;
  duration: string;
  suffix: string;
  zone: ZoneName | "walk";
}

export function reemitWorkoutName(name: string, target: EffortMetric): string {
  return target === "feel" ? addByFeel(name) : removeByFeel(name);
}

export function reemitWorkoutDescription(
  description: string,
  target: EffortMetric,
  ctx: ReemitContext,
): string {
  let currentSection = "";

  return description
    .split("\n")
    .map((line) => {
      if (!line.startsWith("- ")) {
        if (line.trim()) currentSection = line.trim();
        return line;
      }
      return reemitStepLine(line, currentSection, target, ctx);
    })
    .join("\n");
}

function reemitStepLine(
  line: string,
  currentSection: string,
  target: EffortMetric,
  ctx: ReemitContext,
): string {
  const parsed = parseStepLine(line, currentSection, ctx);
  if (!parsed) {
    throw new Error(`Cannot re-emit workout step: ${line}`);
  }

  const { label, duration, suffix, zone } = parsed;
  const targetless =
    target === "feel" ||
    (label != null && ALWAYS_TARGETLESS_LABELS.has(label)) ||
    isTargetlessZone(zone);

  const intensitySuffix = suffix.trim();
  const trailing = intensitySuffix ? ` ${intensitySuffix}` : "";

  if (targetless) {
    return `- ${formatPaceStep(duration, null, null, label, ctx.thresholdPace)}${trailing}`;
  }

  if (target === "hr") {
    if (!canUseHeartRateMetric(ctx.lthr, ctx.hrZones)) {
      throw new Error("HR effortMetric requires LTHR and 5 HR zones");
    }
    const band = resolveZoneBand(zone as ZoneName, ctx.lthr, ctx.hrZones);
    return `- ${formatStep(duration, band.min, band.max, ctx.lthr, label)}${trailing}`;
  }

  const pct = HM_ZONE_DEFAULTS[zone];
  return `- ${formatPaceStep(duration, pct.min, pct.max, label, ctx.thresholdPace)}${trailing}`;
}

function parseStepLine(
  line: string,
  currentSection: string,
  ctx: ReemitContext,
): ParsedStep | null {
  const hrMatch =
    /^- (.*?)(\d+(?:\.\d+)?(?:km|m|s)) (\d+)-(\d+)%\s*LTHR(?:\s*\([^)]+\))?((?:\s+.*)?)$/.exec(
      line,
    );
  if (hrMatch) {
    const [, rawLabel, duration, min, max, suffix = ""] = hrMatch;
    const label = normalizeLabel(rawLabel);
    const zone =
      zoneFromLabel(label) ??
      zoneFromHr(Number(min), Number(max), ctx) ??
      zoneFromContext(currentSection, suffix);
    if (!zone) return null;
    return { label, duration, suffix, zone };
  }

  const absPaceMatch =
    /^- (.*?)(\d+(?:\.\d+)?(?:km|m|s)) (\d{1,2}:\d{2})-(\d{1,2}:\d{2})\/km Pace((?:\s+.*)?)$/.exec(
      line,
    );
  if (absPaceMatch) {
    const [, rawLabel, duration, fastPace, slowPace, suffix = ""] = absPaceMatch;
    const label = normalizeLabel(rawLabel);
    const zone =
      zoneFromLabel(label) ??
      zoneFromAbsolutePace(fastPace, slowPace, ctx.thresholdPace) ??
      zoneFromContext(currentSection, suffix);
    if (!zone) return null;
    return { label, duration, suffix, zone };
  }

  const pctPaceMatch =
    /^- (.*?)(\d+(?:\.\d+)?(?:km|m|s)) (\d+)-(\d+)%\s*pace((?:\s+.*)?)$/.exec(
      line,
    );
  if (pctPaceMatch) {
    const [, rawLabel, duration, min, max, suffix = ""] = pctPaceMatch;
    const label = normalizeLabel(rawLabel);
    const zone =
      zoneFromLabel(label) ??
      zoneFromPacePct((Number(min) + Number(max)) / 2);
    return { label, duration, suffix, zone };
  }

  const targetlessMatch =
    /^- (.*?)(\d+(?:\.\d+)?(?:km|m|s))((?:\s+.*)?)$/.exec(line);
  if (targetlessMatch) {
    const [, rawLabel, duration, suffix = ""] = targetlessMatch;
    // Reject if "label" still contains a target-looking fragment (unparseable junk).
    if (/LTHR|\/km Pace|%\s*pace/i.test(rawLabel)) return null;
    // Near-miss targets (e.g. lowercase /km pace, "% Pace") land here with the
    // leftover text in suffix. Only allow empty / intensity= trailing tags —
    // otherwise re-emit would prepend a new band and keep the junk (frankenstein).
    if (!isAllowedTargetlessSuffix(suffix)) return null;
    const label = normalizeLabel(rawLabel);
    const zone =
      zoneFromLabel(label) ?? zoneFromContext(currentSection, suffix);
    if (!zone) return null;
    // Ensure duration token is the only duration-like token in the step core
    if (!DURATION_RE.test(duration)) return null;
    return { label, duration, suffix, zone };
  }

  return null;
}

function isAllowedTargetlessSuffix(suffix: string): boolean {
  const trimmed = suffix.trim();
  if (!trimmed) return true;
  return /^(?:intensity=\w+\s*)+$/.test(trimmed);
}

function normalizeLabel(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

function zoneFromLabel(label: string | undefined): ZoneName | "walk" | null {
  if (!label) return null;
  return LABEL_TO_ZONE[label] ?? null;
}

function zoneFromContext(
  currentSection: string,
  suffix: string,
): ZoneName | null {
  const intensity = /(?:^|\s)intensity=(\w+)/.exec(suffix)?.[1];
  if (currentSection === "Warmup" || intensity === "warmup") return "z2";
  if (currentSection === "Cooldown" || intensity === "cooldown") return "z2";
  if (intensity === "rest") return "z2";
  return null;
}

function zoneFromHr(
  minPct: number,
  maxPct: number,
  ctx: ReemitContext,
): ZoneName | null {
  const lthr = ctx.lthr || DEFAULT_LTHR;
  if (ctx.hrZones.length === 5) {
    const midpointHr = lthr * ((minPct + maxPct) / 200);
    return classifyHR(midpointHr, ctx.hrZones);
  }
  if (maxPct <= 83) return "z2";
  if (minPct >= 89) return "z4";
  return "z3";
}

function zoneFromPacePct(avgPct: number): ZoneName {
  if (avgPct >= 112) return "z5";
  if (avgPct >= 103) return "z4";
  if (avgPct >= 96) return "z3";
  return "z2";
}

function zoneFromAbsolutePace(
  fastPace: string,
  slowPace: string,
  thresholdPace?: number,
): ZoneName | null {
  if (!thresholdPace || !Number.isFinite(thresholdPace)) return "z2";
  const avgPace = (parsePaceStr(fastPace) + parsePaceStr(slowPace)) / 2;
  const avgPct = (thresholdPace / avgPace) * 100;
  return zoneFromPacePct(avgPct);
}

function parsePaceStr(value: string): number {
  const [minutes, seconds] = value.split(":").map(Number);
  return minutes + seconds / 60;
}
