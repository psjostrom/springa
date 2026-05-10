import { describe, it, expect } from "vitest";
import { rankPredictors, type RunForRanking } from "../predictorImportance";

const synthHistory = (count = 50): RunForRanking[] => {
  const runs: RunForRanking[] = [];
  for (let i = 0; i < count; i++) {
    const startBG = 6 + (i % 10);
    runs.push({
      startBG,
      entrySlope: 0,
      fuelRate: 60,
      hourOfDay: 7,
      endBG: startBG - 2,
      wentHypo: startBG < 7,
    });
  }
  return runs;
};

describe("rankPredictors", () => {
  it("ranks startBG #1 when it perfectly predicts endBG", () => {
    const ranked = rankPredictors(synthHistory());
    expect(ranked[0].predictor).toBe("startBG");
    expect(Math.abs(ranked[0].correlationToEndBG)).toBeGreaterThan(0.95);
  });

  it("flags low sample count predictors", () => {
    const tiny = synthHistory(3);
    const ranked = rankPredictors(tiny);
    for (const p of ranked) expect(p.sampleCount).toBe(3);
  });

  it("returns 0 correlation for predictors with no variance", () => {
    const flat = synthHistory().map((r) => ({ ...r, fuelRate: 60 }));
    const ranked = rankPredictors(flat);
    const fuel = ranked.find((p) => p.predictor === "fuelRate");
    expect(fuel?.correlationToEndBG).toBe(0);
  });

  it("excludes runs where the predictor is null from sampleCount", () => {
    const partial: RunForRanking[] = [
      { startBG: 8, entrySlope: 0.1,  fuelRate: 60, hourOfDay: 7, endBG: 5, wentHypo: false },
      { startBG: 9, entrySlope: null, fuelRate: 60, hourOfDay: 7, endBG: 6, wentHypo: false },
    ];
    const entrySlopeScore = rankPredictors(partial).find((p) => p.predictor === "entrySlope");
    expect(entrySlopeScore?.sampleCount).toBe(1);
  });

  it("returns all 4 predictors", () => {
    const ranked = rankPredictors(synthHistory());
    const names = ranked.map((p) => p.predictor).sort();
    expect(names).toEqual(["entrySlope", "fuelRate", "startBG", "timeOfDay"]);
  });
});
