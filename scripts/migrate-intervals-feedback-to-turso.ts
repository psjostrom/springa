import { db } from "../lib/db";
import { getUserCredentials } from "../lib/credentials";
import type { IntervalsActivity } from "../lib/types";
import { saveWorkoutProtocol, type CamAPSMode, type CamAPSAutoSubmode, type ProtocolTiming } from "../lib/workoutProtocolDb";

function inferProtocolFromComment(comment: string | undefined): {
  beforeMode: CamAPSMode;
  beforeAutoSubmode: CamAPSAutoSubmode | null;
  beforeManualUh: number | null;
  beforeTiming: ProtocolTiming;
  duringSame: boolean;
  duringMode: CamAPSMode | null;
  duringAutoSubmode: CamAPSAutoSubmode | null;
  duringManualUh: number | null;
} {
  const text = (comment || "").toLowerCase();

  let beforeMode: CamAPSMode = "disconnected";
  let beforeAutoSubmode: CamAPSAutoSubmode | null = null;
  let beforeManualUh: number | null = null;
  let beforeTiming: ProtocolTiming = ">2h";
  let duringSame = true;
  let duringMode: CamAPSMode | null = null;
  let duringAutoSubmode: CamAPSAutoSubmode | null = null;
  let duringManualUh: number | null = null;

  // Infer timing
  if (text.includes("3 hour") || text.includes("3h") || text.includes(">2h")) {
    beforeTiming = ">2h";
  } else if (text.includes("2 hour") || text.includes("2h") || text.includes("1,5h") || text.includes("1.5h") || text.includes("1 hour") || text.includes("1h")) {
    beforeTiming = "1-2h";
  } else if (text.includes("30m") || text.includes("30 min") || text.includes("just before")) {
    beforeTiming = "<30m";
  } else if (text.includes("at start")) {
    beforeTiming = "at_start";
  }

  // Check manual rate
  const uhMatch = text.match(/([0-9]+[.,][0-9]+)\s*u\/h/);
  if (uhMatch) {
    const rate = parseFloat(uhMatch[1].replace(",", "."));
    if (!isNaN(rate)) {
      beforeMode = "manual";
      beforeManualUh = rate;
    }
  } else if (text.includes("auto") || text.includes("ease off") || text.includes("ease-off")) {
    beforeMode = "auto";
    beforeAutoSubmode = "ease_off";
  } else if (text.includes("removed pump") || text.includes("disconnected") || text.includes("utan pump")) {
    beforeMode = "disconnected";
  }

  // Check during run
  if (text.includes("disconnected during") || (text.includes("during") && text.includes("removed"))) {
    duringSame = false;
    duringMode = "disconnected";
  } else if (text.includes("during") && text.includes("auto")) {
    duringSame = false;
    duringMode = "auto";
    duringAutoSubmode = "ease_off";
  } else if (text.includes("during") && uhMatch) {
    const rate = parseFloat(uhMatch[1].replace(",", "."));
    if (!isNaN(rate)) {
      duringMode = "manual";
      duringManualUh = rate;
      if (beforeMode !== "manual") duringSame = false;
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
  console.log(`\n=== Migrating user: ${email} ===`);
  const creds = await getUserCredentials(email);
  if (!creds?.intervalsApiKey) {
    console.log(`No Intervals API key found for ${email}. Skipping.`);
    return;
  }

  const auth = `Basic ${Buffer.from(`API_KEY:${creds.intervalsApiKey}`).toString("base64")}`;
  const res = await fetch(
    `https://intervals.icu/api/v1/athlete/0/activities?oldest=2024-01-01&newest=2026-12-31`,
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
        (a.PreRunCarbsG != null && a.PreRunCarbsG > 0)),
  );

  console.log(`Eligible runs with feedback or pre-run carbs: ${eligibleActivities.length}`);

  let migratedCount = 0;
  for (const activity of eligibleActivities) {
    const comment = activity.FeedbackComment?.trim() || null;
    const preRunCarbsG = activity.PreRunCarbsG && activity.PreRunCarbsG > 0 ? activity.PreRunCarbsG : null;
    const inferred = inferProtocolFromComment(comment || undefined);

    await saveWorkoutProtocol(email, activity.id, {
      ...inferred,
      preRunCarbsG,
      note: comment,
    });
    migratedCount++;
    console.log(
      `  [${activity.id}] (${activity.start_date}) preRunCarbs=${preRunCarbsG}g | note="${comment?.slice(0, 50) ?? ''}"`,
    );
  }

  console.log(`Successfully migrated ${migratedCount} activities into Turso workout_protocols.`);
}

async function main() {
  const users = await db().execute("SELECT email FROM user_settings WHERE intervals_api_key IS NOT NULL");
  console.log(`Found ${users.rows.length} users with Intervals connected.`);

  // Ensure table exists
  await db().execute(`
    CREATE TABLE IF NOT EXISTS workout_protocols (
      email               TEXT NOT NULL,
      activity_id         TEXT NOT NULL,
      before_mode         TEXT NOT NULL,
      before_auto_submode TEXT,
      before_target_bg    REAL,
      before_manual_uh    REAL,
      before_timing       TEXT NOT NULL,
      during_same         INTEGER NOT NULL DEFAULT 1,
      during_mode         TEXT,
      during_auto_submode TEXT,
      during_target_bg    REAL,
      during_manual_uh    REAL,
      pre_run_carbs_g     INTEGER,
      rescue_carbs_g      INTEGER,
      note                TEXT,
      updated_at          INTEGER NOT NULL,
      PRIMARY KEY (email, activity_id)
    );
  `);

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
