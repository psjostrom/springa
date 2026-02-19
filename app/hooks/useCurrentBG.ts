"use client";

import { useSyncExternalStore, useRef, useEffect } from "react";

interface CurrentBGData {
  currentBG: number | null;
  trend: string | null;
  trendSlope: number | null;
  lastUpdate: Date | null;
  loading: boolean;
}

const POLL_INTERVAL = 60_000;

const EMPTY: CurrentBGData = {
  currentBG: null,
  trend: null,
  trendSlope: null,
  lastUpdate: null,
  loading: true,
};

function createBGStore() {
  let data: CurrentBGData = EMPTY;
  const listeners = new Set<() => void>();

  function set(next: CurrentBGData) {
    data = next;
    listeners.forEach((l) => l());
  }

  async function poll() {
    try {
      const res = await fetch("/api/xdrip");
      if (!res.ok) {
        set({ ...data, loading: false });
        return;
      }
      const json = await res.json();

      if (!json.current) {
        set({ currentBG: null, trend: null, trendSlope: null, lastUpdate: null, loading: false });
        return;
      }

      set({
        currentBG: json.current.mmol,
        trend: json.trend?.arrow ?? json.current.arrow ?? null,
        trendSlope: json.trend?.slope ?? null,
        lastUpdate: new Date(json.current.ts),
        loading: false,
      });
    } catch {
      set({ ...data, loading: false });
    }
  }

  return {
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSnapshot: () => data,
    poll,
  };
}

// Module-level singleton — one poll loop for the app
const store = createBGStore();
let started = false;

export function useCurrentBG(): CurrentBGData {
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (!started) {
      started = true;
      store.poll();
      intervalRef.current = setInterval(() => store.poll(), POLL_INTERVAL);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        started = false;
      }
    };
  }, []);

  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => EMPTY);
}
