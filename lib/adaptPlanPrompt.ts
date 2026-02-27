import type { CalendarEvent } from "./types";
import type { BGResponseModel } from "./bgModel";
import type { FitnessInsights } from "./fitness";
import type { RunBGContext } from "./runBGContext";
import type { AdaptedEvent } from "./adaptPlan";
import type { RunFeedbackRecord } from "./feedbackDb";
import { formatRunLine } from "./runLine";

interface PromptInput {
  adapted: AdaptedEvent;
  recentSameCategory: CalendarEvent[];
  bgModel: BGResponseModel;
  insights: FitnessInsights;
  runBGContexts: Record<string, RunBGContext>;
  lthr: number;
  feedbackByActivity?: Map<string, RunFeedbackRecord>;
}

/**
 * Build system + user prompts for AI-generated workout notes.
 */
export function buildAdaptNotePrompt(input: PromptInput): {
  system: string;
  user: string;
} {
  const { adapted, recentSameCategory, bgModel, insights, runBGContexts, lthr, feedbackByActivity } =
    input;

  const system = `You are Coach — writing pre-workout notes for an experienced T1D runner (pump OFF, LTHR ${lthr}). Write in first person ("I've bumped your fuel…"). Never say "BG model", "the system", or "the data."

Format: two short paragraphs separated by a blank line.
1. **Running** — what the session is, pacing/effort cues from recent data. 2–3 short sentences.
2. **Fuel & BG** — fuel rate, why, any BG-specific heads-up. 1–2 short sentences.

Keep sentences short and punchy. No run-on sentences. No filler.

Rules:
- First: what's the session about? Pacing cues, effort targets, what it's training (e.g. "long intervals at tempo to build lactate tolerance — aim for 5:10–5:20/km based on recent paces"). Reference recent performance where relevant.
- Then: fuel and BG. State the rate, cite specific runs if it was adjusted ("dropped from 9.2 to 4.1 on Feb 18 → bumped to **64g/h**"). If unchanged, one line is enough.
- Skip generic advice the runner already knows ("run easy", "stay under LTHR", "aerobic maintenance", "keep effort relaxed", "let pace float"). For easy runs, one sentence on the running side is enough — focus on what's specific to *this* session.
- LTHR is the **absolute ceiling**, not a target. Long intervals are tempo (zone 3–4), typically 10–20 bpm below LTHR. Never tell the runner to "keep HR under LTHR" for intervals — give a specific target range based on the workout type and recent HR data.
- Cite specific BG values, dates, paces, and HR from the data. These make the note useful.
- Never echo model internals: no sample counts, no window counts, no fitness/load numbers, no drop rates as raw stats.
- Fuel adjustments go both ways: increase if BG drops too fast during a run, decrease if BG stays high during a run. NEVER frame a fuel decrease as a response to a BG crash — that's backwards. If recent feedback reports a crash, the note should either justify increasing fuel or explain why the current rate is being held despite the crash (e.g. different category, different conditions).
- CRITICAL: distinguish during-run BG from post-run BG. "end BG" is BG when the run stopped. "lowest in 2h after run" is the nadir during recovery (pump reconnected, sitting down). A post-run crash is a recovery/pump issue, NOT a mid-run fueling issue. Never cite a post-run nadir as evidence for changing mid-run fuel rate. Only cite "start BG" and "end BG" for fueling decisions.
- Use mmol/L, g/h, and min/km. Use **bold** sparingly. No headers, no bullets, no lists.
- If a recent run has a "bad" rating or mentions a hypo in its feedback, connect it to what's different this time.
- If the workout was swapped to easy, explain why.
- Only state distances and durations that appear in the data below. Never guess or infer distances from workout names.`;

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
        { date: true, pace: true, distance: true, avgHr: true, fuelRate: true },
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
    if (catData) {
      lines.push("");
      lines.push(`## BG patterns (${cat})`);
      lines.push(`Avg BG drop: ${catData.avgRate.toFixed(2)} mmol/L per 10min`);
      if (catData.avgFuelRate != null) {
        lines.push(`Avg fuel rate: ${Math.round(catData.avgFuelRate)} g/h`);
      }
      lines.push(`Samples: ${catData.sampleCount} windows across ${catData.activityCount} runs`);
    }

    const target = bgModel.targetFuelRates.find((t) => t.category === cat);
    if (target) {
      lines.push(
        `Target fuel: ${Math.round(target.targetFuelRate)} g/h (${target.method}, ${target.confidence} confidence)`,
      );
    }
  }

  // 4. Fitness
  lines.push("");
  lines.push("## Fitness");
  lines.push(`Fitness load: ${insights.currentCtl}, recent load: ${insights.currentAtl}, freshness: ${insights.currentTsb}`);
  lines.push(`Current form: ${insights.formZoneLabel}`);
  lines.push(`Weekly ramp: ${insights.rampRate}/week`);

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

  lines.push("");
  lines.push("Write the pre-workout note.");

  return { system, user: lines.join("\n") };
}
