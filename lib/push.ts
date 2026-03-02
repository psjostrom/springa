import webpush from "web-push";
import { getPushSubscriptions, deletePushSubscription } from "./pushDb";

let _vapidReady = false;
function ensureVapid() {
  if (_vapidReady) return;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required");
  webpush.setVapidDetails("mailto:push@springa.vercel.app", pub, priv);
  _vapidReady = true;
}

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
  ensureVapid();
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
