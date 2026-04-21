"use client";

import { useAtomValue } from "jotai";
import { paceSuggestionAtom } from "../atoms";
import { Toast } from "./Toast";

interface PaceSuggestionBannerProps {
  onNavigateToIntel: () => void;
  onDismiss: () => void;
}

export function PaceSuggestionBanner({ onNavigateToIntel, onDismiss }: PaceSuggestionBannerProps) {
  const suggestion = useAtomValue(paceSuggestionAtom);

  if (!suggestion) return null;

  const label = suggestion.direction === "improvement"
    ? "Pace update available"
    : "Pace adjustment suggested";

  return (
    <Toast
      message={<span className="text-text font-medium">{label}</span>}
      actionLabel="View"
      onAction={onNavigateToIntel}
      onDismiss={onDismiss}
    />
  );
}
