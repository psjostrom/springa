"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { RunFeedbackRecord } from "@/lib/feedbackDb";

/** API response merges feedback record with Intervals.icu activity data. */
interface FeedbackResponse extends RunFeedbackRecord {
  distance?: number;
  duration?: number;
  avgHr?: number;
  prescribedCarbsG?: number;
  preRunCarbsG?: number | null;
  preRunCarbsMin?: number | null;
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
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
  const activityIdParam = searchParams.get("activityId");

  const [feedback, setFeedback] = useState<FeedbackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [carbsG, setCarbsG] = useState<string>("");
  const [preRunCarbsG, setPreRunCarbsG] = useState<string>("");
  const [preRunCarbsMin, setPreRunCarbsMin] = useState<string>("");
  const [prescribedCarbsG, setPrescribedCarbsG] = useState<number | null>(null);
  const [activityId, setActivityId] = useState<string | null>(activityIdParam);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const fetchUrl = activityIdParam
    ? "/api/run-feedback?activityId=" + activityIdParam
    : ts
      ? "/api/run-feedback?ts=" + ts
      : null;

  const loadFeedback = useCallback(async (url: string) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error("Failed to load data");
    const data = (await r.json()) as FeedbackResponse;
    setFeedback(data);
    if (data.activityId) setActivityId(data.activityId);
    if (data.rating) {
      setRating(data.rating);
      setComment(data.comment ?? "");
      if (data.carbsG != null) setCarbsG(String(data.carbsG));
      setSubmitted(true);
    }
    if (data.preRunCarbsG != null) setPreRunCarbsG(String(data.preRunCarbsG));
    if (data.preRunCarbsMin != null) setPreRunCarbsMin(String(data.preRunCarbsMin));
    if (data.prescribedCarbsG != null) {
      setPrescribedCarbsG(data.prescribedCarbsG);
      if (!data.rating && data.carbsG == null) {
        setCarbsG(String(data.prescribedCarbsG));
      }
    }
  }, []);

  useEffect(() => {
    if (!fetchUrl) {
      setError("No run found");
      setLoading(false);
      return;
    }
    loadFeedback(fetchUrl)
      .catch((e: unknown) => { setError(e instanceof Error ? e.message : "Unknown error"); })
      .finally(() => { setLoading(false); });
  }, [fetchUrl, loadFeedback]);

  const handleRetry = async () => {
    if (!ts) return;
    setRetrying(true);
    try {
      await loadFeedback("/api/run-feedback?ts=" + ts);
    } catch {
      // Still no activity — that's fine, user can retry again
    } finally {
      setRetrying(false);
    }
  };

  const handleSubmit = async () => {
    const key = activityIdParam ?? ts;
    if (!key || !rating) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/run-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ts: activityIdParam ? feedback?.createdAt : Number(ts),
          rating,
          comment: comment || undefined,
          carbsG: carbsG ? Number(carbsG) : undefined,
          preRunCarbsG: preRunCarbsG ? Number(preRunCarbsG) : undefined,
          preRunCarbsMin: preRunCarbsMin ? Number(preRunCarbsMin) : undefined,
          activityId: activityId ?? undefined,
        }),
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

      {/* Activity not synced — retry or dismiss */}
      {!activityId && !submitted && (
        <div className="text-center mb-4 max-w-sm">
          <p className="text-[#fbbf24] text-xs mb-3">
            Waiting for Garmin to sync. Try again in a minute, or rate later from the app.
          </p>
          <button
            onClick={() => { void handleRetry(); }}
            disabled={retrying}
            className="px-4 py-2 text-sm font-medium text-[#00ffff] border border-[#00ffff]/30 rounded-lg bg-[#00ffff]/10 hover:bg-[#00ffff]/20 transition disabled:opacity-40"
          >
            {retrying ? "Checking..." : "Retry"}
          </button>
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
              {preRunCarbsG && (
                <p className="text-[#b8a5d4] text-sm mt-1">Pre-run: {preRunCarbsG}g{preRunCarbsMin ? `, ${preRunCarbsMin} min before` : ""}</p>
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
              onClick={() => { setRating("good"); }}
              className={`text-5xl p-4 rounded-2xl border-2 transition ${
                rating === "good"
                  ? "border-[#39ff14] bg-[#39ff14]/10"
                  : "border-[#3d2b5a] bg-[#1e1535]"
              }`}
            >
              {"\uD83D\uDC4D"}
            </button>
            <button
              onClick={() => { setRating("bad"); }}
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
              onChange={(e) => { setCarbsG(e.target.value); }}
              placeholder={prescribedCarbsG != null ? `${prescribedCarbsG} (prescribed)` : "e.g. 40"}
              className="w-full px-4 py-3 bg-[#1e1535] border border-[#3d2b5a] rounded-xl text-white placeholder:text-[#b8a5d4] focus:outline-none focus:ring-2 focus:ring-[#ff2d95] text-sm"
            />
          </div>

          {/* Pre-run carbs */}
          <div className="w-full max-w-sm mb-4 flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-[#b8a5d4] mb-1">Pre-run carbs (g)</label>
              <input
                type="number"
                inputMode="numeric"
                value={preRunCarbsG}
                onChange={(e) => { setPreRunCarbsG(e.target.value); }}
                placeholder="e.g. 25"
                className="w-full px-4 py-3 bg-[#1e1535] border border-[#3d2b5a] rounded-xl text-white placeholder:text-[#b8a5d4] focus:outline-none focus:ring-2 focus:ring-[#ff2d95] text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-[#b8a5d4] mb-1">Min before run</label>
              <input
                type="number"
                inputMode="numeric"
                value={preRunCarbsMin}
                onChange={(e) => { setPreRunCarbsMin(e.target.value); }}
                placeholder="e.g. 20"
                className="w-full px-4 py-3 bg-[#1e1535] border border-[#3d2b5a] rounded-xl text-white placeholder:text-[#b8a5d4] focus:outline-none focus:ring-2 focus:ring-[#ff2d95] text-sm"
              />
            </div>
          </div>

          {/* Comment */}
          <textarea
            value={comment}
            onChange={(e) => { setComment(e.target.value); }}
            placeholder="Comment (optional)"
            rows={3}
            className="w-full max-w-sm px-4 py-3 bg-[#1e1535] border border-[#3d2b5a] rounded-xl text-white placeholder:text-[#b8a5d4] focus:outline-none focus:ring-2 focus:ring-[#ff2d95] text-sm mb-4 resize-none"
          />

          {/* Submit */}
          <button
            onClick={() => { void handleSubmit(); }}
            disabled={!rating || !activityId || submitting}
            className="w-full max-w-sm py-3 bg-[#ff2d95] text-white rounded-xl font-bold hover:bg-[#e0207a] transition shadow-lg shadow-[#ff2d95]/20 disabled:opacity-40"
          >
            {submitting ? "Saving..." : "Save"}
          </button>

          <button
            onClick={() => {
              if (!activityId) {
                // No activity synced yet — just dismiss without saving anything
                setRating("skipped");
                setSubmitted(true);
                return;
              }
              const key = activityIdParam ?? ts;
              if (!key) return;
              setSubmitting(true);
              void (async () => {
                try {
                  const res = await fetch("/api/run-feedback", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      ts: activityIdParam ? feedback?.createdAt : Number(ts),
                      rating: "skipped",
                      activityId,
                    }),
                  });
                  if (!res.ok) throw new Error("Failed to save");
                  setRating("skipped");
                  setSubmitted(true);
                } catch {
                  setError("Failed to save");
                } finally {
                  setSubmitting(false);
                }
              })();
            }}
            disabled={submitting}
            className="w-full max-w-sm py-2 mt-2 text-sm text-[#b8a5d4] hover:text-white transition disabled:opacity-40"
          >
            Skip
          </button>

          {error && <p className="text-[#ff3366] text-sm mt-3">{error}</p>}
        </>
      )}
    </div>
  );
}
