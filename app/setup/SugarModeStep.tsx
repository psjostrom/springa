"use client";

import { useState } from "react";

interface SugarModeStepProps {
  sugarMode: boolean;
  nightscoutUrl?: string;
  nightscoutSecret?: string;
  onNext: (data: { sugarMode: boolean; nightscoutUrl?: string; nightscoutSecret?: string }) => void;
  onSkip: () => void;
  onBack: () => void;
}

export function SugarModeStep({ sugarMode: initialMode, nightscoutUrl: initialUrl, nightscoutSecret: initialSecret, onNext, onSkip, onBack }: SugarModeStepProps) {
  const [sugarMode, setSugarMode] = useState(initialMode);
  const [nightscoutUrl, setNightscoutUrl] = useState(initialUrl ?? "");
  const [nightscoutSecret, setNightscoutSecret] = useState(initialSecret ?? "");
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);

  const handleValidate = async () => {
    if (!nightscoutUrl.trim() || !nightscoutSecret.trim()) {
      setError("Both URL and API secret are required");
      return;
    }

    setValidating(true);
    setError("");

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nightscoutUrl: nightscoutUrl.trim(),
          nightscoutSecret: nightscoutSecret.trim(),
          sugarMode: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error || "Connection failed");
        setConnected(false);
      } else {
        setConnected(true);
        setError("");
      }
    } catch (err) {
      setError("Network error");
      setConnected(false);
    } finally {
      setValidating(false);
    }
  };

  const handleNext = async () => {
    if (!sugarMode) {
      // Save sugarMode = false
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sugarMode: false }),
      });
      onNext({ sugarMode: false });
      return;
    }

    if (!connected) {
      setError("Please test the connection first");
      return;
    }

    onNext({
      sugarMode: true,
      nightscoutUrl: nightscoutUrl.trim(),
      nightscoutSecret: nightscoutSecret.trim(),
    });
  };

  return (
    <div className="bg-surface rounded-xl border border-border p-6 shadow-lg">
      <h2 className="text-2xl font-bold text-text mb-2">Diabetes Management</h2>
      <p className="text-muted mb-6">
        Do you manage type 1 diabetes? Enable sugar mode for CGM sync and BG tracking.
      </p>

      <div className="space-y-4">
        <div className="flex gap-3">
          <button
            onClick={() => setSugarMode(true)}
            className={`flex-1 py-3 rounded-lg border-2 font-semibold transition ${
              sugarMode
                ? "border-brand bg-brand/10 text-brand"
                : "border-border text-muted hover:border-brand hover:text-brand"
            }`}
          >
            Yes
          </button>
          <button
            onClick={() => setSugarMode(false)}
            className={`flex-1 py-3 rounded-lg border-2 font-semibold transition ${
              !sugarMode
                ? "border-brand bg-brand/10 text-brand"
                : "border-border text-muted hover:border-brand hover:text-brand"
            }`}
          >
            No
          </button>
        </div>

        {sugarMode && (
          <div className="space-y-3 mt-6">
            <div>
              <label className="block text-sm font-semibold text-muted mb-2">
                Nightscout URL
              </label>
              <input
                type="text"
                value={nightscoutUrl}
                onChange={(e) => {
                  setNightscoutUrl(e.target.value);
                  setError("");
                  setConnected(false);
                }}
                className="w-full px-4 py-3 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted"
                placeholder="https://your-site.herokuapp.com"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-muted mb-2">
                API Secret
              </label>
              <input
                type="password"
                value={nightscoutSecret}
                onChange={(e) => {
                  setNightscoutSecret(e.target.value);
                  setError("");
                  setConnected(false);
                }}
                className="w-full px-4 py-3 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted"
                placeholder="Your API secret"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleValidate}
                disabled={validating || !nightscoutUrl || !nightscoutSecret}
                className="px-4 py-2 bg-border border border-border rounded-lg text-sm text-brand hover:bg-border transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {validating ? "Testing..." : "Test Connection"}
              </button>
              {connected && !error && (
                <span className="text-sm text-success">✓ Connected</span>
              )}
              {error && (
                <span className="text-sm text-error">✗ {error}</span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={onBack}
          className="px-6 py-3 border border-border rounded-lg text-muted hover:text-text hover:bg-border transition"
        >
          Back
        </button>
        <button
          onClick={handleNext}
          className="flex-1 py-3 border border-border rounded-lg text-muted hover:text-text hover:bg-border transition"
        >
          {sugarMode ? "Next" : "Skip"}
        </button>
      </div>
    </div>
  );
}
