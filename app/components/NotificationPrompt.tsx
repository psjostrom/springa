"use client";

import { useCallback, useSyncExternalStore } from "react";

const DISMISSED_KEY = "notification-prompt-dismissed";

function getSnapshot(): boolean {
  if (typeof window === "undefined" || !("Notification" in window))
    return false;
  if (document.cookie.includes("springa-demo=1")) return false;
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

  if (!shouldShow) return null;

  return (
    <div className="fixed bottom-16 md:bottom-4 left-4 right-4 z-50 flex items-center gap-3 rounded-lg border border-border bg-surface p-4 shadow-lg">
      <p className="flex-1 text-sm text-text">
        Enable push notifications for pre-run alerts
      </p>
      <button
        type="button"
        onClick={handleEnable}
        className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white"
      >
        Enable
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 text-muted hover:text-text"
        aria-label="Dismiss"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
  );
}
