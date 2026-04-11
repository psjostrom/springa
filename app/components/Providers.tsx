"use client";

import { useEffect } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { NotificationPrompt } from "./NotificationPrompt";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function PushSubscriptionManager() {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.user?.email) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission !== "granted") return;

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) return;

    void navigator.serviceWorker.ready.then(async (reg) => {
      try {
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
        });
        const json = sub.toJSON();
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: json.endpoint,
            keys: json.keys,
          }),
        });
      } catch {
        // subscription failed — browser may have revoked permission
      }
    });
  }, [session?.user?.email]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").then((registration) => {
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            newWorker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
    }).catch(() => undefined);

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  }, []);

  return (
    <SessionProvider>
      <PushSubscriptionManager />
      <NotificationPrompt />
      {children}
    </SessionProvider>
  );
}
