import { addDays, format } from "date-fns";
import type { AnalysisResult, IntervalsActivity } from "./types";
import { API_BASE } from "./constants";
import { convertGlucoseToMmol, getWorkoutCategory } from "./utils";
import { fetchStreams } from "./intervalsApi";

async function analyzeRun(
  run: IntervalsActivity,
  apiKey: string,
): Promise<{
  trend: number;
  currentFuel: number;
  plotData: { time: number; glucose: number }[];
}> {
  const streams = await fetchStreams(run.id, apiKey);
  let tData: number[] = [];
  let gData: number[] = [];
  let glucoseStreamType: string = "";

  for (const s of streams) {
    if (s.type === "time") tData = s.data;
    if (["bloodglucose", "glucose", "ga_smooth"].includes(s.type)) {
      gData = s.data;
      glucoseStreamType = s.type;
    }
  }

  let plotData: { time: number; glucose: number }[] = [];
  let trend = 0.0;
  let currentFuel = 10;

  const match = run.description?.match(/FUEL PER 10:\s*(\d+)g/i);
  if (match) currentFuel = parseInt(match[1]);

  if (gData.length > 0 && tData.length > 1) {
    const glucoseInMmol = convertGlucoseToMmol(gData, glucoseStreamType);

    plotData = tData.map((t, idx) => ({
      time: Math.round(t / 60),
      glucose: glucoseInMmol[idx],
    }));

    const delta = glucoseInMmol[glucoseInMmol.length - 1] - glucoseInMmol[0];
    const durationHr = (tData[tData.length - 1] - tData[0]) / 3600;
    if (durationHr > 0.2) {
      trend = delta / durationHr;
    }
  }

  return { trend, currentFuel, plotData };
}

export async function analyzeHistory(
  apiKey: string,
  prefix: string,
): Promise<AnalysisResult> {
  const auth = "Basic " + btoa("API_KEY:" + apiKey);
  const today = new Date();
  const startDate = addDays(today, -45);
  const oldest = format(startDate, "yyyy-MM-dd");
  const newest = format(today, "yyyy-MM-dd");

  try {
    const res = await fetch(
      `${API_BASE}/athlete/0/activities?oldest=${oldest}&newest=${newest}`,
      { headers: { Authorization: auth } },
    );
    if (!res.ok) throw new Error("Failed to fetch activities");
    const activities: IntervalsActivity[] = await res.json();

    const relevant = activities.filter((a) =>
      a.name.toLowerCase().includes(prefix.toLowerCase()),
    );

    if (relevant.length === 0) {
      return {
        longRun: null,
        easyRun: null,
        interval: null,
        msg: "No activities found",
      };
    }

    relevant.sort(
      (a, b) =>
        new Date(b.start_date).getTime() - new Date(a.start_date).getTime(),
    );

    const mostRecentLong = relevant.find(
      (a) => getWorkoutCategory(a.name) === "long",
    );
    const mostRecentEasy = relevant.find(
      (a) => getWorkoutCategory(a.name) === "easy",
    );
    const mostRecentInterval = relevant.find(
      (a) => getWorkoutCategory(a.name) === "interval",
    );

    const result: AnalysisResult = {
      longRun: null,
      easyRun: null,
      interval: null,
    };

    if (mostRecentLong) {
      result.longRun = await analyzeRun(mostRecentLong, apiKey);
    }

    if (mostRecentEasy) {
      result.easyRun = await analyzeRun(mostRecentEasy, apiKey);
    }

    if (mostRecentInterval) {
      result.interval = await analyzeRun(mostRecentInterval, apiKey);
    }

    return result;
  } catch (error) {
    console.error("Analysis failed", error);
    return {
      easyRun: null,
      longRun: null,
      interval: null,
      msg: "Analysis failed",
    };
  }
}
