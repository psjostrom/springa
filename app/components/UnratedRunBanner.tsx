"use client";

import { useState } from "react";
import { useUnratedRun } from "../hooks/useUnratedRun";
import type { CalendarEvent } from "@/lib/types";

interface Props {
  events: CalendarEvent[];
}

export function UnratedRunBanner({ events }: Props) {
  const unrated = useUnratedRun(events);
  const [dismissed, setDismissed] = useState(false);

  if (!unrated || dismissed) return null;

  return (
    <div className="fixed bottom-14 md:bottom-4 left-0 right-0 z-40 flex justify-center px-4">
      <div className="bg-[#1e1535] border border-[#3d2b5a] rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg shadow-black/40 max-w-sm w-full">
        <p className="text-sm text-[#b8a5d4] flex-1 truncate">
          <span className="text-white font-medium">{unrated.name}</span>
          {" "}— unrated
        </p>
        <a
          href={`/feedback?activityId=${unrated.activityId}`}
          className="px-3 py-1.5 text-xs font-bold text-[#0d0a1a] bg-[#39ff14] rounded-lg hover:bg-[#2dd610] transition flex-shrink-0"
        >
          Rate
        </a>
        <button
          onClick={() => { setDismissed(true); }}
          className="text-[#b8a5d4] hover:text-white text-lg leading-none flex-shrink-0"
          aria-label="Dismiss"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
