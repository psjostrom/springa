import { db } from "../lib/db";
import { getUserCredentials } from "../lib/credentials";
import type { IntervalsActivity } from "../lib/types";
import { saveWorkoutProtocolIfAbsent, type CamAPSMode, type CamAPSAutoSubmode, type ProtocolTiming } from "../lib/workoutProtocolDb";

function hasPumpKeywords(text: string): boolean {
  return (
    text.includes("pump") ||
    text.includes("u/h") ||
    text.includes("auto") ||
    text.includes("ease off") ||
    text.includes("ease-off") ||
    text.includes("boost") ||
    text.includes("manual") ||
    text.includes("disconnect") ||
    text.includes("koppla") ||
    text.includes("avbröt")
  );
}

function inferProtocolFromComment(comment: string | undefined): {
  beforeMode: CamAPSMode;
  beforeAutoSubmode: CamAPSAutoSubmode | null;
  beforeManualUh: number | null;
  beforeTiming: ProtocolTiming;
  duringSame: boolean;
  duringMode: CamAPSMode | null;
  duringAutoSubmode: CamAPSAutoSubmode | null;
  duringManualUh: number | null;
} | null {
  if (!comment) return null;
  const text = comment.toLowerCase();
  if (!hasPumpKeywords(text)) return null;

  let beforeMode: CamAPSMode = "auto";
  let beforeAutoSubmode: CamAPSAutoSubmode | null = "ease_off";
  let beforeManualUh: number | null = null;
  let beforeTiming: ProtocolTiming = "1-2h";
  let duringSame = true;
  let duringMode: CamAPSMode | null = null;
  let duringAutoSubmode: CamAPSAutoSubmode | null = null;
  let duringManualUh: number | null = null;

  // Infer timing
  if (text.includes("3 hour") || text.includes("3h") || text.includes(">2h")) {
    beforeTiming = ">2h";
  } else if (text.includes("2 hour") || text.includes("2h") || text.includes("1,5h") || text.includes("1.5h") || text.includes("1 hour") || text.includes("1h")) {
    beforeTiming = "1-2h";
  } else if (text.includes("30m") || text.includes("30 min") || text.includes("just before") || text.includes("<30m")) {
    beforeTiming = "<30m";
  } else if (text.includes("at start") || text.includes("vid start")) {
    beforeTiming = "at_start";
  }

  const beforePart = text.split("during")[0] ?? text;
  const duringPart = text.includes("during") ? text.slice(text.indexOf("during")) : "";

  // Accept both decimal and integer u/h rates
  const beforeUhMatch = beforePart.match(/([0-9]+(?:[.,][0-9]+)?)\s*u\/h/);
  if (beforeUhMatch) {
    const rate = parseFloat(beforeUhMatch[1].replace(",", "."));
    if (!isNaN(rate)) {
      beforeMode = "manual";
      beforeManualUh = rate;
      beforeAutoSubmode = null;
    }
  } else if (beforePart.includes("ease off") || beforePart.includes("ease-off") || beforePart.includes("auto")) {
    beforeMode = "auto";
    beforeAutoSubmode = "ease_off";
  } else if (beforePart.includes("removed pump") || beforePart.includes("disconnected") || beforePart.includes("utan pump")) {
    beforeMode = "disconnected";
    beforeAutoSubmode = null;
  }

  // Check during run
  const duringUhMatch = duringPart.match(/([0-9]+(?:[.,][0-9]+)?)\s*u\/h/);
  if (duringPart.includes("disconnected") || duringPart.includes("removed")) {
    duringSame = false;
    duringMode = "disconnected";
  } else if (duringPart.includes("auto") || duringPart.includes("ease off") || duringPart.includes("ease-off")) {
    duringSame = false;
    duringMode = "auto";
    duringAutoSubmode = "ease_off";
  } else if (duringUhMatch) {
    const rate = parseFloat(duringUhMatch[1].replace(",", "."));
    if (!isNaN(rate)) {
      duringSame = false;
      duringMode = "manual";
      duringManualUh = rate;
    }
  }

  return {
    beforeMode,
    beforeAutoSubmode,
    beforeManualUh,
    beforeTiming,
    duringSame,
    duringMode,
    duringAutoSubmode,
    duringManualUh,
  };
}

