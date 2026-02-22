import webpush from "web-push";
import { getPushSubscriptions, deletePushSubscription } from "./settings";

webpush.setVapidDetails(
  "mailto:push@springa.vercel.app",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  ts?: number;
}

export async function sendPushToUser(
  email: string,
  payload: PushPayload,
): Promise<void> {
  const subs = await getPushSubscriptions(email);
  if (subs.length === 0) return;

  const data = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          data,
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await deletePushSubscription(email, sub.endpoint);
        }
      }
    }),
  );
}
