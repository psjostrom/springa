export interface RunForRanking {
  startBG: number;
  entrySlope: number | null;
  fuelRate: number | null;
  hourOfDay: number;
  endBG: number;
  wentHypo: boolean;
}

export type PredictorName = "startBG" | "entrySlope" | "fuelRate" | "timeOfDay";

export interface PredictorScore {
  predictor: PredictorName;
  correlationToEndBG: number;
  correlationToHypo: number;
  sampleCount: number;
}

function pearson(xs: number[], ys: number[]): number {
  if (xs.length < 2) return 0;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const xi = xs[i] - mx;
    const yi = ys[i] - my;
    num += xi * yi;
    dx += xi * xi;
    dy += yi * yi;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? 0 : Math.abs(num / denom);
}

interface Candidate {
  name: PredictorName;
  pick: (r: RunForRanking) => number | null;
}

const CANDIDATES: Candidate[] = [
  { name: "startBG",    pick: (r) => r.startBG },
  { name: "entrySlope", pick: (r) => r.entrySlope },
  { name: "fuelRate",   pick: (r) => r.fuelRate },
  { name: "timeOfDay",  pick: (r) => r.hourOfDay },
];

export function rankPredictors(history: RunForRanking[]): PredictorScore[] {
  return CANDIDATES
    .map(({ name, pick }) => {
      const xs: number[] = [];
      const ys: number[] = [];
      const hypoBits: number[] = [];
      for (const r of history) {
        const v = pick(r);
        if (v == null) continue;
        xs.push(v);
        ys.push(r.endBG);
        hypoBits.push(r.wentHypo ? 1 : 0);
      }
      return {
        predictor: name,
        correlationToEndBG: pearson(xs, ys),
        correlationToHypo: pearson(xs, hypoBits),
        sampleCount: xs.length,
      };
    })
    .sort((a, b) => b.correlationToHypo - a.correlationToHypo);
}
