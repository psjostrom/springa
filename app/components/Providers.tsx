"use client";

import { useCallback, useEffect, useState } from "react";
import { SessionProvider, useSession } from "next-auth/react";

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

function UpdateBanner({ onUpdate }: { onUpdate: () => void }) {
  return (
    <div className="fixed top-4 left-4 right-4 z-50 flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-lg">
      <p className="flex-1 text-sm text-foreground">
        A new version is available
      </p>
      <button
        type="button"
        onClick={onUpdate}
        className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
      >
        Update
      </button>
    </div>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reg: ServiceWorkerRegistration | undefined;
    const handleUpdateFound = () => {
      const newWorker = reg?.installing;
      if (!newWorker) return;
      newWorker.addEventListener("statechange", () => {
        if (
          newWorker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          setWaitingWorker(newWorker);
        }
      });
    };

    navigator.serviceWorker.register("/sw.js").then((registration) => {
      reg = registration;
      registration.addEventListener("updatefound", handleUpdateFound);
    }).catch(() => undefined);

    return () => {
      reg?.removeEventListener("updatefound", handleUpdateFound);
    };
  }, []);

  const handleUpdate = useCallback(() => {
    if (!waitingWorker) return;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
    setWaitingWorker(null);
    window.location.reload();
  }, [waitingWorker]);

  return (
    <SessionProvider>
      <PushSubscriptionManager />
      {waitingWorker && <UpdateBanner onUpdate={handleUpdate} />}
      {children}
    </SessionProvider>
  );
}
