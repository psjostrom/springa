import type { RunForRanking, PredictorName } from "./predictorImportance";
import { rankPredictors } from "./predictorImportance";

export interface MatchTarget {
  category: "easy" | "long" | "interval";
  startBG: number;
  fuelRate: number | null;
  hourOfDay: number;
  recentLoad: number;
  entrySlope?: number | null;
}

export interface MatchableRun extends RunForRanking {
  activityId: string;
  date: string;
  category: "easy" | "long" | "interval";
}

export interface MatchResult {
  matches: MatchableRun[];
  usedPredictors: PredictorName[];
  relaxed: boolean;
}

const SOFT_WINDOWS: Record<PredictorName, number> = {
  startBG: 2.0,
  entrySlope: 0.05,
  fuelRate: 10,
  timeOfDay: 3,
  recentLoad: 30,
};

function inWindow(predictor: PredictorName, target: MatchTarget, run: MatchableRun): boolean {
  const window = SOFT_WINDOWS[predictor];
  switch (predictor) {
    case "startBG":
      return Math.abs(run.startBG - target.startBG) <= window;
    case "entrySlope":
      if (run.entrySlope == null || target.entrySlope == null) return true;
      return Math.abs(run.entrySlope - target.entrySlope) <= window;
    case "fuelRate":
      if (run.fuelRate == null || target.fuelRate == null) return true;
      return Math.abs(run.fuelRate - target.fuelRate) <= window;
    case "timeOfDay":
      return Math.abs(run.hourOfDay - target.hourOfDay) <= window;
    case "recentLoad":
      return Math.abs(run.recentLoad - target.recentLoad) <= window;
  }
}

export function findMatchingRuns(target: MatchTarget, history: MatchableRun[]): MatchResult {
  const sameCategory = history.filter((r) => r.category === target.category);
  if (sameCategory.length === 0) {
    return { matches: [], usedPredictors: [], relaxed: false };
  }

  const ranked = rankPredictors(sameCategory)
    .filter((p) => p.sampleCount >= 10)
    .slice(0, 3);
  let usedPredictors: PredictorName[] = ranked.map((p) => p.predictor);
  const startedWithPredictors = usedPredictors.length > 0;

  const sorted = [...sameCategory].sort((a, b) => (a.date < b.date ? 1 : -1));

  while (usedPredictors.length > 0) {
    const passing = sorted.filter((r) =>
      usedPredictors.every((p) => inWindow(p, target, r)),
    );
    if (passing.length >= 4) {
      const relaxed = usedPredictors.length < ranked.length;
      return { matches: passing.slice(0, 10), usedPredictors, relaxed };
    }
    usedPredictors = usedPredictors.slice(0, -1);
  }

  // No soft filters left — return all category matches, up to 10 most recent
  // If we started with predictors and dropped them all, this is relaxed
  return { matches: sorted.slice(0, 10), usedPredictors: [], relaxed: startedWithPredictors };
}
