"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useAtomValue } from "jotai";
import { isDemoAtom } from "../atoms";
import { Toast } from "./Toast";

const DISMISSED_KEY = "notification-prompt-dismissed";

function getSnapshot(): boolean {
  if (typeof window === "undefined" || !("Notification" in window))
    return false;
  if (Notification.permission !== "default") return false;
  if (localStorage.getItem(DISMISSED_KEY)) return false;
  return true;
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(onStoreChange: () => void): () => void {
  // Re-check when storage changes (e.g. dismissed in another tab)
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
  };
}

export function NotificationPrompt() {
  const isDemo = useAtomValue(isDemoAtom);
  const shouldShow = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const handleEnable = useCallback(() => {
    void Notification.requestPermission().then((result) => {
      if (result === "granted" || result === "denied") {
        // Force re-render — permission changed, snapshot returns false
        window.dispatchEvent(new Event("storage"));
      }
    });
  }, []);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, "1");
    // Force re-render via the storage subscription
    window.dispatchEvent(new Event("storage"));
  }, []);

  if (isDemo || !shouldShow) return null;

  return (
    <Toast
      message="Enable push notifications for pre-run alerts"
      actionLabel="Enable"
      onAction={handleEnable}
      onDismiss={handleDismiss}
    />
  );
}
