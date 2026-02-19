// --- Types ---

export interface XdripReading {
  sgv: number; // mg/dL (raw from Nightscout)
  mmol: number; // converted to mmol/L
  ts: number; // timestamp ms
  direction: string; // Nightscout trend string
}

// --- Nightscout direction → arrow ---

const DIRECTION_ARROWS: Record<string, string> = {
  DoubleUp: "⇈",
  SingleUp: "↑",
  FortyFiveUp: "↗",
  Flat: "→",
  FortyFiveDown: "↘",
  SingleDown: "↓",
  DoubleDown: "⇊",
  "NOT COMPUTABLE": "?",
  "RATE OUT OF RANGE": "⚠",
};

export function trendArrow(direction: string): string {
  return DIRECTION_ARROWS[direction] ?? "?";
}

// --- Parse Nightscout entries ---

function isValidEntry(
  e: unknown,
): e is { sgv: number; date?: number; dateString?: string; direction?: string } {
  if (typeof e !== "object" || e === null) return false;
  const obj = e as Record<string, unknown>;
  return typeof obj.sgv === "number" && obj.sgv > 0;
}

export function parseNightscoutEntries(body: unknown): XdripReading[] {
  const arr = Array.isArray(body) ? body : [body];
  const readings: XdripReading[] = [];

  for (const entry of arr) {
    if (!isValidEntry(entry)) continue;

    const ts =
      typeof entry.date === "number"
        ? entry.date
        : typeof entry.dateString === "string"
          ? new Date(entry.dateString).getTime()
          : Date.now();

    readings.push({
      sgv: entry.sgv,
      mmol: Math.round((entry.sgv / 18.018) * 10) / 10,
      ts,
      direction: entry.direction ?? "NONE",
    });
  }

  return readings;
}

// --- Trend computation from stored readings ---

export function computeTrend(
  readings: XdripReading[],
): { slope: number; direction: string } | null {
  if (readings.length < 2) return null;

  // Use last 30 minutes of readings
  const now = readings[readings.length - 1].ts;
  const cutoff = now - 30 * 60 * 1000;
  const recent = readings.filter((r) => r.ts >= cutoff);

  if (recent.length < 2) return null;

  // Linear regression: time (minutes) vs mmol/L
  const first = recent[0];
  const points = recent.map((r) => ({
    x: (r.ts - first.ts) / 60000, // minutes
    y: r.mmol,
  }));

  const n = points.length;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumXX = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  }

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;

  // slope is mmol/L per minute, convert to per 10 minutes
  const slopePerMin = (n * sumXY - sumX * sumY) / denom;
  const slopePer10 = Math.round(slopePerMin * 10 * 100) / 100;

  // Classify
  let direction: string;
  if (slopePer10 <= -2.0) direction = "DoubleDown";
  else if (slopePer10 <= -1.0) direction = "SingleDown";
  else if (slopePer10 <= -0.5) direction = "FortyFiveDown";
  else if (slopePer10 < 0.5) direction = "Flat";
  else if (slopePer10 < 1.0) direction = "FortyFiveUp";
  else if (slopePer10 < 2.0) direction = "SingleUp";
  else direction = "DoubleUp";

  return { slope: slopePer10, direction };
}
