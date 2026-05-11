import { createClient } from "@libsql/client";
import {
  computePreRunContext,
  computePostRunContext,
  PRE_STABILITY_WINDOW_MS,
} from "../lib/runBGContext";
import type { BGReading } from "../lib/cgm";
import type { WorkoutCategory } from "../lib/types";
import { getWorkoutCategory } from "../lib/constants";
import { getUserCredentials } from "../lib/credentials";
import { fetchBGFromNS } from "../lib/nightscout";

/** Small delay between NS fetches to avoid hammering Scout. */
const NS_DELAY_MS = 100;

interface ActivityRow {
  activity_id: string;
  name: string | null;
  run_start_ms: number;
  fuel_rate: number | null;
  hr: string;
  glucose: string | null;
}

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: node --env-file=.env.local --import tsx scripts/backfill-postrun-stats.ts <email>");
    process.exit(1);
  }

  const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  console.log(`Backfilling run_bg_context for ${email}...`);

  // Lazy-load NS credentials once at startup
  const creds = await getUserCredentials(email);
  if (!creds?.nightscoutUrl || !creds?.nightscoutSecret) {
    console.log("Warning: No Nightscout credentials found. Falling back to local bg_readings only.");
  }

  // 1. Find activities missing run_bg_context
  const result = await db.execute({
    sql: `SELECT activity_id, name, run_start_ms, fuel_rate, hr, glucose
          FROM activity_streams
          WHERE email = ? AND run_bg_context IS NULL AND hr IS NOT NULL AND run_start_ms IS NOT NULL`,
    args: [email],
  });

  const activities = result.rows as unknown as ActivityRow[];
  console.log(`Found ${activities.length} activities to process.`);

  if (activities.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let updated = 0;
  let skipped = 0;
  let fromLocal = 0;
  let fromNS = 0;

  for (const row of activities) {
    const { activity_id, name, run_start_ms, hr } = row;

    // Parse HR stream to get run end time
    const hrData = JSON.parse(hr) as { time: number; value: number }[];
    if (hrData.length === 0) {
      console.log(`${activity_id}: No HR data, skipping`);
      skipped++;
      continue;
    }

    const lastHrTime = hrData[hrData.length - 1].time; // minutes from start
    const runEndMs = run_start_ms + lastHrTime * 60000;

    // Determine category from name
    const rawCategory = name ? getWorkoutCategory(name) : "other";
    const category: WorkoutCategory = (rawCategory === "other" ? "easy" : rawCategory) as WorkoutCategory;

    // Fetch BG readings: 60 min before start → 2h after end
    const preLookback = PRE_STABILITY_WINDOW_MS; // 60 min
    const postWindow = 2 * 60 * 60 * 1000; // 2 hours
    const startWindow = run_start_ms - preLookback;
    const endWindow = runEndMs + postWindow;

    const readingsResult = await db.execute({
      sql: `SELECT ts, mmol FROM bg_readings WHERE email = ? AND ts >= ? AND ts <= ? ORDER BY ts ASC`,
      args: [email, startWindow, endWindow],
    });

    let readings: BGReading[] = readingsResult.rows.map((r) => ({
      ts: r.ts as number,
      mmol: r.mmol as number,
    }));

    let source: "local" | "ns" | "none" = "local";

    // Fallback to NS if local readings are empty
    if (readings.length === 0 && creds?.nightscoutUrl && creds?.nightscoutSecret) {
      try {
        const nsReadings = await fetchBGFromNS(creds.nightscoutUrl, creds.nightscoutSecret, {
          since: startWindow,
          until: endWindow,
        });
        readings = nsReadings.map((r) => ({ ts: r.ts, mmol: r.mmol }));
        source = nsReadings.length > 0 ? "ns" : "none";
        if (nsReadings.length > 0) {
          await new Promise((resolve) => setTimeout(resolve, NS_DELAY_MS));
        }
      } catch (err) {
        console.log(`${activity_id}: NS fetch failed: ${err instanceof Error ? err.message : err}`);
        source = "none";
      }
    } else if (readings.length === 0) {
      source = "none";
    }

    if (source === "none") {
      console.log(`${activity_id}: No BG readings in window (local or NS), skipping`);
      skipped++;
      continue;
    }

    // Compute pre/post contexts
    const pre = computePreRunContext(readings, run_start_ms);
    const post = computePostRunContext(readings, runEndMs);

    if (!pre && !post) {
      console.log(`${activity_id}: No pre/post context could be computed, skipping`);
      skipped++;
      continue;
    }

    // Compute totalBGImpact if both pre and post exist
    let totalBGImpact: number | null = null;
    if (pre && post) {
      // Find closest reading at 2h after run end
      const target2h = runEndMs + postWindow;
      const candidates = readings.filter(r => Math.abs(r.ts - target2h) <= 10 * 60 * 1000); // 10 min window
      if (candidates.length > 0) {
        const closest = candidates.reduce((best, r) =>
          Math.abs(r.ts - target2h) < Math.abs(best.ts - target2h) ? r : best
        );
        totalBGImpact = closest.mmol - pre.startBG;
      }
    }

    const runBGContext = {
      activityId: activity_id,
      category,
      pre,
      post,
      totalBGImpact,
    };

    // Update DB
    await db.execute({
      sql: `UPDATE activity_streams SET run_bg_context = ? WHERE email = ? AND activity_id = ?`,
      args: [JSON.stringify(runBGContext), email, activity_id],
    });

    console.log(`${activity_id}: Updated (cat=${category}, pre=${!!pre}, post=${!!post}) [${source}]`);
    updated++;
    if (source === "local") fromLocal++;
    if (source === "ns") fromNS++;
  }

  console.log("");
  console.log(`Updated ${updated} of ${activities.length} activities. ${skipped} skipped. (${fromNS} from NS, ${fromLocal} from local)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
