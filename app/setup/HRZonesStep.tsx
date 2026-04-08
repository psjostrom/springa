"use client";

import { useState } from "react";
import { computeKarvonenZones } from "@/lib/constants";

interface HRZonesStepProps {
  lthr?: number;
  maxHr?: number;
  hrZones?: number[];
  restingHr?: number;
  sportSettingsId?: number;
  /** HM race pace in min/km — pushed to Intervals.icu as threshold pace for % pace workout targets. */
  thresholdPaceMinPerKm?: number;
  onNext: (zones: { lthr?: number; maxHr?: number; hrZones?: number[] }) => void;
  onSkip: () => void;
  onBack: () => void;
}

export function HRZonesStep({ lthr: initialLthr, maxHr: initialMaxHr, hrZones: initialZones, restingHr: initialRestingHr, sportSettingsId, thresholdPaceMinPerKm, onNext, onSkip, onBack }: HRZonesStepProps) {
  const has5Zones = initialZones?.length === 5;
  const hasImportedZones = has5Zones && (!!initialLthr || !!initialMaxHr);
  const needsRHR = !has5Zones && !!initialMaxHr;

  const [useManual, setUseManual] = useState(!hasImportedZones && !needsRHR);
  const [lthr, setLthr] = useState(initialLthr?.toString() ?? "");
  const [maxHr, setMaxHr] = useState(initialMaxHr?.toString() ?? "");
  const [restingHr, setRestingHr] = useState(initialRestingHr?.toString() ?? "");

  const pushZonesToIntervals = async (zones: number[], rhr: number) => {
    if (!sportSettingsId) return;
    await fetch("/api/intervals/hr-zones", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sportSettingsId, hrZones: zones, restingHr: rhr, thresholdPaceMinPerKm }),
    });
  };

  const handleNext = async () => {
    // Case 1: Use imported 5 zones as-is
    if (!useManual && hasImportedZones) {
      onNext({ lthr: initialLthr, maxHr: initialMaxHr, hrZones: initialZones });
      return;
    }

    // Case 2: Compute Karvonen from maxHR + RHR
    if (!useManual && needsRHR && initialMaxHr && restingHr) {
      const mhr = initialMaxHr;
      const rhr = Number(restingHr);
      const zones = computeKarvonenZones(mhr, rhr);
      const computedLthr = initialLthr ?? Math.round((mhr - rhr) * 0.85 + rhr);
      await pushZonesToIntervals(zones, rhr);
      onNext({ lthr: computedLthr, maxHr: mhr, hrZones: zones });
      return;
    }

    // Case 3: Manual entry
    if (useManual && maxHr && restingHr) {
      const mhr = Number(maxHr);
      const rhr = Number(restingHr);
      const zones = computeKarvonenZones(mhr, rhr);
      const computedLthr = lthr ? Number(lthr) : Math.round((mhr - rhr) * 0.85 + rhr);
      await pushZonesToIntervals(zones, rhr);
      onNext({ lthr: computedLthr, maxHr: mhr, hrZones: zones });
      return;
    }

    // No data — skip
    onSkip();
  };

  const canProceed = (!useManual && hasImportedZones)
    || (!useManual && needsRHR && !!restingHr)
    || (useManual && !!maxHr && !!restingHr);

  // Preview computed zones
  const previewZones = (() => {
    if (!useManual && needsRHR && restingHr && initialMaxHr) {
      return computeKarvonenZones(initialMaxHr, Number(restingHr));
    }
    if (useManual && maxHr && restingHr) {
      return computeKarvonenZones(Number(maxHr), Number(restingHr));
    }
    return null;
  })();

  return (
    <div className="bg-surface rounded-xl border border-border p-6 shadow-lg">
      <h2 className="text-2xl font-bold text-text mb-2">Heart Rate Zones</h2>
      <p className="text-muted mb-6">
        {hasImportedZones
          ? "We imported your HR zones from Intervals.icu."
          : needsRHR
            ? "We have your max HR from Intervals.icu. Enter your resting HR so we can calculate your zones."
            : "Enter your max HR and resting HR to calculate your training zones."}
      </p>

      <div className="space-y-4">
        {/* Imported 5 zones — show green box */}
        {hasImportedZones && (
          <>
            <div className="bg-tint-success border border-success/20 rounded-lg p-4 space-y-2 text-sm">
              <p className="text-success font-semibold">Imported from Intervals.icu</p>
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
              <p className="text-muted">
                <span className="text-text font-semibold">Zones:</span> {initialZones.join(", ")} bpm
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setUseManual(false); }}
                className={`flex-1 py-2 rounded-lg border-2 font-semibold text-sm transition ${
                  !useManual
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border text-muted hover:border-brand hover:text-brand"
                }`}
              >
                Use imported
              </button>
              <button
                onClick={() => { setUseManual(true); }}
                className={`flex-1 py-2 rounded-lg border-2 font-semibold text-sm transition ${
                  useManual
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border text-muted hover:border-brand hover:text-brand"
                }`}
              >
                Enter manually
              </button>
            </div>
          </>
        )}

        {/* Has maxHR but no 5 zones — ask for RHR */}
        {needsRHR && !useManual && (
          <div className="space-y-3">
            <div className="bg-surface-alt border border-border rounded-lg p-4 text-sm text-muted">
              <span className="text-text font-semibold">Max HR:</span> {initialMaxHr} bpm (from Intervals.icu)
            </div>
            <div>
              <label className="block text-sm font-semibold text-muted mb-2">
                Resting HR
              </label>
              <input
                type="number"
                min={30}
                max={100}
                value={restingHr}
                onChange={(e) => { setRestingHr(e.target.value); }}
                className="w-full px-4 py-3 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted"
                placeholder="e.g. 55"
              />
              <p className="text-xs text-muted mt-1">
                Check your watch&apos;s health app for your resting heart rate.
              </p>
            </div>
          </div>
        )}

        {/* Manual entry */}
        {useManual && (
          <div className="space-y-3 mt-4">
            <div>
              <label className="block text-sm font-semibold text-muted mb-2">
                Max HR
              </label>
              <input
                type="number"
                min={100}
                max={220}
                value={maxHr}
                onChange={(e) => { setMaxHr(e.target.value); }}
                className="w-full px-4 py-3 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted"
                placeholder="e.g. 190"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-muted mb-2">
                Resting HR
              </label>
              <input
                type="number"
                min={30}
                max={100}
                value={restingHr}
                onChange={(e) => { setRestingHr(e.target.value); }}
                className="w-full px-4 py-3 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted"
                placeholder="e.g. 55"
              />
              <p className="text-xs text-muted mt-1">
                Check your watch&apos;s health app for your resting heart rate.
              </p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-muted mb-2">
                Lactate Threshold HR (optional)
              </label>
              <input
                type="number"
                min={100}
                max={220}
                value={lthr}
                onChange={(e) => { setLthr(e.target.value); }}
                className="w-full px-4 py-3 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted"
                placeholder="e.g. 165"
              />
            </div>
          </div>
        )}

        {/* Zone preview */}
        {previewZones && (
          <div className="bg-surface-alt border border-border rounded-lg p-4 space-y-1 text-sm">
            <p className="text-text font-semibold mb-2">Your zones</p>
            {["Z1", "Z2", "Z3", "Z4", "Z5"].map((label, i) => (
              <div key={label} className="flex justify-between text-muted">
                <span>{label}</span>
                <span>{i === 0 ? `< ${previewZones[0]}` : `${previewZones[i - 1]}–${previewZones[i]}`} bpm</span>
              </div>
            ))}
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
          className={`flex-1 py-3 rounded-lg font-bold transition ${
            canProceed
              ? "bg-brand text-white hover:bg-brand-hover shadow-lg shadow-brand/20"
              : "border border-border text-muted hover:text-text hover:bg-border"
          }`}
        >
          {canProceed ? "Next" : "Skip"}
        </button>
      </div>
    </div>
  );
}
