"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { RunFeedbackRecord } from "@/lib/feedbackDb";

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min + ":" + String(sec).padStart(2, "0");
}

function formatDistance(meters: number): string {
  return (meters / 1000).toFixed(1) + " km";
}

export default function FeedbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0d0a1a] flex items-center justify-center">
        <p className="text-[#b8a5d4]">Loading...</p>
      </div>
    }>
      <FeedbackContent />
    </Suspense>
  );
}

function FeedbackContent() {
  const searchParams = useSearchParams();
  const ts = searchParams.get("ts");

  const [feedback, setFeedback] = useState<RunFeedbackRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [carbsG, setCarbsG] = useState<string>("");
  const [prescribedCarbsG, setPrescribedCarbsG] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!ts) {
      setError("No run found");
      setLoading(false);
      return;
    }
    fetch("/api/run-feedback?ts=" + ts)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load data");
        return r.json();
      })
      .then((data: RunFeedbackRecord & { prescribedCarbsG?: number }) => {
        setFeedback(data);
        if (data.rating) {
          setRating(data.rating);
          setComment(data.comment ?? "");
          if (data.carbsG != null) setCarbsG(String(data.carbsG));
          setSubmitted(true);
        }
        if (data.prescribedCarbsG != null) {
          setPrescribedCarbsG(data.prescribedCarbsG);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [ts]);

  const handleSubmit = async () => {
    if (!ts || !rating) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/run-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ts: Number(ts), rating, comment: comment || undefined, carbsG: carbsG ? Number(carbsG) : prescribedCarbsG ?? undefined }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSubmitted(true);
    } catch {
      setError("Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0a1a] flex items-center justify-center">
        <p className="text-[#b8a5d4]">Loading...</p>
      </div>
    );
  }

  if (error && !feedback) {
    return (
      <div className="min-h-screen bg-[#0d0a1a] flex items-center justify-center p-4">
        <p className="text-[#ff3366]">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0a1a] flex flex-col items-center p-4 pt-12">
      <h1 className="text-2xl font-bold text-white mb-6">How was the run?</h1>

      {/* Run summary */}
      {feedback && (
        <div className="flex gap-3 mb-8 flex-wrap justify-center">
          {feedback.distance != null && (
            <div className="bg-[#1e1535] border border-[#3d2b5a] rounded-xl px-4 py-3 text-center">
              <p className="text-xs text-[#b8a5d4]">Distance</p>
              <p className="text-lg font-bold text-white">{formatDistance(feedback.distance)}</p>
            </div>
          )}
          {feedback.duration != null && (
            <div className="bg-[#1e1535] border border-[#3d2b5a] rounded-xl px-4 py-3 text-center">
              <p className="text-xs text-[#b8a5d4]">Time</p>
              <p className="text-lg font-bold text-white">{formatDuration(feedback.duration)}</p>
            </div>
          )}
          {feedback.avgHr != null && (
            <div className="bg-[#1e1535] border border-[#3d2b5a] rounded-xl px-4 py-3 text-center">
              <p className="text-xs text-[#b8a5d4]">Avg HR</p>
              <p className="text-lg font-bold text-white">{Math.round(feedback.avgHr)}</p>
            </div>
          )}
        </div>
      )}

      {submitted ? (
        <div className="text-center">
          {rating === "skipped" ? (
            <p className="text-[#b8a5d4] text-lg">Skipped</p>
          ) : (
            <>
              <p className="text-4xl mb-2">{rating === "good" ? "\uD83D\uDC4D" : "\uD83D\uDC4E"}</p>
              <p className="text-[#39ff14] text-lg font-bold">Thanks!</p>
              {(carbsG || prescribedCarbsG) && (
                <p className="text-[#b8a5d4] text-sm mt-2">Carbs: {carbsG || prescribedCarbsG}g</p>
              )}
              {comment && (
                <p className="text-[#b8a5d4] text-sm mt-2">{comment}</p>
              )}
              <Link
                href="/?tab=planner&adapt=true"
                className="inline-block mt-4 px-5 py-2.5 text-sm font-bold text-[#00ffff] border border-[#00ffff]/30 rounded-lg bg-[#00ffff]/10 hover:bg-[#00ffff]/20 transition"
              >
                Adapt upcoming &rarr;
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Rating buttons */}
          <div className="flex gap-6 mb-6">
            <button
              onClick={() => setRating("good")}
              className={`text-5xl p-4 rounded-2xl border-2 transition ${
                rating === "good"
                  ? "border-[#39ff14] bg-[#39ff14]/10"
                  : "border-[#3d2b5a] bg-[#1e1535]"
              }`}
            >
              {"\uD83D\uDC4D"}
            </button>
            <button
              onClick={() => setRating("bad")}
              className={`text-5xl p-4 rounded-2xl border-2 transition ${
                rating === "bad"
                  ? "border-[#ff3366] bg-[#ff3366]/10"
                  : "border-[#3d2b5a] bg-[#1e1535]"
              }`}
            >
              {"\uD83D\uDC4E"}
            </button>
          </div>

          {/* Carbs ingested */}
          <div className="w-full max-w-sm mb-4">
            <label className="block text-xs text-[#b8a5d4] mb-1">Carbs ingested (g)</label>
            <input
              type="number"
              inputMode="numeric"
              value={carbsG}
              onChange={(e) => setCarbsG(e.target.value)}
              placeholder={prescribedCarbsG != null ? `${prescribedCarbsG} (prescribed)` : "e.g. 40"}
              className="w-full px-4 py-3 bg-[#1e1535] border border-[#3d2b5a] rounded-xl text-white placeholder:text-[#b8a5d4] focus:outline-none focus:ring-2 focus:ring-[#ff2d95] text-sm"
            />
          </div>

          {/* Comment */}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Comment (optional)"
            rows={3}
            className="w-full max-w-sm px-4 py-3 bg-[#1e1535] border border-[#3d2b5a] rounded-xl text-white placeholder:text-[#b8a5d4] focus:outline-none focus:ring-2 focus:ring-[#ff2d95] text-sm mb-4 resize-none"
          />

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!rating || submitting}
            className="w-full max-w-sm py-3 bg-[#ff2d95] text-white rounded-xl font-bold hover:bg-[#e0207a] transition shadow-lg shadow-[#ff2d95]/20 disabled:opacity-40"
          >
            {submitting ? "Saving..." : "Save"}
          </button>

          <button
            onClick={async () => {
              if (!ts) return;
              setSubmitting(true);
              try {
                const res = await fetch("/api/run-feedback", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ts: Number(ts), rating: "skipped" }),
                });
                if (!res.ok) throw new Error("Failed to save");
                setRating("skipped");
                setSubmitted(true);
              } catch {
                setError("Failed to save");
              } finally {
                setSubmitting(false);
              }
            }}
            disabled={submitting}
            className="w-full max-w-sm py-2 mt-2 text-sm text-[#b8a5d4] hover:text-white transition"
          >
            Skip
          </button>

          {error && <p className="text-[#ff3366] text-sm mt-3">{error}</p>}
        </>
      )}
    </div>
  );
}
