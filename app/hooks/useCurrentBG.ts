"use client";

import { useSyncExternalStore } from "react";
import { useAtomValue } from "jotai";
import { sugarModeAtom } from "../atoms";
import type { BGReading } from "@/lib/cgm";

interface CurrentBGData {
  currentBG: number | null;
  trend: string | null;
  trendSlope: number | null;
  lastUpdate: Date | null;
  loading: boolean;
  readings: BGReading[];
}

const POLL_INTERVAL = 60_000;

const EMPTY: CurrentBGData = {
  currentBG: null,
  trend: null,
  trendSlope: null,
  lastUpdate: null,
  loading: false,
  readings: [],
};

function createBGStore() {
  let data: CurrentBGData = EMPTY;
  const listeners = new Set<() => void>();
  let interval: ReturnType<typeof setInterval> | undefined;
  let refs = 0;
  let enabled = true;

  function set(next: CurrentBGData) {
    data = next;
    listeners.forEach((l) => { l(); });
  }

  async function poll() {
    if (!enabled) {
      set({ ...EMPTY, loading: false });
      return;
    }

    try {
      const res = await fetch("/api/bg");
      if (!res.ok) {
        set({ ...data, loading: false });
        return;
      }
      const json = (await res.json()) as {
        current?: { mmol: number; arrow?: string; ts: number };
        trend?: { arrow?: string; slope?: number };
        readings?: BGReading[];
      };

      const readings: BGReading[] = json.readings ?? [];

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
    setEnabled: (value: boolean) => {
      enabled = value;
      if (!enabled && interval) {
        set({ ...EMPTY, loading: false });
      } else if (enabled && refs > 0 && !interval) {
        void poll();
        interval = setInterval(() => { void poll(); }, POLL_INTERVAL);
      }
    },
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      // Start polling when first subscriber arrives
      refs++;
      if (refs === 1 && enabled) {
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
  const sugarMode = useAtomValue(sugarModeAtom);

  // Update store based on sugar mode
  store.setEnabled(sugarMode);

  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => EMPTY);
}
