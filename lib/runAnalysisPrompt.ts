import type { CalendarEvent } from "./types";
import type { RunBGContext } from "./runBGContext";
import type { ReportCard } from "./reportCard";
import type { RunSummary } from "./runAnalysisDb";
import { formatPace, formatDuration } from "./format";

function ratingLabel(rating: "good" | "ok" | "bad"): string {
  return rating === "good" ? "Good" : rating === "ok" ? "OK" : "Bad";
}

export function buildRunAnalysisPrompt(params: {
  event: CalendarEvent;
  runBGContext?: RunBGContext | null;
  reportCard?: ReportCard | null;
  history?: RunSummary[];
}): { system: string; user: string } {
  const { event, runBGContext, reportCard, history } = params;

  const system = `You are an expert running coach analyzing a completed run for a Type 1 Diabetic runner.

Runner profile:
- Type 1 Diabetic, insulin pump OFF for all runs (zero insulin delivery)
- LTHR: 169 bpm, Max HR: 187 bpm
- Target start BG: ~10 mmol/L

CRITICAL T1D physiology:
- Pump OFF = zero insulin. Only muscle glucose uptake lowers BG during exercise.
- Higher intensity = more glucose uptake = faster BG drop.
- Carbs are the ONLY tool to slow/reverse BG drops. More carbs = slower drop.
- NEVER suggest reducing carbs to prevent BG dropping. That is backwards and dangerous.
- Hypo (<3.9 mmol/L) is the primary safety risk.
- Starting below 9 is a risk factor. Below 8 is a serious concern.
- A gentle decline (e.g. -0.5/10min) staying above 5.0 is a GOOD outcome.

Data integrity:
- Only reference data explicitly provided in the run data below.
- If a data section is missing, skip it entirely.
- Never estimate, assume, or infer missing values.
- Never fabricate numbers or percentages.

Pace zones:
- Easy: 7:00-7:30/km (Z2, 112-132 bpm)
- Race Pace: 5:35-5:45/km (Z3, 132-150 bpm)
- Interval: 5:05-5:20/km (Z4, 150-167 bpm)
- Hard: <5:00/km (Z5, 167-188 bpm)

Category expectations:
- "easy"/"long" → Z2 entire time. Avg HR >132 = too hard.
- "interval" → main set Z4, warmup/cooldown Z2.
- "race" → race pace blocks Z3, easy Z2.
If avg HR doesn't match category, call it out.

Output format (bullet points only, max 150 words):

**Alerts** (only if applicable — omit section entirely if none):
- Hypo events, post-run crashes, dangerously low start BG (<8), fast BG drops

**Key Metrics**:
- BG trajectory, HR zone compliance, fuel adherence — connect HR to BG behavior

**Next Time**:
- Concrete adjustments with specific numbers (pace, fuel rate, start BG target)

Use mmol/L, km, /km. Second person ("You..."). No filler, no generic praise.`;

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

  // Rolling run history
  if (history && history.length > 0) {
    lines.push("");
    lines.push("## Recent Run History (newest first)");
    lines.push("Use this to identify patterns across runs (e.g. consistently too hard, always dropping fast, fuel trends).");
    lines.push("");
    lines.push("| Category | Start BG | End BG | Drop/10m | Avg HR | Fuel g/h |");
    lines.push("|----------|----------|--------|----------|--------|----------|");
    for (const r of history) {
      const endBG = r.endBG != null ? r.endBG.toFixed(1) : "-";
      const drop = r.dropRate != null ? r.dropRate.toFixed(2) : "-";
      const hr = r.avgHR != null ? String(r.avgHR) : "-";
      const fuel = r.fuelRate != null ? String(Math.round(r.fuelRate)) : "-";
      lines.push(`| ${r.category} | ${r.startBG.toFixed(1)} | ${endBG} | ${drop} | ${hr} | ${fuel} |`);
    }
  }

  lines.push("");
  lines.push("Analyze this run.");

  return { system, user: lines.join("\n") };
}
