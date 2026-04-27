/**
 * Demo snapshot script — captures real data and writes scrambled fixtures.
 *
 * Usage: npm run demo:snapshot -- <email>
 *
 * Reads credentials from the Turso DB (same as the app does).
 * Requires TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, and CREDENTIALS_ENCRYPTION_KEY
 * in .env.local (loaded via --env-file flag in the npm script).
 */

import * as fs from "fs";
import * as path from "path";
import { getUserCredentials } from "../lib/credentials";
import { getUserSettings } from "../lib/settings";
import { fetchPaceCurves as fetchPaceCurvesApi, fetchCalendarData } from "../lib/intervalsApi";
import { fetchBGFromNS } from "../lib/nightscout";
import { computeTrend, trendArrow, slopeToArrow } from "../lib/cgm";
import { computeMaxHRZones } from "../lib/constants";

const INTERVALS_BASE = "https://intervals.icu/api/v1";

const email = process.argv[2];
if (!email) {
  console.error("Usage: npm run demo:snapshot -- <email>");
  process.exit(1);
}

function makeIntervalsHeaders(apiKey: string) {
  return {
    Authorization: `Basic ${Buffer.from(`API_KEY:${apiKey}`).toString("base64")}`,
    Accept: "application/json",
  };
}

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchIntervals(urlPath: string, apiKey: string): Promise<unknown> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const res = await fetch(`${INTERVALS_BASE}${urlPath}`, { headers: makeIntervalsHeaders(apiKey) });
    if (res.ok) return res.json();
    if (res.status === 429 && attempt < RETRY_DELAYS_MS.length) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : RETRY_DELAYS_MS[attempt];
      console.warn(`  ⏳ 429 on ${urlPath} — waiting ${wait}ms (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length})`);
      await sleep(wait);
      continue;
    }
    throw new Error(`Intervals ${urlPath}: ${res.status}`);
  }
  throw new Error(`Intervals ${urlPath}: exhausted retries`);
}

async function fetchScout(urlPath: string, nsUrl: string, nsSecret: string): Promise<unknown> {
  const res = await fetch(`${nsUrl}${urlPath}`, {
    headers: { "api-secret": nsSecret },
  });
  if (!res.ok) throw new Error(`Scout ${urlPath}: ${res.status}`);
  return res.json();
}

