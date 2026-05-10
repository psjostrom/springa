import type { MatchableRun } from "./matchingRuns";

export interface MatchableRunWithPost extends MatchableRun {
  peak60mAboveEnd: number;     // from RunBGContext.post (Task 8)
  postRunHypo: boolean;        // from RunBGContext.post
}

export interface PredictedOutcome {
  during: {
    medianEndBG: number;
    p10EndBG: number;
    p90EndBG: number;
    hypoCount: number;
    matchCount: number;
    confidence: "low" | "medium" | "high";
  };
  after: {
    medianRebound: number;
    p10Rebound: number;
    p90Rebound: number;
    medianPeakBG: number;
    p10PeakBG: number;
    p90PeakBG: number;
    lateHypoCount: number;
    bigReboundCount: number;     // matches with peak60mAboveEnd > 2.0
    matchCount: number;
  };
}

function quantile(arr: number[], q: number): number {
  const s = [...arr].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = lo + 1;
  if (hi >= s.length) return s[lo];
  return s[lo] + (pos - lo) * (s[hi] - s[lo]);
}

export function predictRunOutcome(matches: MatchableRunWithPost[]): PredictedOutcome | null {
  if (matches.length === 0) return null;

  const ends = matches.map((m) => m.endBG);
  const peaks = matches.map((m) => m.peak60mAboveEnd);
  const peakBGs = matches.map((m) => m.endBG + m.peak60mAboveEnd);

  const confidence: "low" | "medium" | "high" =
    matches.length < 4 ? "low" : matches.length < 10 ? "medium" : "high";

  return {
    during: {
      medianEndBG: quantile(ends, 0.5),
      p10EndBG:    quantile(ends, 0.1),
      p90EndBG:    quantile(ends, 0.9),
      hypoCount:   matches.filter((m) => m.wentHypo).length,
      matchCount:  matches.length,
      confidence,
    },
    after: {
      medianRebound:   quantile(peaks, 0.5),
      p10Rebound:      quantile(peaks, 0.1),
      p90Rebound:      quantile(peaks, 0.9),
      medianPeakBG:    quantile(peakBGs, 0.5),
      p10PeakBG:       quantile(peakBGs, 0.1),
      p90PeakBG:       quantile(peakBGs, 0.9),
      lateHypoCount:   matches.filter((m) => m.postRunHypo).length,
      bigReboundCount: matches.filter((m) => m.peak60mAboveEnd > 2.0).length,
      matchCount:      matches.length,
    },
  };
}
