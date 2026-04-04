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
      <p className="text-muted mb-6">Let's get you set up. This will take about 2 minutes.</p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-muted mb-2">
            What should we call you?
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
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
            onChange={(e) => setTimezone(e.target.value)}
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

      <button
        onClick={handleNext}
        disabled={!displayName.trim()}
        className="w-full mt-6 py-3 bg-brand text-white rounded-lg font-bold hover:bg-brand-hover transition shadow-lg shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next
      </button>
    </div>
  );
}
