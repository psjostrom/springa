"use client";

import { useSyncExternalStore } from "react";
import type { XdripReading } from "@/lib/xdrip";

interface CurrentBGData {
  currentBG: number | null;
  trend: string | null;
  trendSlope: number | null;
  lastUpdate: Date | null;
  loading: boolean;
  readings: XdripReading[];
}

const POLL_INTERVAL = 60_000;

const EMPTY: CurrentBGData = {
  currentBG: null,
  trend: null,
  trendSlope: null,
  lastUpdate: null,
  loading: true,
  readings: [],
};

function createBGStore() {
  let data: CurrentBGData = EMPTY;
  const listeners = new Set<() => void>();
  let interval: ReturnType<typeof setInterval> | undefined;
  let refs = 0;

  function set(next: CurrentBGData) {
    data = next;
    listeners.forEach((l) => { l(); });
  }

  async function poll() {
    try {
      const res = await fetch("/api/xdrip");
      if (!res.ok) {
        set({ ...data, loading: false });
        return;
      }
      const json = (await res.json()) as {
        current?: { mmol: number; arrow?: string; ts: number };
        trend?: { arrow?: string; slope?: number };
        readings?: XdripReading[];
      };

      const readings: XdripReading[] = json.readings ?? [];

      if (!json.current) {
        set({ currentBG: null, trend: null, trendSlope: null, lastUpdate: null, loading: false, readings });
        return;
      }

      set({
        currentBG: json.current.mmol,
        trend: json.trend?.arrow ?? json.current.arrow ?? null,
        trendSlope: json.trend?.slope ?? null,
        lastUpdate: new Date(json.current.ts),
        loading: false,
        readings,
      });
    } catch {
      set({ ...data, loading: false });
    }
  }

  return {
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      // Start polling when first subscriber arrives
      refs++;
      if (refs === 1) {
        void poll();
        interval = setInterval(() => { void poll(); }, POLL_INTERVAL);
      }
      return () => {
        listeners.delete(cb);
        refs--;
        if (refs === 0 && interval) {
          clearInterval(interval);
          interval = undefined;
        }
      };
    },
    getSnapshot: () => data,
  };
}

// Module-level singleton — one poll loop shared across all consumers
const store = createBGStore();

export function useCurrentBG(): CurrentBGData {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => EMPTY);
}
