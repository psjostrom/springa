"use client";

import { useState } from "react";
import { useSetAtom } from "jotai";
import { patchCalendarEventAtom } from "../atoms";
import type { WidgetProps } from "@/lib/modalWidgets";

function FeedbackForm({ onSave, isSaving }: { onSave: (rating: string, comment: string) => void; isSaving: boolean }) {
  const [rating, setRating] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => { setRating("good"); }}
          className={`text-xl px-2 py-1 rounded transition ${rating === "good" ? "bg-[#3d2b5a] ring-1 ring-[#ff2d95]" : "hover:bg-[#2a1f3d]"}`}
        >
          {"\ud83d\udc4d"}
        </button>
        <button
          onClick={() => { setRating("bad"); }}
          className={`text-xl px-2 py-1 rounded transition ${rating === "bad" ? "bg-[#3d2b5a] ring-1 ring-[#ff2d95]" : "hover:bg-[#2a1f3d]"}`}
        >
          {"\ud83d\udc4e"}
        </button>
      </div>
      <textarea
        value={comment}
        onChange={(e) => { setComment(e.target.value); }}
        placeholder="Optional comment..."
        rows={2}
        className="w-full border border-[#3d2b5a] bg-[#1a1030] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff2d95] resize-none"
      />
      <button
        onClick={() => { if (rating) onSave(rating, comment); }}
        disabled={!rating || isSaving}
        className="px-3 py-1.5 text-sm bg-[#ff2d95] hover:bg-[#e0207a] text-white rounded-lg transition disabled:opacity-50"
      >
        {isSaving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}

/** Feedback widget: shows saved rating or a form to submit one. */
export function FeedbackWidget({ event }: WidgetProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const patchEvent = useSetAtom(patchCalendarEventAtom);

  if (!event.activityId) return null;

  const hasRating = !!event.rating;

  const saveFeedback = async (r: string, c: string) => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/run-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityId: event.activityId, rating: r, comment: c || undefined }),
      });
      if (!res.ok) throw new Error(`Feedback save failed (${res.status})`);
      patchEvent({ id: event.id, patch: { rating: r, feedbackComment: c || null } });
    } catch (err) {
      console.error("Failed to save feedback:", err);
      setSaveError("Save failed");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="px-3 py-2.5">
      {hasRating ? (
        <div className="flex items-center gap-2 text-sm text-white">
          <span className="text-lg">{event.rating === "good" ? "\ud83d\udc4d" : "\ud83d\udc4e"}</span>
          {event.feedbackComment && <span className="text-[#b8a5d4]">{event.feedbackComment}</span>}
        </div>
      ) : (
        <>
          <FeedbackForm
            key={event.id}
            onSave={(r, c) => { void saveFeedback(r, c); }}
            isSaving={isSaving}
          />
          {saveError && <div className="text-xs text-red-400 mt-1">{saveError}</div>}
        </>
      )}
    </div>
  );
}
