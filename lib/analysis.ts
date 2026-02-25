import { addDays, format } from "date-fns";
import type { AnalysisResult, IntervalsActivity, IntervalsEvent } from "./types";
import { API_BASE } from "./constants";
import { convertGlucoseToMmol } from "./bgModel";
import { getWorkoutCategory } from "./constants";
import { extractFuelRate } from "./descriptionParser";
import { fetchStreams, authHeader } from "./intervalsApi";
import { extractRawStreams } from "./streams";

async function analyzeRun(
  run: IntervalsActivity,
  apiKey: string,
  matchedEvent?: IntervalsEvent,
): Promise<{
  trend: number;
  currentFuel: number;
  plotData: { time: number; glucose: number }[];
}> {
  const streams = await fetchStreams(run.id, apiKey);
  const { time: tData, glucose: gData } = extractRawStreams(streams);

  let plotData: { time: number; glucose: number }[] = [];
  let trend = 0.0;
  let currentFuel = 60;

  // Priority: carbs_ingested (actual) → carbs_per_hour (planned rate) → description regex
  // All values in g/h
  if (run.carbs_ingested != null && run.moving_time && run.moving_time > 0) {
    currentFuel = Math.round(run.carbs_ingested / (run.moving_time / 3600));
  } else if (matchedEvent?.carbs_per_hour != null) {
    currentFuel = matchedEvent.carbs_per_hour;
  } else {
    const descFuel = extractFuelRate(run.description || "");
    if (descFuel != null) currentFuel = descFuel;
  }

  if (gData.length > 0 && tData.length > 1) {
    const glucoseInMmol = convertGlucoseToMmol(gData);

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
  const auth = authHeader(apiKey);
  const today = new Date();
  const startDate = addDays(today, -45);
  const oldest = format(startDate, "yyyy-MM-dd");
  const newest = format(today, "yyyy-MM-dd");

  try {
    const [activitiesRes, eventsRes] = await Promise.all([
      fetch(
        `${API_BASE}/athlete/0/activities?oldest=${oldest}&newest=${newest}`,
        { headers: { Authorization: auth } },
      ),
      fetch(
        `${API_BASE}/athlete/0/events?oldest=${oldest}&newest=${newest}`,
        { headers: { Authorization: auth } },
      ),
    ]);
    if (!activitiesRes.ok) throw new Error("Failed to fetch activities");
    const activities: IntervalsActivity[] = await activitiesRes.json();
    const events: IntervalsEvent[] = eventsRes.ok ? await eventsRes.json() : [];

    // Build a map of paired_activity_id -> event for quick lookup
    const eventByActivity = new Map<string, IntervalsEvent>();
    for (const ev of events) {
      if (ev.paired_activity_id) {
        eventByActivity.set(ev.paired_activity_id, ev);
      }
    }

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
      result.longRun = await analyzeRun(mostRecentLong, apiKey, eventByActivity.get(mostRecentLong.id));
    }

    if (mostRecentEasy) {
      result.easyRun = await analyzeRun(mostRecentEasy, apiKey, eventByActivity.get(mostRecentEasy.id));
    }

    if (mostRecentInterval) {
      result.interval = await analyzeRun(mostRecentInterval, apiKey, eventByActivity.get(mostRecentInterval.id));
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
