"use client";

import { useState } from "react";
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
  const [savedRating, setSavedRating] = useState<string | null>(null);
  const [savedComment, setSavedComment] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!event.activityId) return null;

  const rating = savedRating ?? event.rating;
  const comment = savedComment ?? event.feedbackComment;
  const hasRating = !!rating;

  const saveFeedback = async (r: string, c: string) => {
    setIsSaving(true);
    try {
      await fetch("/api/run-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityId: event.activityId, rating: r, comment: c || undefined }),
      });
      setSavedRating(r);
      setSavedComment(c);
    } catch {
      // silently fail
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="px-4 py-3">
      <div className="text-sm text-[#b8a5d4] mb-2">Feedback</div>
      {hasRating ? (
        <div className="flex items-center gap-2 text-sm text-white">
          <span className="text-lg">{rating === "good" ? "\ud83d\udc4d" : "\ud83d\udc4e"}</span>
          {comment && <span className="text-[#b8a5d4]">{comment}</span>}
        </div>
      ) : (
        <FeedbackForm
          key={event.id}
          onSave={(r, c) => { void saveFeedback(r, c); }}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}