async function migrateUser(email: string) {
  console.log("\n=== Migrating user ===");
  const creds = await getUserCredentials(email);
  if (!creds?.intervalsApiKey) {
    console.log("No Intervals API key found. Skipping.");
    return;
  }

  const auth = `Basic ${Buffer.from(`API_KEY:${creds.intervalsApiKey}`).toString("base64")}`;
  const res = await fetch(
    `https://intervals.icu/api/v1/athlete/0/activities?oldest=2024-01-01&newest=2026-12-31&cols=*`,
    {
      headers: { Authorization: auth, Accept: "application/json" },
    },
  );

  if (!res.ok) {
    console.error(`Failed to fetch activities from Intervals: ${res.status}`);
    return;
  }

  const activities = (await res.json()) as IntervalsActivity[];
  console.log(`Fetched ${activities.length} total activities.`);

  const eligibleActivities = activities.filter(
    (a) =>
      (a.type === "Run" || a.type === "VirtualRun") &&
      ((a.FeedbackComment && a.FeedbackComment.trim().length > 0) ||
        (a.PreRunCarbsG != null && a.PreRunCarbsG > 0) ||
        a.Rating != null ||
        a.feel != null ||
        a.icu_rpe != null ||
        a.rpe != null),
  );

  console.log(`Eligible runs: ${eligibleActivities.length}`);

  let migratedCount = 0;
  let skippedCount = 0;
  const failures: { activityId: string; error: unknown }[] = [];
  for (const activity of eligibleActivities) {
    const comment = activity.FeedbackComment?.trim() || null;
    const preRunCarbsG = activity.PreRunCarbsG && activity.PreRunCarbsG > 0 ? activity.PreRunCarbsG : null;
    const inferred = inferProtocolFromComment(comment || undefined);

    // Map legacy blunt rating: "good" -> 4, "bad" -> 2
    let feel: number | null = activity.feel ?? null;
    if (feel != null && (!Number.isInteger(feel) || feel < 1 || feel > 5)) {
      skippedCount++;
      continue;
    }
    if (feel == null && activity.Rating) {
      if (activity.Rating === "good") feel = 4;
      else if (activity.Rating === "bad") feel = 2;
    }
    const rpe = activity.icu_rpe ?? activity.rpe ?? null;

    try {
      if (inferred) {
        // Protocol inference succeeded — save full protocol
        await saveWorkoutProtocolIfAbsent(email, activity.id, {
          hasProtocol: true,
          ...inferred,
          preRunCarbsG,
          feel,
          rpe,
          note: comment,
        });
      } else {
        // No protocol inference — save only feedback data without fabricated CamAPS fields
        await saveWorkoutProtocolIfAbsent(email, activity.id, {
          hasProtocol: false,
          beforeMode: null,
          beforeTiming: null,
          duringSame: true,
          preRunCarbsG,
          feel,
          rpe,
          note: comment,
        });
      }
      migratedCount++;
    } catch (error) {
      failures.push({ activityId: activity.id, error });
      console.error(`Failed to migrate activity ${activity.id}:`, error);
    }
  }

  if (failures.length > 0) {
    console.error(`${failures.length} activities failed to migrate for user ${email}.`);
  }
  console.log(`Migrated ${migratedCount} activities (${skippedCount} skipped, ${failures.length} failed).`);
}

async function main() {
  const users = await db().execute("SELECT email FROM user_settings WHERE intervals_api_key IS NOT NULL");
  console.log(`Found ${users.rows.length} users with Intervals connected.`);

  // Ensure table exists
  await db().execute(`
    CREATE TABLE IF NOT EXISTS workout_protocols (
      email               TEXT NOT NULL,
      activity_id         TEXT NOT NULL,
      has_protocol        INTEGER NOT NULL DEFAULT 1,
      before_mode         TEXT NOT NULL DEFAULT 'none',
      before_auto_submode TEXT,
      before_target_bg    REAL,
      before_manual_uh    REAL,
      before_timing       TEXT NOT NULL DEFAULT 'none',
      during_same         INTEGER NOT NULL DEFAULT 1,
      during_mode         TEXT,
      during_auto_submode TEXT,
      during_target_bg    REAL,
      during_manual_uh    REAL,
      pre_run_carbs_g     INTEGER,
      rescue_carbs_g      INTEGER,
      feel                INTEGER,
      rpe                 INTEGER,
      note                TEXT,
      updated_at          INTEGER NOT NULL,
      PRIMARY KEY (email, activity_id)
    );
  `);

  try { await db().execute("ALTER TABLE workout_protocols ADD COLUMN has_protocol INTEGER NOT NULL DEFAULT 1"); } catch {}
  try { await db().execute("ALTER TABLE workout_protocols ADD COLUMN feel INTEGER"); } catch {}
  try { await db().execute("ALTER TABLE workout_protocols ADD COLUMN rpe INTEGER"); } catch {}

  for (const row of users.rows) {
    await migrateUser(row.email as string);
  }

  // Verification count
  const countRes = await db().execute("SELECT COUNT(*) as cnt FROM workout_protocols");
  console.log(`\n=== Verification: Total rows in workout_protocols: ${countRes.rows[0].cnt} ===`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
