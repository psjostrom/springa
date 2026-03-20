"use client";

import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import { RefreshCw, Sparkles, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { CalendarEvent } from "@/lib/types";
import type { RunBGContext } from "@/lib/runBGContext";
import { summarizeBGModel } from "@/lib/bgModel";
import type { BGResponseModel } from "@/lib/bgModel";
import { buildReportCard } from "@/lib/reportCard";

interface RunAnalysisProps {
  event: CalendarEvent;
  runBGContext?: RunBGContext | null;
  bgModel?: BGResponseModel | null;
  isLoadingStreamData?: boolean;
}

interface AnalysisRequest {
  activityId: string;
  event: CalendarEvent;
  runBGContext: RunBGContext | null | undefined;
  bgModel: BGResponseModel | null | undefined;
  regenerate: boolean;
}

async function fetchAnalysisApi(request: AnalysisRequest): Promise<string> {
  const { activityId, event, runBGContext, bgModel, regenerate } = request;
  const reportCard = buildReportCard(event, runBGContext);

  const res = await fetch("/api/run-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      activityId,
      event,
      runBGContext,
      reportCard,
      bgModelSummary: bgModel ? summarizeBGModel(bgModel) : undefined,
      regenerate,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }

  const data = await res.json() as { analysis: string };
  return data.analysis;
}

export function RunAnalysis({ event, runBGContext, bgModel, isLoadingStreamData }: RunAnalysisProps) {
  const activityId = event.activityId;
  const swrKey = activityId && !isLoadingStreamData ? ["run-analysis", activityId] as const : null;

  // Initial fetch — returns cached analysis or generates new one
  const { data: analysis, error, isLoading } = useSWR<string, Error>(
    swrKey,
    ([, id]: readonly [string, string]) => fetchAnalysisApi({ activityId: id, event, runBGContext, bgModel, regenerate: false }),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000,
    },
  );

  // Regenerate mutation — same key, so it updates the useSWR cache automatically
  const { trigger, isMutating, error: mutationError } = useSWRMutation<string, Error, readonly [string, string] | null, AnalysisRequest>(
    swrKey,
    (_key, { arg }) => fetchAnalysisApi(arg),
    { populateCache: true, revalidate: false },
  );

  // Show either fetch error or mutation error
  const displayError = error ?? mutationError;

  if (!activityId) return null;

  // Show loading if stream data is loading OR analysis is loading OR regenerating
  const showLoading = (isLoadingStreamData ?? false) || isLoading || isMutating;
  if (!showLoading && !analysis && !displayError) return null;

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-muted">
          <Sparkles className="w-4 h-4" />
          Run Analysis
        </div>
        {analysis && !isLoading && activityId && (
          <button
            onClick={() => { void trigger({ activityId, event, runBGContext, bgModel, regenerate: true }).catch(() => { /* Error state handled by useSWRMutation */ }); }}
            disabled={isMutating}
            className="p-1 text-muted hover:text-text transition-colors disabled:opacity-50"
            aria-label="Regenerate analysis"
          >
            {isMutating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>

      {showLoading ? (
        <div className="space-y-2">
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-4 w-5/6 rounded" />
          <div className="skeleton h-4 w-4/6 rounded" />
          <div className="skeleton h-4 w-full rounded mt-3" />
          <div className="skeleton h-4 w-3/4 rounded" />
        </div>
      ) : displayError ? (
        <div className="text-sm text-error italic">
          {displayError instanceof Error ? displayError.message : "Failed to load analysis"}
        </div>
      ) : analysis ? (
        <div className="text-sm text-muted leading-relaxed prose-analysis">
          <ReactMarkdown>{analysis}</ReactMarkdown>
        </div>
      ) : null}
    </div>
  );
}
