"use client";

import useSWR from "swr";
import { RefreshCw, Sparkles } from "lucide-react";
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

async function fetchAnalysis(
  activityId: string,
  event: CalendarEvent,
  runBGContext: RunBGContext | null | undefined,
  bgModel: BGResponseModel | null | undefined,
): Promise<string> {
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
      regenerate: false,
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

  // Wait for stream data before fetching analysis — ensures report card has full BG context
  const { data: analysis, error, isLoading, mutate } = useSWR<string, Error>(
    activityId && !isLoadingStreamData ? ["run-analysis", activityId] : null,
    ([, id]: [string, string]) => fetchAnalysis(id, event, runBGContext, bgModel),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000, // Dedupe requests within 60s
    },
  );

  const handleRegenerate = async () => {
    if (!activityId) return;

    const reportCard = buildReportCard(event, runBGContext);

    await mutate(
      async () => {
        const res = await fetch("/api/run-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            activityId,
            event,
            runBGContext,
            reportCard,
            bgModelSummary: bgModel ? summarizeBGModel(bgModel) : undefined,
            regenerate: true,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }

        const data = await res.json() as { analysis: string };
        return data.analysis;
      },
      { revalidate: false },
    );
  };

  if (!activityId) return null;

  // Show loading if stream data is loading OR analysis is loading
  const showLoading = (isLoadingStreamData ?? false) || isLoading;
  if (!showLoading && !analysis && !error) return null;

  return (
    <div className="border-t border-[#3d2b5a] pt-3 mt-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-[#c4b5fd]">
          <Sparkles className="w-4 h-4" />
          Run Analysis
        </div>
        {analysis && !showLoading && (
          <button
            onClick={() => { void handleRegenerate(); }}
            className="p-1 text-[#b8a5d4] hover:text-white transition-colors"
            aria-label="Regenerate analysis"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {showLoading ? (
        <div className="bg-[#2a1f3d] rounded-lg px-4 py-3 space-y-2">
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-4 w-5/6 rounded" />
          <div className="skeleton h-4 w-4/6 rounded" />
          <div className="skeleton h-4 w-full rounded mt-3" />
          <div className="skeleton h-4 w-3/4 rounded" />
        </div>
      ) : error ? (
        <div className="text-sm text-[#b8a5d4] italic">
          {error instanceof Error ? error.message : "Failed to load analysis"}
        </div>
      ) : analysis ? (
        <div className="bg-[#2a1f3d] rounded-lg px-4 py-3 text-sm text-[#e2d9f3] leading-relaxed prose-analysis">
          <ReactMarkdown>{analysis}</ReactMarkdown>
        </div>
      ) : null}
    </div>
  );
}
