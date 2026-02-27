import { format } from "date-fns";
import type { CalendarEvent } from "./types";
import type { RunBGContext } from "./runBGContext";
import { formatPace, formatDuration } from "./format";

export interface RunLineOptions {
  date?: boolean;
  name?: boolean;
  category?: boolean;
  distance?: boolean;
  duration?: boolean;
  pace?: boolean;
  avgHr?: boolean;
  maxHr?: boolean;
  load?: boolean;
  fuelRate?: boolean;
  carbsIngested?: boolean;
  hrZones?: boolean;
}

export interface RunLineExtras {
  bgStartAndRate?: { startBG: number; avgRate: number; entrySlope: number | null };
  bgSummary?: { startBG: number; endBG: number | null; dropRate: number | null };
  runBGContext?: RunBGContext | null;
  feedback?: { rating?: string; carbsG?: number; comment?: string } | null;
}

export function classifyEntryLabel(slope: number, stability: number): string {
  if (slope < -1.0) return "crashing";
  if (stability > 1.5) return "volatile";
  if (Math.abs(slope) <= 0.3 && stability < 0.5) return "stable";
  if (slope < -0.3) return "dropping";
  if (slope > 0.3) return "rising";
  return "unsteady";
}

/**
 * Build a single summary line for a completed run.
 * Returns `"- field1 | field2 | ..."`.
 */
export function formatRunLine(
  event: CalendarEvent,
  opts: RunLineOptions,
  extras?: RunLineExtras,
): string {
  const parts: string[] = [];

  if (opts.date !== false) parts.push(format(event.date, "yyyy-MM-dd"));
  if (opts.name) parts.push(event.name);
  if (opts.category && event.category) parts.push(`(${event.category})`);
  if (opts.distance && event.distance) parts.push(`${(event.distance / 1000).toFixed(1)}km`);
  if (opts.duration && event.duration) parts.push(formatDuration(event.duration));
  if (opts.pace && event.pace) parts.push(`pace ${formatPace(event.pace)}/km`);
  if (opts.avgHr && event.avgHr) parts.push(`avgHR ${event.avgHr}`);
  if (opts.maxHr && event.maxHr) parts.push(`maxHR ${event.maxHr}`);
  if (opts.load && event.load) parts.push(`load ${event.load}`);
  if (opts.fuelRate && event.fuelRate != null) parts.push(`fuel ${Math.round(event.fuelRate)}g/h`);
  if (opts.carbsIngested && event.carbsIngested) parts.push(`carbs ${event.carbsIngested}g`);

  if (opts.hrZones && event.hrZones) {
    const z = event.hrZones;
    const total = z.z1 + z.z2 + z.z3 + z.z4 + z.z5;
    if (total > 0) {
      parts.push(
        `Z1 ${formatDuration(Math.round(z.z1))} Z2 ${formatDuration(Math.round(z.z2))} Z3 ${formatDuration(Math.round(z.z3))} Z4 ${formatDuration(Math.round(z.z4))} Z5 ${formatDuration(Math.round(z.z5))}`,
      );
    }
  }

  // Extras: BG model data
  if (extras?.bgStartAndRate) {
    const bg = extras.bgStartAndRate;
    const sign = bg.avgRate >= 0 ? "+" : "";
    let bgText = `startBG ${bg.startBG.toFixed(1)}`;
    if (bg.entrySlope != null) {
      const slopeSign = bg.entrySlope >= 0 ? "+" : "";
      bgText += ` (entry ${slopeSign}${bg.entrySlope.toFixed(1)}/10m)`;
    }
    bgText += ` | BG rate ${sign}${bg.avgRate.toFixed(2)}/10min`;
    parts.push(bgText);
  }

  // Extras: BG stream summary (startBG, endBG, dropRate)
  if (extras?.bgSummary) {
    const bg = extras.bgSummary;
    const bgParts = [`startBG ${bg.startBG.toFixed(1)}`];
    if (bg.endBG != null) bgParts.push(`endBG ${bg.endBG.toFixed(1)}`);
    if (bg.dropRate != null) bgParts.push(`drop ${bg.dropRate >= 0 ? "+" : ""}${bg.dropRate.toFixed(2)}/10m`);
    parts.push(bgParts.join(", "));
  }

  // Extras: RunBGContext pre/post
  if (extras?.runBGContext?.pre) {
    const pre = extras.runBGContext.pre;
    const slopeSign = pre.entrySlope30m >= 0 ? "+" : "";
    parts.push(`start BG ${pre.startBG.toFixed(1)} | entry: ${slopeSign}${pre.entrySlope30m.toFixed(1)}/10m (${classifyEntryLabel(pre.entrySlope30m, pre.entryStability)})`);
  }
  if (extras?.runBGContext?.post) {
    const post = extras.runBGContext.post;
    let recoveryText = `end BG ${post.endBG.toFixed(1)} | recovery 30m: ${post.recoveryDrop30m >= 0 ? "+" : ""}${post.recoveryDrop30m.toFixed(1)}, lowest post-run ${post.nadirPostRun.toFixed(1)}`;
    if (post.postRunHypo) recoveryText += " HYPO!";
    parts.push(recoveryText);
  }

  // Extras: feedback
  if (extras?.feedback) {
    const fb = extras.feedback;
    const fbParts: string[] = [];
    if (fb.rating) fbParts.push(fb.rating);
    if (fb.carbsG != null) fbParts.push(`${fb.carbsG}g reported`);
    if (fb.comment) fbParts.push(`"${fb.comment}"`);
    if (fbParts.length > 0) parts.push(`feedback: ${fbParts.join(", ")}`);
  }

  return `- ${parts.join(" | ")}`;
}
