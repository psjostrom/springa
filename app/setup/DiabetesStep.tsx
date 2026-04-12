"use client";

import { useState } from "react";

interface DiabetesStepProps {
  diabetesMode: boolean;
  nightscoutUrl?: string;
  nightscoutSecret?: string;
  onNext: (data: { diabetesMode: boolean; nightscoutUrl?: string; nightscoutSecret?: string }) => void;
  onBack: () => void;
}

export function DiabetesStep({ diabetesMode: initialMode, nightscoutUrl: initialUrl, nightscoutSecret: initialSecret, onNext, onBack }: DiabetesStepProps) {
  const [diabetesMode, setDiabetesMode] = useState(initialMode);
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
          diabetesMode: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Connection failed");
        setConnected(false);
      } else {
        setConnected(true);
        setError("");
      }
    } catch {
      setError("Network error");
      setConnected(false);
    } finally {
      setValidating(false);
    }
  };

  const handleNext = async () => {
    if (!diabetesMode) {
      // Save diabetesMode = false
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diabetesMode: false }),
      });
      onNext({ diabetesMode: false });
      return;
    }

    if (!connected) {
      setError("Please test the connection first");
      return;
    }

    onNext({
      diabetesMode: true,
      nightscoutUrl: nightscoutUrl.trim(),
      nightscoutSecret: nightscoutSecret.trim(),
    });
  };

  return (
    <div className="bg-surface rounded-xl border border-border p-6 shadow-lg">
      <h2 className="text-2xl font-bold text-text mb-2">Do you use Nightscout to track your blood glucose?</h2>
      <p className="text-muted mb-6">
        If you have a continuous glucose monitor connected to Nightscout, Springa can track your BG during runs, learn your fuel needs, and help you avoid lows and spikes.
      </p>

      <div className="space-y-4">
        <div className="flex gap-3">
          <button
            onClick={() => { setDiabetesMode(true); }}
            className={`flex-1 py-3 rounded-lg border-2 font-semibold transition ${
              diabetesMode
                ? "border-brand bg-brand/10 text-brand"
                : "border-border text-muted hover:border-brand hover:text-brand"
            }`}
          >
            Yes
          </button>
          <button
            onClick={() => { setDiabetesMode(false); }}
            className={`flex-1 py-3 rounded-lg border-2 font-semibold transition ${
              !diabetesMode
                ? "border-brand bg-brand/10 text-brand"
                : "border-border text-muted hover:border-brand hover:text-brand"
            }`}
          >
            No
          </button>
        </div>

        {diabetesMode && (
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
                onClick={() => { void handleValidate(); }}
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
          onClick={() => { void handleNext(); }}
          className="flex-1 py-3 bg-brand text-white rounded-lg font-bold hover:bg-brand-hover transition shadow-lg shadow-brand/20"
        >
          Next
        </button>
      </div>
    </div>
  );
}
