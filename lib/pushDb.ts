import { db } from "./db";

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function savePushSubscription(
  email: string,
  sub: PushSubscriptionRecord,
): Promise<void> {
  await db().execute({
    sql: `INSERT OR REPLACE INTO push_subscriptions (email, endpoint, p256dh, auth, created_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [email, sub.endpoint, sub.p256dh, sub.auth, Date.now()],
  });
}

export async function getPushSubscriptions(
  email: string,
): Promise<PushSubscriptionRecord[]> {
  const result = await db().execute({
    sql: "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE email = ?",
    args: [email],
  });
  return result.rows.map((row) => ({
    endpoint: row.endpoint as string,
    p256dh: row.p256dh as string,
    auth: row.auth as string,
  }));
}

export async function deletePushSubscription(
  email: string,
  endpoint: string,
): Promise<void> {
  await db().execute({
    sql: "DELETE FROM push_subscriptions WHERE email = ? AND endpoint = ?",
    args: [email, endpoint],
  });
}

export async function getPrerunPushUsers(): Promise<string[]> {
  const result = await db().execute({
    sql: "SELECT DISTINCT email FROM push_subscriptions",
    args: [],
  });
  return result.rows.map((row) => row.email as string);
}

export async function hasPrerunPushSent(
  email: string,
  eventDate: string,
): Promise<boolean> {
  const result = await db().execute({
    sql: "SELECT 1 FROM prerun_push_log WHERE email = ? AND event_date = ?",
    args: [email, eventDate],
  });
  return result.rows.length > 0;
}

export async function markPrerunPushSent(
  email: string,
  eventDate: string,
): Promise<void> {
  await db().execute({
    sql: "INSERT OR IGNORE INTO prerun_push_log (email, event_date, sent_at) VALUES (?, ?, ?)",
    args: [email, eventDate, Date.now()],
  });
}
