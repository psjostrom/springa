"use client";

import { useState } from "react";
import { useAtomValue } from "jotai";
import { useUnratedRun } from "../hooks/useUnratedRun";
import { enrichedEventsAtom } from "../atoms";
import { Toast } from "./Toast";

export function UnratedRunBanner() {
  const events = useAtomValue(enrichedEventsAtom);
  const unrated = useUnratedRun(events);
  const [dismissedActivityId, setDismissedActivityId] = useState<string | null>(null);

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
