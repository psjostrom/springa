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
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <p className="text-muted">Loading...</p>
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
          carbsG: data.carbsG != null ? String(data.carbsG) : "",
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
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  if (waitingForSync) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-4 gap-4">
        <p className="text-muted">Waiting for your run to sync from Garmin...</p>
        <button
          onClick={() => { void mutate(); }}
          disabled={isLoading}
          className="px-5 py-2.5 text-sm font-bold text-brand border border-brand/30 rounded-lg bg-brand/10 hover:bg-brand/20 transition disabled:opacity-40"
        >
          Try again
        </button>
      </div>
    );
  }

  if (swrError && !feedback) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <p className="text-error">{swrError.message}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center p-4 pt-12">
      <h1 className="text-2xl font-bold text-text mb-6">How was the run?</h1>

      {/* Run summary */}
      {feedback && (
        <div className="flex gap-3 mb-8 flex-wrap justify-center">
          {feedback.distance != null && (
            <div className="bg-surface border border-border rounded-xl px-4 py-3 text-center">
              <p className="text-xs text-muted uppercase tracking-wider font-semibold">Distance</p>
              <p className="text-lg font-bold text-text">{formatDistance(feedback.distance)}</p>
            </div>
          )}
          {feedback.duration != null && (
            <div className="bg-surface border border-border rounded-xl px-4 py-3 text-center">
              <p className="text-xs text-muted uppercase tracking-wider font-semibold">Time</p>
              <p className="text-lg font-bold text-text">{formatDuration(feedback.duration)}</p>
            </div>
          )}
          {feedback.avgHr != null && (
            <div className="bg-surface border border-border rounded-xl px-4 py-3 text-center">
              <p className="text-xs text-muted uppercase tracking-wider font-semibold">Avg HR</p>
              <p className="text-lg font-bold text-text">{Math.round(feedback.avgHr)}</p>
            </div>
          )}
        </div>
      )}

      {formState.submitted ? (
        <div className="text-center">
          {formState.rating === "skipped" ? (
            <p className="text-muted text-lg">Skipped</p>
          ) : (
            <>
              <p className="text-4xl mb-2">{formState.rating === "good" ? "\uD83D\uDC4D" : "\uD83D\uDC4E"}</p>
              <p className="text-success text-lg font-bold">Thanks!</p>
              {formState.carbsG && (
                <p className="text-muted text-sm mt-2">Carbs ingested: {formState.carbsG}g</p>
              )}
              {formState.prescribedCarbsG != null && (
                <p className="text-muted text-sm mt-1">Prescribed: {formState.prescribedCarbsG}g</p>
              )}
              {formState.preRunCarbsG && (
                <p className="text-muted text-sm mt-1">Pre-run: {formState.preRunCarbsG}g</p>
              )}
              {formState.comment && (
                <p className="text-muted text-sm mt-2">{formState.comment}</p>
              )}
              <Link
                href="/?tab=planner&adapt=true"
                className="inline-block mt-4 px-5 py-2.5 text-sm font-bold text-brand border border-brand/30 rounded-lg bg-brand/10 hover:bg-brand/20 transition"
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
                  ? "border-success bg-success/10"
                  : "border-border bg-surface"
              }`}
            >
              {"\uD83D\uDC4D"}
            </button>
            <button
              onClick={() => { setFormState((s) => ({ ...s, rating: "bad" })); }}
              className={`text-5xl p-4 rounded-2xl border-2 transition ${
                formState.rating === "bad"
                  ? "border-error bg-error/10"
                  : "border-border bg-surface"
              }`}
            >
              {"\uD83D\uDC4E"}
            </button>
          </div>

          {/* Carbs ingested */}
          <div className="w-full max-w-sm mb-4">
            <div className="flex items-center justify-between gap-3 mb-1">
              <label className="block text-xs text-muted uppercase tracking-wider font-semibold">Carbs ingested (g)</label>
              {formState.prescribedCarbsG != null && (
                <button
                  type="button"
                  onClick={() => {
                    setFormState((s) => ({ ...s, carbsG: String(s.prescribedCarbsG ?? "") }));
                  }}
                  className="text-xs font-semibold text-brand hover:text-brand-hover transition"
                >
                  Use prescribed
                </button>
              )}
            </div>
            {formState.prescribedCarbsG != null && (
              <p className="text-xs text-muted mb-2">Prescribed: {formState.prescribedCarbsG}g</p>
            )}
            <input
              type="number"
              inputMode="numeric"
              value={formState.carbsG}
              onChange={(e) => { setFormState((s) => ({ ...s, carbsG: e.target.value })); }}
              placeholder="e.g. 40"
              className="w-full px-4 py-3 bg-surface-alt border border-border rounded-xl text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand text-sm"
            />
          </div>

          {/* Pre-run carbs */}
          <div className="w-full max-w-sm mb-4">
            <label className="block text-xs text-muted uppercase tracking-wider font-semibold mb-1">Pre-run carbs (g)</label>
            <input
              type="number"
              inputMode="numeric"
              value={formState.preRunCarbsG}
              onChange={(e) => { setFormState((s) => ({ ...s, preRunCarbsG: e.target.value })); }}
              placeholder="e.g. 25"
              className="w-full px-4 py-3 bg-surface-alt border border-border rounded-xl text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand text-sm"
            />
          </div>

          {/* Comment */}
          <textarea
            value={formState.comment}
            onChange={(e) => { setFormState((s) => ({ ...s, comment: e.target.value })); }}
            placeholder="Comment (optional)"
            rows={3}
            className="w-full max-w-sm px-4 py-3 bg-surface-alt border border-border rounded-xl text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand text-sm mb-4 resize-none"
          />

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!formState.rating || !formState.activityId || submitting}
            className="w-full max-w-sm py-3 bg-brand text-white rounded-xl font-bold hover:bg-brand-hover transition shadow-lg shadow-brand/20 disabled:opacity-40"
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
            className="w-full max-w-sm py-2 mt-2 text-sm text-muted hover:text-text transition disabled:opacity-40"
          >
            Skip
          </button>

          {submitError && <p className="text-error text-sm mt-3">{submitError}</p>}
        </>
      )}
    </div>
  );
}