function makeRelativeTs(ts: number): number {
  return ts - Date.now();
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`Snapshot date: ${today}`);
  console.log(`User: ${email}`);

  // Load credentials from DB
  console.log("Loading credentials from DB...");
  const creds = await getUserCredentials(email);
  if (!creds?.intervalsApiKey) throw new Error(`No Intervals.icu API key for ${email}`);
  if (!creds.nightscoutUrl || !creds.nightscoutSecret) throw new Error(`No Nightscout credentials for ${email}`);

  const apiKey = creds.intervalsApiKey;
  const nsUrl = creds.nightscoutUrl;
  const nsSecret = creds.nightscoutSecret;

  // Load user settings from DB
  const userSettings = await getUserSettings(email);

  // 1. Athlete profile
  console.log("Fetching athlete profile...");
  const athlete = (await fetchIntervals("/athlete/0", apiKey)) as Record<string, unknown>;

  // 2. Calendar events — use the same pipeline as the API route
  // This fetches both activities and events from Intervals.icu,
  // runs them through calendarPipeline (pairing, categorization),
  // and produces CalendarEvent[] matching what the client expects.
  const oldest = new Date();
  oldest.setMonth(oldest.getMonth() - 6);
  const newest = new Date();
  newest.setMonth(newest.getMonth() + 2);
  console.log("Fetching calendar (activities + events via calendarPipeline)...");
  const rawEvents = await fetchCalendarData(apiKey, oldest, newest);
  const now = new Date();
  const calendarEvents = rawEvents.filter((e) => {
    if (e.type === "planned" && new Date(e.date) < now) return false;
    return true;
  });
  console.log(`  ${calendarEvents.length} calendar events (${rawEvents.length - calendarEvents.length} past planned events removed)`);

  // Normalize workout names for demo consistency.
  // Calculate week number from the first event's date so ALL events
  // use the W{nn} format consistently.
  const sortedByDate = [...calendarEvents]
    .filter((e) => e.date)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const firstDate = sortedByDate.length > 0 ? new Date(sortedByDate[0].date) : new Date();
  firstDate.setHours(0, 0, 0, 0);

  // Map category to a clean suffix
  const categoryLabel: Record<string, string> = {
    easy: "Easy",
    long: "Long Run",
    interval: "Speed Work",
    race: "Race Test",
    other: "Cross Training",
  };

  for (const event of calendarEvents) {
    if (!event.name) continue;
    if (event.name === "RACE DAY") continue;

    const eventDate = new Date(event.date);
    const weekNum = Math.floor((eventDate.getTime() - firstDate.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
    const prefix = `W${String(weekNum).padStart(2, "0")}`;

    // Extract meaningful type from existing name
    let name = event.name;

    // Strip location prefixes and eco16 suffix
    name = name.replace(/^[A-ZÅÄÖ][a-zåäö]+ - /, "");
    name = name.replace(/\s*eco16$/, "");

    // Strip old W{nn} prefix to get the type part
    name = name.replace(/^W\d+\s*/, "");

    // Strip day-of-week prefixes (Tue, Thu, Sat, Sun, etc.)
    name = name.replace(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+/i, "");

    // Clean up edge cases
    name = name.replace(/\s*-\s*\d+km\s+.*$/, ""); // "- 6km Easy Run ("
    name = name.replace(/\s*-\s*Tempo.*$/, ""); // "- Tempo 2-1 (5.5km)"
    name = name.replace(/\s*\(Optional\)/i, "");

    // If nothing meaningful left, use category
    if (!name.trim() || name.trim().length < 3) {
      name = categoryLabel[event.category] ?? "Run";
    }

    event.name = `${prefix} ${name.trim()}`;
  }
  console.log("  Names normalized");

  // Scrub personalized content from descriptions.
  // Keep the workout structure (Warmup/Main set/Cooldown + step lines)
  // but replace AI-generated coaching paragraphs that reference specific dates, BG values, or personal data.
  for (const event of calendarEvents) {
    if (!event.description) continue;
    let desc = event.description as string;

    // Remove "pump setup" references
    desc = desc.replace(/same pump setup you'll use on race day/g, "same gear and fueling strategy you'll use on race day");

    // Replace paragraphs that reference specific dates (e.g., "Feb 27 you ran...", "Mar 17 averaged...")
    // These are the AI coaching paragraphs — they contain "your last", specific months, BG values like "8.1 → 7.5"
    const lines = desc.split("\n");
    const cleaned: string[] = [];
    for (const line of lines) {
      // Keep structural lines (Warmup, Main set, Cooldown, step lines starting with -)
      if (/^(Warmup|Main set|Cooldown|-)/.test(line.trim())) {
        cleaned.push(line);
        continue;
      }
      // Keep empty lines
      if (line.trim() === "") {
        cleaned.push(line);
        continue;
      }
      // Flag lines with personal data markers (check BEFORE short-line pass-through)
      const hasPersonalData =
        /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b/.test(line) ||
        /\bavg(HR|hr|Pace|pace)\s+\d/.test(line) ||
        /\b\d+\.\d+\s*→/.test(line) ||
        /\byou were\b/i.test(line) ||
        /\byour (last|recent|previous)\b/i.test(line) ||
        /\bCGM arrow\b/i.test(line) ||
        /I've bumped|I've trimmed|trimmed to|bumped from/i.test(line) ||
        /\bMarch \d|February \d|January \d/i.test(line) ||
        /PUMP OFF|FUEL PER 10:/i.test(line) ||
        /\byou've been hitting\b/i.test(line) ||
        /recent easy (paces|runs) have (been|sat)/i.test(line) ||
        /Fuel (is trimmed|holds|stays) at/i.test(line) ||
        /Holding (fuel )?at \*\*/i.test(line) ||
        /same \d+:\d+.*range/i.test(line);

      if (hasPersonalData) {
        continue;
      }
      // Keep short generic lines (titles, "RACE DAY! 16km.", "Good luck!", etc.)
      if (line.trim().length < 50) {
        cleaned.push(line);
        continue;
      }
      // Keep longer generic coaching text (no date/personal markers passed the check above)
      cleaned.push(line);
    }

    // Remove trailing empty lines
    while (cleaned.length > 0 && cleaned[cleaned.length - 1].trim() === "") {
      cleaned.pop();
    }

    event.description = cleaned.join("\n");
  }
  console.log("  Descriptions scrubbed");

  // Replace personal feedback comments with generic commentary that matches the rating
  const goodComments = [
    "Felt strong throughout. Good session.",
    "Nailed the pacing today. Finished feeling like I could do more.",
    "Perfect weather for it. Really enjoyed this run.",
    "Great session! Everything clicked today.",
    "Fueling went well. No issues.",
    "Smooth and steady. Exactly what was needed.",
    "Really solid effort. Building confidence.",
    "Good run. Nothing spectacular, just consistent.",
    "Best run of the week. Strong finish.",
    "Strides felt sharp. Easy pace was comfortable.",
    "Hills were tough but that's the point. Felt good.",
    "Lovely morning for a run. Kept it easy.",
    "Solid long run. Pacing was much better this time.",
    "Harder than expected but happy with the effort.",
  ];
  const badComments = [
    "Legs felt like concrete from the start. Just one of those days.",
    "Struggled with pacing. Went out too fast and paid for it.",
    "Not my day. Energy was low and it showed.",
    "Had to cut it short. Body wasn't having it today.",
    "Rough session. Everything felt harder than it should.",
    "Felt off the whole time. Might be the accumulated fatigue.",
    "Three days in a row was too much. Should have rested.",
  ];
  let goodIdx = 0;
  let badIdx = 0;
  let commentCount = 0;
  for (const event of calendarEvents) {
    if (event.feedbackComment && event.feedbackComment.trim()) {
      if (event.rating === "bad") {
        event.feedbackComment = badComments[badIdx % badComments.length];
        badIdx++;
      } else {
        event.feedbackComment = goodComments[goodIdx % goodComments.length];
        goodIdx++;
      }
      commentCount++;
    }
  }
  console.log(`  Replaced ${commentCount} feedback comments`);

  // 3. Activity details + streams (HR, pace for completed runs)
  const completedIds = calendarEvents
    .filter((e) => e.type === "completed" && e.activityId)
    .map((e) => e.activityId as string);
  const activityMap: Record<string, unknown> = {};
  const streamMap: Record<string, unknown> = {};

  // Keep every 60th sample (~1 point per minute from 1Hz source) to reduce fixture size
  function downsampleStream(stream: { type: string; data: number[] }): { type: string; data: number[] } {
    const STEP = 60;
    if (stream.data.length <= STEP) return stream;
    const sampled: number[] = [];
    for (let i = 0; i < stream.data.length; i += STEP) {
      sampled.push(stream.data[i]);
    }
    if ((stream.data.length - 1) % STEP !== 0) {
      sampled.push(stream.data[stream.data.length - 1]);
    }
    return { type: stream.type, data: sampled };
  }

  const failedActivities: string[] = [];
  for (const id of completedIds) {
    console.log(`  Activity ${id}...`);
    try {
      const activity = await fetchIntervals(`/activity/${id}`, apiKey);
      activityMap[id] = activity;
    } catch (e) {
      console.warn(`  ⚠ Failed to fetch activity details for ${id}: ${(e as Error).message}`);
      failedActivities.push(id);
    }
    try {
      const streams = await fetchIntervals(
        `/activity/${id}/streams?types=time,heartrate,velocity_smooth,cadence,altitude,distance`,
        apiKey,
      ) as { type: string; data: number[] }[];
      streamMap[id] = Array.isArray(streams) ? streams.map(downsampleStream) : streams;
    } catch (e) {
      console.warn(`  ⚠ Failed to fetch streams for ${id}: ${(e as Error).message}`);
      if (!failedActivities.includes(id)) failedActivities.push(id);
    }
  }

  // Remove activities with no data from the calendar to avoid broken UI cards
  if (failedActivities.length > 0) {
    console.warn(`\n⚠ ${failedActivities.length} activities had fetch failures — removing from calendar:`);
    for (const id of failedActivities) {
      console.warn(`  - ${id}`);
      const idx = calendarEvents.findIndex((e) => e.activityId === id);
      if (idx !== -1) calendarEvents.splice(idx, 1);
    }
  }

  // 4. Pre-compute activity details ({ streamData, avgHr, maxHr }) from raw streams.
  const activityDetailsMap: Record<string, unknown> = {};
  for (const id of completedIds) {
    const streams = streamMap[id] as { type: string; data: number[] }[] | undefined;
    if (!streams || !Array.isArray(streams)) continue;

    const timeData = streams.find((s) => s.type === "time")?.data ?? [];
    const hrData = streams.find((s) => s.type === "heartrate")?.data ?? [];
    const velData = streams.find((s) => s.type === "velocity_smooth")?.data ?? [];
    const cadData = streams.find((s) => s.type === "cadence")?.data ?? [];
    const altData = streams.find((s) => s.type === "altitude")?.data ?? [];
    const distData = streams.find((s) => s.type === "distance")?.data ?? [];

    const result: Record<string, unknown> = {};

    if (hrData.length > 0) {
      result.avgHr = Math.round(hrData.reduce((a, b) => a + b, 0) / hrData.length);
      result.maxHr = Math.round(Math.max(...hrData));
    }

    if (timeData.length > 0) {
      const streamData: Record<string, unknown> = {};

      if (hrData.length > 0) {
        streamData.heartrate = timeData.map((t, idx) => ({
          time: Math.round(t / 60),
          value: hrData[idx],
        }));
      }

      if (velData.length > 0) {
        streamData.pace = timeData
          .map((t, idx) => {
            const v = velData[idx];
            if (v === 0 || v < 0.001) return null;
            const pace = 1000 / (v * 60);
            if (pace < 2.0 || pace > 12.0) return null;
            return { time: Math.round(t / 60), value: pace };
          })
          .filter(Boolean);
      }

      if (cadData.length > 0) {
        streamData.cadence = timeData.map((t, idx) => ({
          time: Math.round(t / 60),
          value: cadData[idx] * 2,
        }));
      }

      if (altData.length > 0) {
        streamData.altitude = timeData.map((t, idx) => ({
          time: Math.round(t / 60),
          value: altData[idx],
        }));
      }

      if (distData.length > 0) {
        streamData.distance = distData;
        streamData.rawTime = timeData;
      }

      if (Object.keys(streamData).length > 0) {
        result.streamData = streamData;
      }
    }

    activityDetailsMap[id] = result;
  }

  // 5. Wellness
  console.log("Fetching wellness...");
  const wellness = await fetchIntervals(
    `/athlete/0/wellness?oldest=${oldest.toISOString().slice(0, 10)}&newest=${today}`,
    apiKey,
  );

  // 6. Pace curves (using the server-side transform that produces PaceCurveData shape)
  console.log("Fetching pace curves...");
  const paceCurves = await fetchPaceCurvesApi(apiKey) ?? { bestEfforts: [], longestRun: null, curve: [] };

  // 7. BG readings — use fetchBGFromNS which produces BGReading[] with mmol
  console.log("Fetching BG readings...");
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const bgReadings = await fetchBGFromNS(nsUrl, nsSecret, { since, count: 500 });
  bgReadings.sort((a, b) => a.ts - b.ts);
  console.log(`  ${bgReadings.length} BG readings`);

  // Compute trend from readings (same as /api/bg route)
  const bgTrend = computeTrend(bgReadings);
  const latestBG = bgReadings.length > 0 ? bgReadings[bgReadings.length - 1] : null;

  // 8. Per-run BG readings for each completed activity
  console.log("Fetching per-run BG readings...");
  const PADDING_MS = 10 * 60 * 1000;
  const perRunBGMap: Record<string, unknown[]> = {};
  for (const id of completedIds) {
    const act = activityMap[id] as Record<string, unknown> | undefined;
    if (!act) continue;
    const startStr = (act.start_date_local ?? act.start_date) as string | undefined;
    const movingSec = (act.moving_time ?? act.elapsed_time) as number | undefined;
    if (!startStr || !movingSec) continue;

    const startMs = new Date(startStr).getTime();
    const endMs = startMs + movingSec * 1000;
    try {
      const readings = await fetchBGFromNS(nsUrl, nsSecret, {
        since: startMs - PADDING_MS,
        until: endMs + PADDING_MS,
        count: 1000,
      });
      readings.sort((a, b) => a.ts - b.ts);
      if (readings.length >= 2) {
        perRunBGMap[id] = readings;
      }
    } catch {
      // No BG for this run — skip
    }
  }
  console.log(`  ${Object.keys(perRunBGMap).length} runs with BG data`);

  // 9. IOB
  console.log("Fetching IOB...");
  let iob = { iob: 0, updated: 0 };
  try {
    iob = (await fetchScout("/api/v1/treatments/iob", nsUrl, nsSecret)) as typeof iob;
  } catch {
    console.warn("  IOB fetch failed, using default");
  }

  // Convert BG readings to relative timestamps
  const bgRelative = bgReadings.map((r) => ({
    ...r,
    ts: makeRelativeTs(r.ts),
  }));

  // Build settings fixture from real user settings + athlete profile
  const settings = {
    demo: true,
    email: "demo@springa.run",
    raceDate: userSettings.raceDate ?? "2026-06-13",
    raceName: userSettings.raceName ?? "EcoTrail Stockholm 16K",
    raceDist: userSettings.raceDist ?? 16,
    totalWeeks: userSettings.totalWeeks ?? 24,
    startKm: userSettings.startKm ?? 8,
    currentAbilitySecs: userSettings.currentAbilitySecs ?? 1620,
    currentAbilityDist: userSettings.currentAbilityDist ?? 5,
    diabetesMode: true,
    onboardingComplete: true,
    displayName: "Alex",
    timezone: "Europe/Stockholm",
    runDays: userSettings.runDays ?? [1, 3, 6, 0],
    longRunDay: userSettings.longRunDay ?? 0,
    clubDay: userSettings.clubDay,
    clubType: userSettings.clubType,
    insulinType: userSettings.insulinType ?? "fiasp",
    intervalsConnected: true,
    nightscoutConnected: true,
    nightscoutUrl: "https://demo.springa.run",
    lthr: (athlete.lthr as number | undefined) ?? 165,
    maxHr: (athlete.max_hr as number | undefined) ?? 192,
    restingHr: (athlete.icu_resting_hr as number | undefined) ?? 52,
    hrZones: computeMaxHRZones((athlete.max_hr as number | undefined) ?? 192),
    sportSettingsId: 1,
    includeBasePhase: userSettings.includeBasePhase ?? false,
    warmthPreference: userSettings.warmthPreference ?? 0,
  };

  // Write output
  const output = `/**
 * Demo fixture data — generated by scripts/demo-snapshot.ts on ${today}.
 *
 * IMPORTANT: After generation, manually review and curate:
 * 1. Workout names (events) — normalize to W{nn} Type format
 * 2. Comments/notes — replace personal content
 * 3. Verify settings values match desired demo experience
 */

export const SNAPSHOT_DATE = "${today}";

export const settingsFixture = ${JSON.stringify(settings, null, 2)};

export const bgFixture = ${JSON.stringify({
    readings: bgRelative,
    current: latestBG ? {
      mmol: latestBG.mmol,
      sgv: latestBG.sgv,
      ts: makeRelativeTs(latestBG.ts),
      direction: bgTrend?.direction ?? latestBG.direction,
      arrow: bgTrend ? slopeToArrow(bgTrend.slope) : trendArrow(latestBG.direction),
    } : null,
    trend: bgTrend ? {
      slope: bgTrend.slope,
      direction: bgTrend.direction,
      arrow: slopeToArrow(bgTrend.slope),
    } : null,
  }, null, 2)};

export const calendarFixture = ${JSON.stringify(calendarEvents, null, 2)};

export const wellnessFixture = ${JSON.stringify(wellness, null, 2)};

export const paceCurvesFixture = ${JSON.stringify(paceCurves, null, 2)};

export const insulinContextFixture = ${JSON.stringify({
    iob: iob.iob,
    updated: makeRelativeTs(iob.updated || Date.now()),
  }, null, 2)};

export const bgCacheFixture: unknown[] = [];

export const bgPatternsFixture = { patternsText: null };

export const activityFixtures: Record<string, unknown> = ${JSON.stringify(activityMap, null, 2)};

export const streamFixtures: Record<string, unknown> = ${JSON.stringify(streamMap, null, 2)};

export const activityDetailsFixtures: Record<string, unknown> = ${JSON.stringify(activityDetailsMap, null, 2)};

export const perRunBGFixtures: Record<string, unknown[]> = ${JSON.stringify(perRunBGMap, null, 2)};

export const coachFixtures: Record<string, string> = {
  "What can Springa do for me?": "Springa is your AI-powered training companion designed specifically for runners managing Type 1 diabetes. Here's what I can help with:\\n\\n**Training Plan Generation** — I create periodized plans that progress from your current fitness to your race goal. Each week's workouts are structured with the right mix of easy runs, long runs, and speed work.\\n\\n**Blood Glucose Management** — During runs, I track your BG response to different workout types and fuel rates. The BG model learns from your data to recommend fuel rates that keep you stable.\\n\\n**Fuel Rate Optimization** — Based on your completed runs, I analyze how different carb intake rates affect your BG. The model suggests adjustments so you can run without worrying about lows or post-run spikes.\\n\\n**AI Coaching** — Ask me anything about your training, recovery, BG trends, or upcoming workouts. I have full context on your plan, recent runs, and physiological data.\\n\\n**Race Readiness** — I track your fitness (CTL), fatigue (ATL), and freshness (TSB) to tell you how you're tracking toward race day.",
};

export const fixtures: Record<string, unknown> = {
  settings: settingsFixture,
  bg: bgFixture,
  "intervals/calendar": calendarFixture,
  wellness: wellnessFixture,
  "intervals/pace-curves": paceCurvesFixture,
  "insulin-context": insulinContextFixture,
  "bg-cache": bgCacheFixture,
  "bg-patterns": bgPatternsFixture,
};
`;

  const outPath = path.resolve("lib/demo/fixtures.ts");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, output);
  console.log(`\nSnapshot written to ${outPath}`);
  console.log("\nNext steps:");
  console.log("  1. Review and curate workout names in lib/demo/fixtures.ts");
  console.log("  2. Replace any personal comments/notes");
  console.log("  3. Run: npm run dev and open /demo to verify");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
