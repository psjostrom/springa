"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { CalendarEvent } from "@/lib/types";
import type { RunBGContext } from "@/lib/runBGContext";
import { buildReportCard } from "@/lib/reportCard";

interface RunAnalysisProps {
  event: CalendarEvent;
  runBGContext?: RunBGContext | null;
}

export function RunAnalysis({ event, runBGContext }: RunAnalysisProps) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = useCallback(
    async (regenerate = false) => {
      if (!event.activityId) return;

      setLoading(true);
      setError(null);

      try {
        const reportCard = buildReportCard(event, runBGContext);

        const res = await fetch("/api/run-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            activityId: event.activityId,
            event,
            runBGContext,
            reportCard,
            regenerate,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        setAnalysis(data.analysis);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load analysis");
      } finally {
        setLoading(false);
      }
    },
    [event, runBGContext],
  );

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  if (!event.activityId) return null;
  if (!loading && !analysis && !error) return null;

  return (
    <div className="border-t border-[#3d2b5a] pt-3 mt-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-[#c4b5fd]">
          <Sparkles className="w-4 h-4" />
          Run Analysis
        </div>
        {analysis && !loading && (
          <button
            onClick={() => fetchAnalysis(true)}
            className="p-1 text-[#b8a5d4] hover:text-white transition-colors"
            aria-label="Regenerate analysis"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="bg-[#2a1f3d] rounded-lg px-4 py-3 space-y-2">
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-4 w-5/6 rounded" />
          <div className="skeleton h-4 w-4/6 rounded" />
          <div className="skeleton h-4 w-full rounded mt-3" />
          <div className="skeleton h-4 w-3/4 rounded" />
        </div>
      ) : error ? (
        <div className="text-sm text-[#b8a5d4] italic">{error}</div>
      ) : analysis ? (
        <div className="bg-[#2a1f3d] rounded-lg px-4 py-3 text-sm text-[#e2d9f3] leading-relaxed prose-analysis">
          <ReactMarkdown>{analysis}</ReactMarkdown>
        </div>
      ) : null}
    </div>
  );
}
