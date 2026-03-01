"use client";

import { useEffect, useRef, useState } from "react";
import type { CalendarEvent } from "@/lib/types";

interface UnratedRun {
  activityId: string;
  name: string;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Detect the most recent completed run (last 7 days) that hasn't been rated.
 * Calls POST /api/run-feedback/check with activity IDs from calendar events.
 */
export function useUnratedRun(events: CalendarEvent[]): UnratedRun | null {
  const [unrated, setUnrated] = useState<UnratedRun | null>(null);
  const checkedRef = useRef<string>("");

  useEffect(() => {
    const cutoff = Date.now() - SEVEN_DAYS_MS;
    const recentRuns = events.filter(
      (e): e is CalendarEvent & { activityId: string } =>
        e.type === "completed" &&
        typeof e.activityId === "string" &&
        e.date.getTime() >= cutoff,
    );

    if (recentRuns.length === 0) return;

    const activityIds = recentRuns.map((e) => e.activityId);
    const key = activityIds.slice().sort().join(",");
    if (key === checkedRef.current) return;
    checkedRef.current = key;

    void (async () => {
      try {
        const res = await fetch("/api/run-feedback/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activityIds }),
        });
        if (!res.ok) return;
        const { ratedIds } = (await res.json()) as { ratedIds: string[] };
        const ratedSet = new Set(ratedIds);

        const mostRecent = recentRuns
          .filter((e) => !ratedSet.has(e.activityId))
          .sort((a, b) => b.date.getTime() - a.date.getTime())
          .at(0);

        setUnrated(
          mostRecent
            ? { activityId: mostRecent.activityId, name: mostRecent.name }
            : null,
        );
      } catch {
        // Silently fail — banner just won't show
      }
    })();
  }, [events]);

  return unrated;
}
