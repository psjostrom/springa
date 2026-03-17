import type { CalendarEvent, PaceTable } from "./types";
import type { BGResponseModel } from "./bgModel";
import type { FitnessInsights } from "./fitness";
import type { RunBGContext } from "./runBGContext";
import type { AdaptedEvent } from "./adaptPlan";
import { formatRunLine } from "./runLine";
import { buildZoneBlock, buildProfileLine } from "./zoneText";

interface PromptInput {
  adapted: AdaptedEvent;
  recentSameCategory: CalendarEvent[];
  bgModel: BGResponseModel;
  insights: FitnessInsights;
  runBGContexts: Record<string, RunBGContext>;
  lthr: number;
  maxHr?: number;
  hrZones: number[];
  paceTable?: PaceTable;
  feedbackByActivity?: Map<string, { rating?: string; comment?: string; carbsG?: number; createdAt: number }>;
  crossRunPatterns?: string;
}

/**
 * Build system + user prompts for AI-generated workout notes.
 */
export function buildAdaptNotePrompt(input: PromptInput): {
  system: string;
  user: string;
} {
  const { adapted, recentSameCategory, bgModel, insights, runBGContexts, lthr, maxHr, hrZones, paceTable, feedbackByActivity, crossRunPatterns } =
    input;

  const system = `You are Coach — writing pre-workout notes for an experienced T1D runner (pump OFF, ${buildProfileLine(lthr, maxHr)}).

Pace zones:
${buildZoneBlock(lthr, maxHr, paceTable, hrZones)}

Write in first person ("I've bumped your fuel…"). Never say "BG model", "the system", or "the data."

Format: two short paragraphs separated by a blank line.
1. **Running** — what the session is, pacing/effort cues from recent data. 2–3 short sentences.
2. **Fuel & BG** — fuel rate, why, any BG-specific heads-up. 1–2 short sentences.

Keep sentences short and punchy. No run-on sentences. No filler. Use mmol/L, g/h, and min/km. Use **bold** for the fuel rate only. No headers, no bullets, no lists.

Examples of good notes:

Easy run:
"Bonus easy 45 minutes — your last two easy runs averaged 7:15/km at 138 bpm, right in the pocket.

Fuel holds at **60 g/h** — BG stayed flat on both Mar 14 and Mar 17, starting at 8.1 and finishing at 7.9, so no reason to change."

Intervals:
"Long intervals — 4×8min at tempo, targeting 5:10–5:20/km and 152–158 bpm based on your Mar 12 session (5:12/km, 155 bpm avg). Keep the recovery jogs genuinely easy.

Fuel is **65 g/h**, bumped from 60 — BG dropped from 9.1 to 5.8 on Mar 12, steeper than your easy runs at the same rate."

Rules:
- Cite specific BG values, dates, paces, and HR from the data. These make the note useful. Never echo model internals (sample counts, window counts, fitness numbers, raw drop rates).
- For easy and club runs, one sentence on the running side is enough. Skip advice the runner already knows ("run easy", "stay under LTHR", "keep effort relaxed", "let pace float"). Club runs are interval-type sessions — focus on fuel/BG prep.
- LTHR is the **absolute ceiling**, not a target. For intervals, give a specific HR target range 10–20 bpm below LTHR based on recent data. Never say "keep HR under LTHR."
- Fuel adjustments go both ways: increase if during-run BG drops too fast, decrease if BG stays high. But NEVER bump fuel "as a precaution" when entry BG was rising/stable and drops were acceptable. And NEVER frame a decrease as a response to a crash — that's backwards.
- CRITICAL: "end BG" is when the run stopped. "lowest post-run" is recovery (pump reconnected, sitting). A post-run crash is a recovery issue, NOT a mid-run fueling issue. Never cite a post-run value as evidence for changing mid-run fuel rate.
- Entry trends from past runs are historical data, not predictions. Never cite one past entry trend and give contradictory conditional advice ("Mar 17 was rising, so if it's falling…"). Base pre-run advice on the *pattern* across multiple runs, not a single reading.
- If a recent run has a "bad" rating or mentions a hypo, connect it to what's different this time.
- If the workout was swapped to easy, explain why.
- Only state distances and durations that appear in the data. Never guess from workout names.
- If "Cross-Run BG Patterns" are provided, weave relevant findings into the fuel paragraph — only the ones that matter for this session.
- If "Other recent run feedback" appears, only reference it if a crash, hypo, or bad rating from a different category is relevant to this session's fuel strategy. Otherwise ignore it.
- Only mention fitness/fatigue if TSB is below -15 or ramp rate suggests overreaching. The runner doesn't need a form report.`;

  const lines: string[] = [];

  // 1. This workout
  lines.push("## This Workout");
  lines.push(`Name: ${adapted.name}`);
  lines.push(`Date: ${adapted.date}`);
  lines.push(`Category: ${adapted.category}`);
  if (adapted.original.duration) {
    lines.push(`Duration: ${Math.round(adapted.original.duration / 60)} min`);
  }
  if (adapted.original.distance) {
    lines.push(`Distance: ${(adapted.original.distance / 1000).toFixed(1)} km`);
  }
  if (adapted.fuelRate != null) {
    lines.push(`Fuel rate: ${adapted.fuelRate} g/h`);
  }
  if (adapted.changes.length > 0) {
    lines.push("Changes:");
    for (const c of adapted.changes) {
      lines.push(`- ${c.detail}`);
    }
  }
  if (adapted.swapped) {
    lines.push("NOTE: This workout was swapped from intervals to easy for recovery.");
  }

  // 2. Recent same-category runs
  const recentRuns = recentSameCategory.slice(0, 5);
  const shownFeedbackIds = new Set<string>();
  if (recentRuns.length > 0) {
    lines.push("");
    lines.push(`## Recent ${adapted.category} runs`);
    for (const run of recentRuns) {
      const ctx = run.activityId ? runBGContexts[run.activityId] : undefined;
      const fb = run.activityId ? feedbackByActivity?.get(run.activityId) : undefined;
      if (fb && run.activityId) shownFeedbackIds.add(run.activityId);
      lines.push(formatRunLine(
        run,
        { date: true, pace: true, distance: true, avgHr: true, fuelRate: true, feedback: true },
        { runBGContext: ctx ?? null, feedback: fb },
      ));
    }
  }

  // 2b. Cross-category feedback not shown inline above
  if (feedbackByActivity && feedbackByActivity.size > 0) {
    const remaining = [...feedbackByActivity.entries()]
      .filter(([id]) => !shownFeedbackIds.has(id));
    if (remaining.length > 0) {
      lines.push("");
      lines.push("## Other recent run feedback");
      for (const [, fb] of remaining) {
        const date = new Date(fb.createdAt).toISOString().split("T")[0];
        const parts = [date];
        if (fb.rating) parts.push(fb.rating);
        if (fb.carbsG != null) parts.push(`${fb.carbsG}g carbs`);
        if (fb.comment) parts.push(`"${fb.comment}"`);
        lines.push(`- ${parts.join(", ")}`);
      }
    }
  }

  // 3. BG patterns for category
  const cat = adapted.category;
  if (cat === "easy" || cat === "long" || cat === "interval") {
    const catData = bgModel.categories[cat];
    const target = bgModel.targetFuelRates.find((t) => t.category === cat);
    const hasAvgFuel = catData && catData.avgFuelRate != null;
    if (hasAvgFuel || target) {
      lines.push("");
      lines.push(`## BG patterns (${cat})`);
      if (hasAvgFuel) {
        lines.push(`Avg fuel rate used: ${Math.round(catData!.avgFuelRate!)} g/h across ${catData!.activityCount} runs`);
      }
      if (target) {
        lines.push(
          `Target fuel: ${Math.round(target.targetFuelRate)} g/h (${target.method}, ${target.confidence} confidence)`,
        );
      }
    }
  }

  // 4. Fitness — only include when actionable (fatigued or overreaching)
  const workoutDate = new Date(adapted.date + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysOut = Math.round((workoutDate.getTime() - today.getTime()) / 86400000);
  const fatigued = daysOut <= 1 && insights.currentTsb < -15;
  const overreaching = insights.rampRate > 7; // CTL/week — above 7 risks overreaching
  if (fatigued || overreaching) {
    lines.push("");
    lines.push("## Fitness");
    if (fatigued) {
      lines.push(`Freshness (TSB): ${insights.currentTsb} — runner is fatigued`);
    }
    if (overreaching) {
      lines.push(`Weekly ramp: ${insights.rampRate}/week — high ramp rate`);
    }
  }

  // 5. Recovery patterns for category
  if (cat === "easy" || cat === "long" || cat === "interval") {
    const categoryContexts = Object.values(runBGContexts).filter(
      (ctx): ctx is RunBGContext & { post: NonNullable<RunBGContext["post"]> } =>
        ctx.category === cat && ctx.post != null,
    );
    if (categoryContexts.length > 0) {
      const nadirs = categoryContexts.map((c) => c.post.nadirPostRun);
      const hypoCount = categoryContexts.filter(
        (c) => c.post.postRunHypo,
      ).length;
      const avgNadir =
        nadirs.reduce((a, b) => a + b, 0) / nadirs.length;

      lines.push("");
      lines.push(`## Post-run BG patterns (${cat})`);
      lines.push(`Avg lowest BG after run: ${avgNadir.toFixed(1)} mmol/L`);
      lines.push(
        `Went hypo after: ${hypoCount} of ${categoryContexts.length} runs`,
      );
    }
  }

  if (crossRunPatterns) {
    lines.push("");
    lines.push("## Cross-Run BG Patterns");
    lines.push(crossRunPatterns);
  }

  lines.push("");
  lines.push("Write the pre-workout note.");

  return { system, user: lines.join("\n") };
}
