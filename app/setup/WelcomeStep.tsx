"use client";

import { useState } from "react";

interface WelcomeStepProps {
  displayName: string;
  timezone: string;
  onNext: (displayName: string, timezone: string) => void;
}

const TIMEZONES = [
  "Europe/Stockholm",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "America/Denver",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
];

export function WelcomeStep({ displayName: initialName, timezone: initialTz, onNext }: WelcomeStepProps) {
  const [displayName, setDisplayName] = useState(initialName);
  const [timezone, setTimezone] = useState(initialTz);

  const handleNext = async () => {
    if (!displayName.trim()) return;

    // Save to backend
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: displayName.trim(),
        timezone,
      }),
    });
    if (!res.ok) return;

    onNext(displayName.trim(), timezone);
  };

  return (
    <div className="bg-surface rounded-xl border border-border p-6 shadow-lg">
      <h1 className="text-2xl font-bold text-text mb-2">Welcome to Springa</h1>
      <p className="text-muted mb-6">Let&apos;s get you set up. This will take about 2 minutes.</p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-muted mb-2">
            What should we call you?
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => { setDisplayName(e.target.value); }}
            className="w-full px-4 py-3 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted"
            placeholder="Your name"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-muted mb-2">
            Timezone
          </label>
          <select
            value={timezone}
            onChange={(e) => { setTimezone(e.target.value); }}
            className="w-full px-4 py-3 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* What you'll need */}
      <div className="border-t border-border pt-4 mt-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">What you'll need</p>

        <div className="flex gap-3 items-start mb-3">
          <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0 text-base">⌚</div>
          <div>
            <p className="text-sm font-medium text-text">A GPS running watch</p>
            <p className="text-xs text-muted">Garmin · Polar · Suunto · Coros · Wahoo · Apple Watch · Wear OS</p>
          </div>
        </div>

        <div className="flex gap-3 items-start mb-3">
          <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0 text-xs font-bold text-brand">ICU</div>
          <div>
            <p className="text-sm font-medium text-text">A free Intervals.icu account</p>
            <p className="text-xs text-muted">Bridges your watch data to Springa. We'll set this up next.</p>
          </div>
        </div>

        <div className="flex gap-3 items-start">
          <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center flex-shrink-0 text-base">📈</div>
          <div>
            <p className="text-sm font-medium text-text">CGM + Nightscout <span className="text-xs text-muted font-normal">(optional)</span></p>
            <p className="text-xs text-muted">Use a continuous glucose monitor? Connect it for live BG tracking during runs, smart fuel rate recommendations, and post-run glucose analysis.</p>
          </div>
        </div>
      </div>

      <button
        onClick={() => { void handleNext(); }}
        disabled={!displayName.trim()}
        className="w-full mt-6 py-3 bg-brand text-white rounded-lg font-bold hover:bg-brand-hover transition shadow-lg shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next
      </button>
    </div>
  );
}
