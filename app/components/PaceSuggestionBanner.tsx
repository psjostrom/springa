"use client";

import { useState } from "react";
import { useAtomValue } from "jotai";
import { paceSuggestionAtom } from "../atoms";

interface PaceSuggestionBannerProps {
  onNavigateToIntel: () => void;
}

export function PaceSuggestionBanner({ onNavigateToIntel }: PaceSuggestionBannerProps) {
  const suggestion = useAtomValue(paceSuggestionAtom);
  const [dismissed, setDismissed] = useState(false);

  if (!suggestion || dismissed) return null;

  const label = suggestion.direction === "improvement"
    ? "Pace update available"
    : "Pace adjustment suggested";

  return (
    <div className="fixed bottom-28 md:bottom-20 left-0 right-0 z-50 flex justify-center px-4">
      <div className="bg-surface border border-border rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg shadow-black/40 max-w-sm w-full">
        <p className="text-sm text-muted flex-1">
          <span className="text-text font-medium">{label}</span>
        </p>
        <button
          onClick={onNavigateToIntel}
          className="px-3 py-1.5 text-xs font-bold text-bg bg-brand rounded-lg hover:bg-brand/90 transition flex-shrink-0"
        >
          View
        </button>
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
