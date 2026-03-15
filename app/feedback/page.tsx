"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";

interface FeedbackResponse {
  createdAt: number;
  rating: string | null;
  comment: string | null;
  carbsG: number | null;
  distance?: number;
  duration?: number;
  avgHr?: number;
  activityId: string;
  prescribedCarbsG?: number;
  preRunCarbsG?: number | null;
}

interface FetchResult {
  data: FeedbackResponse | null;
  waitingForSync: boolean;
}

async function fetchFeedback(url: string): Promise<FetchResult> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { retry?: boolean };
    if (body.retry) {
      return { data: null, waitingForSync: true };
    }
    throw new Error("Failed to load data");
  }
  const data = (await res.json()) as FeedbackResponse;
  return { data, waitingForSync: false };
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
      <div className="min-h-screen bg-[#13101c] flex items-center justify-center">
        <p className="text-[#af9ece]">Loading...</p>
      </div>
    }>
      <FeedbackContent />
    </Suspense>
  );
}

function FeedbackContent() {
  const searchParams = useSearchParams();
  const activityIdParam = searchParams.get("activityId");

  const fetchUrl = activityIdParam
    ? "/api/run-feedback?activityId=" + activityIdParam
    : "/api/run-feedback";

  // Form state — initialized from SWR data via onSuccess callback
  const [formState, setFormState] = useState<{
    rating: string | null;
    comment: string;
    carbsG: string;
    preRunCarbsG: string;
    prescribedCarbsG: number | null;
    activityId: string | null;
    submitted: boolean;
  }>({
    rating: null,
    comment: "",
    carbsG: "",
    preRunCarbsG: "",
    prescribedCarbsG: null,
    activityId: activityIdParam,
    submitted: false,
  });

  const { data: result, error: swrError, isLoading, mutate } = useSWR<FetchResult, Error>(
    fetchUrl,
    fetchFeedback,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      onSuccess: (fetchResult) => {
        const data = fetchResult.data;
        if (!data) return;
        setFormState({
          rating: data.rating,
          comment: data.comment ?? "",
          carbsG: data.carbsG != null ? String(data.carbsG) : (data.prescribedCarbsG != null && !data.rating ? String(data.prescribedCarbsG) : ""),
          preRunCarbsG: data.preRunCarbsG != null ? String(data.preRunCarbsG) : "",
          prescribedCarbsG: data.prescribedCarbsG ?? null,
          activityId: data.activityId,
          submitted: !!data.rating,
        });
      },
    },
  );

  const feedback = result?.data ?? null;
  const waitingForSync = result?.waitingForSync ?? false;

  interface FeedbackSubmission {
    activityId: string;
    rating: string;
    comment?: string;
    carbsG?: number;
    preRunCarbsG?: number;
  }

  const { trigger: submitFeedback, isMutating: submitting, error: submitMutationError } = useSWRMutation<
    unknown,
    Error,
    string,
    FeedbackSubmission
  >(
    "run-feedback-submit",
    async (_key, { arg }) => {
      const res = await fetch("/api/run-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(arg),
      });
      if (!res.ok) throw new Error("Failed to save");
    },
  );

  const submitError = submitMutationError?.message ?? null;

  const handleSubmit = () => {
    if (!formState.activityId || !formState.rating) return;
    void submitFeedback({
      activityId: formState.activityId,
      rating: formState.rating,
      comment: formState.comment || undefined,
      carbsG: formState.carbsG ? Number(formState.carbsG) : undefined,
      preRunCarbsG: formState.preRunCarbsG ? Number(formState.preRunCarbsG) : undefined,
    }).then(() => {
      setFormState((s) => ({ ...s, submitted: true }));
    }).catch(() => {
      // Error state is handled by useSWRMutation via submitMutationError
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#13101c] flex items-center justify-center">
        <p className="text-[#af9ece]">Loading...</p>
      </div>
    );
  }

  if (waitingForSync) {
    return (
      <div className="min-h-screen bg-[#13101c] flex flex-col items-center justify-center p-4 gap-4">
        <p className="text-[#af9ece]">Waiting for your run to sync from Garmin...</p>
        <button
          onClick={() => { void mutate(); }}
          disabled={isLoading}
          className="px-5 py-2.5 text-sm font-bold text-[#f23b94] border border-[#f23b94]/30 rounded-lg bg-[#f23b94]/10 hover:bg-[#f23b94]/20 transition disabled:opacity-40"
        >
          Try again
        </button>
      </div>
    );
  }

  if (swrError && !feedback) {
    return (
      <div className="min-h-screen bg-[#13101c] flex items-center justify-center p-4">
        <p className="text-[#ff3366]">{swrError.message}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#13101c] flex flex-col items-center p-4 pt-12">
      <h1 className="text-2xl font-bold text-white mb-6">How was the run?</h1>

      {/* Run summary */}
      {feedback && (
        <div className="flex gap-3 mb-8 flex-wrap justify-center">
          {feedback.distance != null && (
            <div className="bg-[#1d1828] border border-[#2e293c] rounded-xl px-4 py-3 text-center">
              <p className="text-xs text-[#af9ece]">Distance</p>
              <p className="text-lg font-bold text-white">{formatDistance(feedback.distance)}</p>
            </div>
          )}
          {feedback.duration != null && (
            <div className="bg-[#1d1828] border border-[#2e293c] rounded-xl px-4 py-3 text-center">
              <p className="text-xs text-[#af9ece]">Time</p>
              <p className="text-lg font-bold text-white">{formatDuration(feedback.duration)}</p>
            </div>
          )}
          {feedback.avgHr != null && (
            <div className="bg-[#1d1828] border border-[#2e293c] rounded-xl px-4 py-3 text-center">
              <p className="text-xs text-[#af9ece]">Avg HR</p>
              <p className="text-lg font-bold text-white">{Math.round(feedback.avgHr)}</p>
            </div>
          )}
        </div>
      )}

      {formState.submitted ? (
        <div className="text-center">
          {formState.rating === "skipped" ? (
            <p className="text-[#af9ece] text-lg">Skipped</p>
          ) : (
            <>
              <p className="text-4xl mb-2">{formState.rating === "good" ? "\uD83D\uDC4D" : "\uD83D\uDC4E"}</p>
              <p className="text-[#39ff14] text-lg font-bold">Thanks!</p>
              {(formState.carbsG || formState.prescribedCarbsG) && (
                <p className="text-[#af9ece] text-sm mt-2">Carbs: {formState.carbsG || formState.prescribedCarbsG}g</p>
              )}
              {formState.preRunCarbsG && (
                <p className="text-[#af9ece] text-sm mt-1">Pre-run: {formState.preRunCarbsG}g</p>
              )}
              {formState.comment && (
                <p className="text-[#af9ece] text-sm mt-2">{formState.comment}</p>
              )}
              <Link
                href="/?tab=planner&adapt=true"
                className="inline-block mt-4 px-5 py-2.5 text-sm font-bold text-[#f23b94] border border-[#f23b94]/30 rounded-lg bg-[#f23b94]/10 hover:bg-[#f23b94]/20 transition"
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
              onClick={() => { setFormState((s) => ({ ...s, rating: "good" })); }}
              className={`text-5xl p-4 rounded-2xl border-2 transition ${
                formState.rating === "good"
                  ? "border-[#39ff14] bg-[#39ff14]/10"
                  : "border-[#2e293c] bg-[#1d1828]"
              }`}
            >
              {"\uD83D\uDC4D"}
            </button>
            <button
              onClick={() => { setFormState((s) => ({ ...s, rating: "bad" })); }}
              className={`text-5xl p-4 rounded-2xl border-2 transition ${
                formState.rating === "bad"
                  ? "border-[#ff3366] bg-[#ff3366]/10"
                  : "border-[#2e293c] bg-[#1d1828]"
              }`}
            >
              {"\uD83D\uDC4E"}
            </button>
          </div>

          {/* Carbs ingested */}
          <div className="w-full max-w-sm mb-4">
            <label className="block text-xs text-[#af9ece] mb-1">Carbs ingested (g)</label>
            <input
              type="number"
              inputMode="numeric"
              value={formState.carbsG}
              onChange={(e) => { setFormState((s) => ({ ...s, carbsG: e.target.value })); }}
              placeholder={formState.prescribedCarbsG != null ? `${formState.prescribedCarbsG} (prescribed)` : "e.g. 40"}
              className="w-full px-4 py-3 bg-[#1d1828] border border-[#2e293c] rounded-xl text-white placeholder:text-[#af9ece] focus:outline-none focus:ring-2 focus:ring-[#f23b94] text-sm"
            />
          </div>

          {/* Pre-run carbs */}
          <div className="w-full max-w-sm mb-4">
            <label className="block text-xs text-[#af9ece] mb-1">Pre-run carbs (g)</label>
            <input
              type="number"
              inputMode="numeric"
              value={formState.preRunCarbsG}
              onChange={(e) => { setFormState((s) => ({ ...s, preRunCarbsG: e.target.value })); }}
              placeholder="e.g. 25"
              className="w-full px-4 py-3 bg-[#1d1828] border border-[#2e293c] rounded-xl text-white placeholder:text-[#af9ece] focus:outline-none focus:ring-2 focus:ring-[#f23b94] text-sm"
            />
          </div>

          {/* Comment */}
          <textarea
            value={formState.comment}
            onChange={(e) => { setFormState((s) => ({ ...s, comment: e.target.value })); }}
            placeholder="Comment (optional)"
            rows={3}
            className="w-full max-w-sm px-4 py-3 bg-[#1d1828] border border-[#2e293c] rounded-xl text-white placeholder:text-[#af9ece] focus:outline-none focus:ring-2 focus:ring-[#f23b94] text-sm mb-4 resize-none"
          />

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!formState.rating || !formState.activityId || submitting}
            className="w-full max-w-sm py-3 bg-[#f23b94] text-white rounded-xl font-bold hover:bg-[#d42f7e] transition shadow-lg shadow-[#f23b94]/20 disabled:opacity-40"
          >
            {submitting ? "Saving..." : "Save"}
          </button>

          <button
            onClick={() => {
              if (!formState.activityId) {
                setFormState((s) => ({ ...s, rating: "skipped", submitted: true }));
                return;
              }
              void submitFeedback({
                activityId: formState.activityId,
                rating: "skipped",
              }).then(() => {
                setFormState((s) => ({ ...s, rating: "skipped", submitted: true }));
              }).catch(() => {
                // Error state is handled by useSWRMutation via submitMutationError
              });
            }}
            disabled={submitting}
            className="w-full max-w-sm py-2 mt-2 text-sm text-[#af9ece] hover:text-white transition disabled:opacity-40"
          >
            Skip
          </button>

          {submitError && <p className="text-[#ff3366] text-sm mt-3">{submitError}</p>}
        </>
      )}
    </div>
  );
}
