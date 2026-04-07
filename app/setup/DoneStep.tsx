"use client";

import { useState } from "react";

interface DoneStepProps {
  onComplete: () => Promise<void>;
  generating?: boolean;
}

export function DoneStep({ onComplete, generating = false }: DoneStepProps) {
  const [completing, setCompleting] = useState(false);

  const handleComplete = async () => {
    setCompleting(true);
    await onComplete();
  };

  return (
    <div className="bg-surface rounded-xl border border-border p-6 shadow-lg">
      <div className="text-center">
        <div className="mx-auto mb-4 w-16 h-16 bg-gradient-to-br from-brand to-brand-hover rounded-full flex items-center justify-center">
          {generating ? (
            <div className="inline-block w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          ) : (
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <h2 className="text-2xl font-bold text-text mb-2">
          {generating ? "Building your training plan..." : "You\u2019re all set!"}
        </h2>
        <p className="text-muted mb-6">
          {generating ? "Generating workouts and syncing to Intervals.icu..." : "Your account is ready. Let\u2019s build your training plan."}
        </p>
      </div>

      <button
        onClick={() => { void handleComplete(); }}
        disabled={completing || generating}
        className="w-full py-3 bg-brand text-white rounded-lg font-bold hover:bg-brand-hover transition shadow-lg shadow-brand/20 disabled:opacity-50"
      >
        {completing ? "Setting up..." : "Get Started"}
      </button>
    </div>
  );
}
