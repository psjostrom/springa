"use client";

import { useState } from "react";
import { useAtomValue } from "jotai";
import { useUnratedRun } from "../hooks/useUnratedRun";
import { enrichedEventsAtom } from "../atoms";

export function UnratedRunBanner() {
  const events = useAtomValue(enrichedEventsAtom);
  const unrated = useUnratedRun(events);
  const [dismissed, setDismissed] = useState(false);

  if (!unrated || dismissed) return null;

  return (
    <div className="fixed bottom-14 md:bottom-4 left-0 right-0 z-40 flex justify-center px-4">
      <div className="bg-surface border border-border rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg shadow-black/40 max-w-sm w-full">
        <p className="text-sm text-muted flex-1 truncate">
          <span className="text-text font-medium">{unrated.name}</span>
          {" "}— unrated
        </p>
        <a
          href={`/feedback?activityId=${unrated.activityId}`}
          className="px-3 py-1.5 text-xs font-bold text-bg bg-success rounded-lg hover:bg-success transition flex-shrink-0"
        >
          Rate
        </a>
        <button
          onClick={() => { setDismissed(true); }}
          className="text-muted hover:text-text text-lg leading-none flex-shrink-0"
          aria-label="Dismiss"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
