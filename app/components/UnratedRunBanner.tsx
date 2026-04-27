"use client";

import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { getNextUnratedRunBoundary, useUnratedRun } from "../hooks/useUnratedRun";
import { enrichedEventsAtom } from "../atoms";
import { Toast } from "./Toast";

export function UnratedRunBanner() {
  const events = useAtomValue(enrichedEventsAtom);
  const [now, setNow] = useState(() => Date.now());
  const [dismissedActivityId, setDismissedActivityId] = useState<string | null>(null);
  const unrated = useUnratedRun(events, now);

  useEffect(() => {
    const nextBoundary = getNextUnratedRunBoundary(events, now);
    if (nextBoundary == null) return;

    const timeoutId = setTimeout(() => {
      setNow(Date.now());
    }, Math.max(0, nextBoundary - now));

    return () => {
      clearTimeout(timeoutId);
    };
  }, [events, now]);

  if (!unrated || dismissedActivityId === unrated.activityId) return null;

  return (
    <Toast
      message={<><strong className="text-text font-medium">{unrated.name}</strong>{" "}— unrated</>}
      actionLabel="Rate"
      accent="success"
      actionHref={`/feedback?activityId=${unrated.activityId}`}
      onDismiss={() => { setDismissedActivityId(unrated.activityId); }}
    />
  );
}
