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
      <div className="bg-[#1d1828] border border-[#2e293c] rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg shadow-black/40 max-w-sm w-full">
        <p className="text-sm text-[#af9ece] flex-1 truncate">
          <span className="text-white font-medium">{unrated.name}</span>
          {" "}— unrated
        </p>
        <a
          href={`/feedback?activityId=${unrated.activityId}`}
          className="px-3 py-1.5 text-xs font-bold text-[#13101c] bg-[#4ade80] rounded-lg hover:bg-[#4ade80] transition flex-shrink-0"
        >
          Rate
        </a>
        <button
          onClick={() => { setDismissed(true); }}
          className="text-[#af9ece] hover:text-white text-lg leading-none flex-shrink-0"
          aria-label="Dismiss"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
