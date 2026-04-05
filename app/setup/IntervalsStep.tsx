"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";

interface IntervalsStepProps {
  onNext: (apiKey: string, profile: { lthr?: number; maxHr?: number; hrZones?: number[] }) => void;
  onBack: () => void;
}

export function IntervalsStep({ onNext, onBack }: IntervalsStepProps) {
  const [apiKey, setApiKey] = useState("");
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState("");

  const handleNext = async () => {
    if (!apiKey.trim()) return;

    setValidating(true);
    setError("");

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intervalsApiKey: apiKey.trim() }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Invalid API key");
        setValidating(false);
        return;
      }

      // Fetch the profile to get HR zones
      const settingsRes = await fetch("/api/settings");
      const settings = await settingsRes.json() as { lthr?: number; maxHr?: number; hrZones?: number[] };

      onNext(apiKey.trim(), {
        lthr: settings.lthr,
        maxHr: settings.maxHr,
        hrZones: settings.hrZones,
      });
    } catch {
      setError("Network error");
      setValidating(false);
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-border p-6 shadow-lg">
      <h2 className="text-2xl font-bold text-text mb-2">Connect Your Watch</h2>
      <p className="text-muted mb-6">
        Springa syncs workouts to your Garmin watch via Intervals.icu.
      </p>

      <div className="space-y-4">
        <div className="bg-surface-alt border border-border rounded-lg p-4 space-y-3 text-sm">
          <p className="text-muted">
            <strong className="text-text">Step 1:</strong> Create a free Intervals.icu account
          </p>
          <a
            href="https://intervals.icu"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-brand hover:underline"
          >
            <ExternalLink size={14} />
            intervals.icu
          </a>

          <p className="text-muted mt-4">
            <strong className="text-text">Step 2:</strong> Get your API key
          </p>
          <a
            href="https://intervals.icu/settings"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-brand hover:underline"
          >
            <ExternalLink size={14} />
            Settings → Developer Settings → API Key
          </a>
        </div>

        <div>
          <label className="block text-sm font-semibold text-muted mb-2">
            Intervals.icu API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setError("");
            }}
            className="w-full px-4 py-3 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted font-mono text-sm"
            placeholder="Paste your API key here"
          />
          {error && (
            <p className="text-sm text-error mt-2">✗ {error}</p>
          )}
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={onBack}
          className="px-6 py-3 border border-border rounded-lg text-muted hover:text-text hover:bg-border transition"
        >
          Back
        </button>
        <button
          onClick={() => { void handleNext(); }}
          disabled={!apiKey.trim() || validating}
          className="flex-1 py-3 bg-brand text-white rounded-lg font-bold hover:bg-brand-hover transition shadow-lg shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {validating ? "Validating..." : "Next"}
        </button>
      </div>
    </div>
  );
}
