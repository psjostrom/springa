"use client";

import { useState } from "react";

interface HRZonesStepProps {
  lthr?: number;
  maxHr?: number;
  hrZones?: number[];
  onNext: (zones: { lthr?: number; maxHr?: number; hrZones?: number[] }) => void;
  onSkip: () => void;
  onBack: () => void;
}

export function HRZonesStep({ lthr: initialLthr, maxHr: initialMaxHr, hrZones: initialZones, onNext, onSkip, onBack }: HRZonesStepProps) {
  const hasImportedZones = !!initialLthr || !!initialMaxHr || !!initialZones;
  const [useManual, setUseManual] = useState(!hasImportedZones);
  const [lthr, setLthr] = useState(initialLthr?.toString() ?? "");
  const [maxHr, setMaxHr] = useState(initialMaxHr?.toString() ?? "");

  const handleNext = async () => {
    if (!useManual && hasImportedZones) {
      // Use imported values
      onNext({ lthr: initialLthr, maxHr: initialMaxHr, hrZones: initialZones });
      return;
    }

    if (!useManual || (!lthr && !maxHr)) {
      // Skip if not using manual and no imported data
      onSkip();
      return;
    }

    const zones: { lthr?: number; maxHr?: number } = {};
    if (lthr) zones.lthr = Number(lthr);
    if (maxHr) zones.maxHr = Number(maxHr);

    // Save to backend (HR zones are computed from LTHR by Intervals.icu)
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(zones),
    });
    if (!res.ok) return;

    onNext(zones);
  };

  return (
    <div className="bg-surface rounded-xl border border-border p-6 shadow-lg">
      <h2 className="text-2xl font-bold text-text mb-2">Heart Rate Zones</h2>
      <p className="text-muted mb-6">
        {hasImportedZones
          ? "We imported your HR zones from Intervals.icu. You can use them or enter manually."
          : "Enter your heart rate zones if you know them. This helps with workout planning."}
      </p>

      <div className="space-y-4">
        {hasImportedZones && (
          <div className="bg-tint-success border border-success/20 rounded-lg p-4 space-y-2 text-sm">
            <p className="text-success font-semibold">✓ Imported from Intervals.icu</p>
            {initialLthr && (
              <p className="text-muted">
                <span className="text-text font-semibold">LTHR:</span> {initialLthr} bpm
              </p>
            )}
            {initialMaxHr && (
              <p className="text-muted">
                <span className="text-text font-semibold">Max HR:</span> {initialMaxHr} bpm
              </p>
            )}
            {initialZones && initialZones.length > 0 && (
              <p className="text-muted">
                <span className="text-text font-semibold">Zones:</span> {initialZones.join(", ")} bpm
              </p>
            )}
          </div>
        )}

        {hasImportedZones && (
          <div className="flex gap-3">
            <button
              onClick={() => setUseManual(false)}
              className={`flex-1 py-2 rounded-lg border-2 font-semibold text-sm transition ${
                !useManual
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border text-muted hover:border-brand hover:text-brand"
              }`}
            >
              Use imported
            </button>
            <button
              onClick={() => setUseManual(true)}
              className={`flex-1 py-2 rounded-lg border-2 font-semibold text-sm transition ${
                useManual
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border text-muted hover:border-brand hover:text-brand"
              }`}
            >
              Enter manually
            </button>
          </div>
        )}

        {useManual && (
          <div className="space-y-3 mt-4">
            <div>
              <label className="block text-sm font-semibold text-muted mb-2">
                Lactate Threshold HR (LTHR)
              </label>
              <input
                type="number"
                min={100}
                max={220}
                value={lthr}
                onChange={(e) => setLthr(e.target.value)}
                className="w-full px-4 py-3 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted"
                placeholder="e.g. 165"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-muted mb-2">
                Max HR
              </label>
              <input
                type="number"
                min={100}
                max={220}
                value={maxHr}
                onChange={(e) => setMaxHr(e.target.value)}
                className="w-full px-4 py-3 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted"
                placeholder="e.g. 190"
              />
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
          {(hasImportedZones && !useManual) || (useManual && (lthr || maxHr)) ? "Next" : "Skip"}
        </button>
      </div>
    </div>
  );
}
