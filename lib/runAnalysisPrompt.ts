import type { CalendarEvent } from "./types";
import type { RunBGContext } from "./runBGContext";
import type { ReportCard } from "./reportCard";

function formatPace(minPerKm: number): string {
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function ratingLabel(rating: "good" | "ok" | "bad"): string {
  return rating === "good" ? "Good" : rating === "ok" ? "OK" : "Bad";
}

export function buildRunAnalysisPrompt(params: {
  event: CalendarEvent;
  runBGContext?: RunBGContext | null;
  reportCard?: ReportCard | null;
}): { system: string; user: string } {
  const { event, runBGContext, reportCard } = params;

  const system = `You are an expert running coach for a Type 1 Diabetic runner. Analyze this completed run and provide actionable insights.

Runner profile:
- Type 1 Diabetic, insulin pump disconnected for ALL runs (pump-off)
- LTHR: 169 bpm, Max HR: 187 bpm
- Target start BG: ~10 mmol/L

Pace zones:
- Easy: 7:00-7:30/km (Z2, 112-132 bpm)
- Race Pace: 5:35-5:45/km (Z3, 132-150 bpm)
- Interval: 5:05-5:20/km (Z4, 150-167 bpm)
- Hard: <5:00/km (Z5, 167-188 bpm)

Workout categories and expected zones:
- "easy" or "long" → should be in Z2 the entire time. Avg HR above 132 means too hard.
- "interval" → main set in Z4, warmup/cooldown in Z2.
- "race" → race pace blocks in Z3, easy sections in Z2.
If avg HR doesn't match the category, that's a key finding — call it out.

CRITICAL — T1D exercise physiology (you MUST understand this):
- The insulin pump is OFF during runs. There is ZERO insulin delivery.
- Without insulin, the ONLY factor lowering BG during exercise is muscle glucose uptake from the exercise itself.
- Higher intensity (higher HR zone) = MORE glucose uptake = FASTER BG drop. Connect HR data to BG behavior.
- Carbs eaten during the run are the ONLY tool to COUNTERACT BG dropping. Carbs RAISE BG / slow the drop.
- Therefore: if BG drops too fast → the runner needs MORE carbs, not fewer.
- NEVER suggest "reducing carbs" to prevent BG from dropping. That is backwards and dangerous. Less carbs = faster BG drop.
- Hypo (<3.9 mmol/L) is the primary safety risk. The fueling strategy exists to prevent it.
- A gentle, steady BG decline (e.g. -0.5 mmol/L per 10min) that stays above 5.0 is a GOOD outcome.
- Starting at 10 and ending at 6-7 after a 30-40 min run is typical and fine.
- Starting below 9 is a risk factor — flag it clearly. Below 8 is a serious concern.

Fuel guidance:
- Fuel rate is measured in grams of carbs per 10 minutes.
- If BG dropped too fast, suggest increasing fuel by a specific amount (e.g. "+2g per 10min").
- If BG was stable or rose, current fueling is working — say so briefly and move on.

Instructions:
- Write 3-5 short, dense paragraphs in second person ("You started with...")
- First paragraph: what happened (BG trajectory, pacing, HR — connect them)
- Second paragraph: what went well (be specific, not generic)
- Third paragraph: what to change next time with concrete numbers (pace, fuel rate, start BG)
- No filler. Every sentence must contain data or a specific recommendation.
- Keep it under 200 words total
- Use mmol/L, km, /km for units
- Default to English
- Never invent data not provided`;

  // Build structured user prompt
  const lines: string[] = [];

  // Basic run info
  lines.push("## Run Data");
  lines.push(`Name: ${event.name}`);
  lines.push(`Date: ${event.date.toISOString().split("T")[0]}`);
  lines.push(`Category: ${event.category}`);
  if (event.distance) lines.push(`Distance: ${(event.distance / 1000).toFixed(2)} km`);
  if (event.duration) lines.push(`Duration: ${formatDuration(event.duration)}`);
  if (event.pace) lines.push(`Pace: ${formatPace(event.pace)} /km`);
  if (event.avgHr) lines.push(`Avg HR: ${event.avgHr} bpm`);
  if (event.maxHr) lines.push(`Max HR: ${event.maxHr} bpm`);
  if (event.load) lines.push(`Load: ${Math.round(event.load)}`);

  // BG data from report card
  if (reportCard?.bg) {
    const bg = reportCard.bg;
    lines.push("");
    lines.push("## Blood Glucose (in-run)");
    lines.push(`Start BG: ${bg.startBG.toFixed(1)} mmol/L`);
    lines.push(`Min BG: ${bg.minBG.toFixed(1)} mmol/L`);
    lines.push(`Drop rate: ${bg.dropRate.toFixed(2)} mmol/L per 10min`);
    lines.push(`Hypo during run: ${bg.hypo ? "YES" : "No"}`);
    lines.push(`Rating: ${ratingLabel(bg.rating)}`);
  }

  // Pre-run context
  if (reportCard?.entryTrend) {
    const et = reportCard.entryTrend;
    lines.push("");
    lines.push("## Pre-Run BG");
    lines.push(`Entry slope: ${et.slope30m.toFixed(2)} mmol/L per 10min`);
    lines.push(`Stability: ${et.stability.toFixed(2)} std dev`);
    lines.push(`Label: ${et.label}`);
    lines.push(`Rating: ${ratingLabel(et.rating)}`);
  }
  if (runBGContext?.pre) {
    lines.push(`Start BG (xDrip): ${runBGContext.pre.startBG.toFixed(1)} mmol/L`);
  }

  // Post-run context
  if (reportCard?.recovery) {
    const rec = reportCard.recovery;
    lines.push("");
    lines.push("## Post-Run Recovery");
    lines.push(`30m recovery drop: ${rec.drop30m.toFixed(1)} mmol/L`);
    lines.push(`Nadir (lowest in 2h): ${rec.nadir.toFixed(1)} mmol/L`);
    lines.push(`Post-run hypo: ${rec.postHypo ? "YES" : "No"}`);
    lines.push(`Label: ${rec.label}`);
    lines.push(`Rating: ${ratingLabel(rec.rating)}`);
  }
  if (runBGContext?.post?.timeToStable != null) {
    lines.push(`Time to stable BG: ${runBGContext.post.timeToStable} min`);
  }
  if (runBGContext?.totalBGImpact != null) {
    lines.push(`Total BG impact (start to 2h post): ${runBGContext.totalBGImpact.toFixed(1)} mmol/L`);
  }

  // Fuel
  if (reportCard?.fuel) {
    const f = reportCard.fuel;
    lines.push("");
    lines.push("## Fuel");
    lines.push(`Planned: ${f.planned}g`);
    lines.push(`Actual: ${f.actual}g`);
    lines.push(`Adherence: ${Math.round(f.pct)}%`);
    lines.push(`Rating: ${ratingLabel(f.rating)}`);
  }

  // HR zone compliance
  if (reportCard?.hrZone) {
    const hr = reportCard.hrZone;
    lines.push("");
    lines.push("## HR Zone Compliance");
    lines.push(`Target zone: ${hr.targetZone}`);
    lines.push(`% in target: ${Math.round(hr.pctInTarget)}%`);
    lines.push(`Rating: ${ratingLabel(hr.rating)}`);
  }

  // Glucose curve summary from stream data
  if (event.streamData?.glucose && event.streamData.glucose.length >= 2) {
    const g = event.streamData.glucose;
    const startVal = g[0].value;
    const endVal = g[g.length - 1].value;
    const minVal = Math.min(...g.map((p) => p.value));
    const maxVal = Math.max(...g.map((p) => p.value));
    lines.push("");
    lines.push("## Glucose Curve");
    lines.push(`Start: ${startVal.toFixed(1)}, Min: ${minVal.toFixed(1)}, Max: ${maxVal.toFixed(1)}, End: ${endVal.toFixed(1)} mmol/L`);
    lines.push(`Points: ${g.length}`);
  }

  lines.push("");
  lines.push("Analyze this run.");

  return { system, user: lines.join("\n") };
}
