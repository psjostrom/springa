"use client";

import { useState } from "react";
import type { UserSettings } from "@/lib/settings";
import { MIN_PLAN_WEEKS } from "@/lib/periodization";

interface PlanTabProps {
  settings: UserSettings;
  onSave: (partial: Partial<UserSettings>) => Promise<void>;
}

export function PlanTab({ settings, onSave }: PlanTabProps) {
  const [totalWeeks, setTotalWeeks] = useState(settings.totalWeeks ?? "");
  const [startKm, setStartKm] = useState(settings.startKm ?? "");
  const [includeBasePhase, setIncludeBasePhase] = useState(settings.includeBasePhase ?? false);
  const [warmthPreference, setWarmthPreference] = useState(settings.warmthPreference ?? 0);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setStatus("");

    try {
      const updates: Partial<UserSettings> = {};

      const twVal = totalWeeks === "" ? undefined : Number(totalWeeks);
      if (twVal !== undefined && twVal < MIN_PLAN_WEEKS) {
        setStatus(`Total weeks must be at least ${MIN_PLAN_WEEKS}`);
        setSaving(false);
        return;
      }
      if (twVal !== settings.totalWeeks) {
        updates.totalWeeks = twVal;
      }
      const skVal = startKm === "" ? undefined : Number(startKm);
      if (skVal !== settings.startKm) {
        updates.startKm = skVal;
      }
      // Force base phase off when weeks are too short to support it
      const effectiveBasePhase = (twVal ?? 0) >= MIN_PLAN_WEEKS + 1 && includeBasePhase;
      if (effectiveBasePhase !== (settings.includeBasePhase ?? false)) {
        updates.includeBasePhase = effectiveBasePhase;
      }
      if (warmthPreference !== (settings.warmthPreference ?? 0)) {
        updates.warmthPreference = warmthPreference;
      }

      if (Object.keys(updates).length > 0) {
        await onSave(updates);
      }

      setStatus("Saved");
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  // Base phase needs enough weeks for 2-3 base + 4 build + 5 fixed = 11 minimum
  const minWeeksForBase = MIN_PLAN_WEEKS + 1;
  const weeksNum = typeof totalWeeks === "number" ? totalWeeks : 0;
  const baseTooShort = weeksNum > 0 && weeksNum < minWeeksForBase;
  const baseDisabled = baseTooShort;

  return (
    <div className="space-y-6">
      {/* Plan inputs */}
      <div>
        <span className="block text-sm font-semibold text-muted mb-3">Plan</span>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Total Weeks</label>
              <input
                type="number"
                min={MIN_PLAN_WEEKS}
                max={30}
                value={totalWeeks}
                onChange={(e) => { setTotalWeeks(e.target.value === "" ? "" : Number(e.target.value)); }}
                className="w-full px-3 py-2 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted text-sm"
                placeholder="18"
              />
              <p className="text-[10px] text-muted mt-1">
                Min {MIN_PLAN_WEEKS}. Includes build, 2-week race test, 2-week taper, and race week.
              </p>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Start km</label>
              <input
                type="number"
                min={2}
                max={30}
                value={startKm}
                onChange={(e) => { setStartKm(e.target.value === "" ? "" : Number(e.target.value)); }}
                className="w-full px-3 py-2 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted text-sm"
                placeholder="8"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Training Experience - Base phase toggle */}
      <div>
        <div className="flex items-start gap-3">
          <button
            type="button"
            role="switch"
            aria-label="Include base phase"
            aria-checked={includeBasePhase && !baseDisabled}
            disabled={baseDisabled}
            onClick={() => { if (!baseDisabled) setIncludeBasePhase(!includeBasePhase); }}
            className={`mt-0.5 relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${
              baseDisabled ? "bg-border opacity-40 cursor-not-allowed" : includeBasePhase ? "bg-brand" : "bg-surface-alt"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                includeBasePhase && !baseDisabled ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
          <div>
            <label className={`block text-sm font-semibold ${baseDisabled ? "text-muted/60" : "text-muted"}`}>
              Include base phase
            </label>
            <p className="text-xs text-muted mt-0.5 leading-relaxed">
              {baseDisabled
                ? `Requires at least ${minWeeksForBase} weeks. The base phase adds 2-3 easy-only weeks, and the plan still needs room for build, race test, taper, and race week.`
                : "Adds 2-3 weeks of easy-only running at the start of the plan. Recommended if you're new to structured training or returning from a break."}
            </p>
          </div>
        </div>
      </div>

      {/* Warmth Preference */}
      <div>
        <span className="block text-sm font-semibold text-muted mb-1">
          Running temperature
        </span>
        <p className="text-xs text-muted mb-3">
          Shifts clothing recommendations. If you tend to overheat, move toward warmer. If you get cold easily, move toward colder.
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-warning w-14 text-right flex-shrink-0">Warmer</span>
          <div className="flex gap-1 flex-1 justify-center">
            {([-2, -1, 0, 1, 2] as const).map((val) => {
              const colors = [
                "bg-warning border-warning",
                "bg-warning border-warning",
                "bg-border-subtle border-border-subtle",
                "bg-chart-secondary border-chart-secondary",
                "bg-surface-alt border-chart-secondary",
              ];
              const isSelected = warmthPreference === val;
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => { setWarmthPreference(val); }}
                  className={`w-9 h-9 rounded-lg border-2 transition ${colors[val + 2]} ${
                    isSelected ? "ring-2 ring-white ring-offset-1 ring-offset-surface scale-110" : "opacity-60 hover:opacity-80"
                  }`}
                  aria-label={`Warmth ${val}`}
                />
              );
            })}
          </div>
          <span className="text-xs text-chart-secondary w-14 flex-shrink-0">Colder</span>
        </div>
        {warmthPreference !== 0 && (
          <button
            type="button"
            onClick={() => { setWarmthPreference(0); }}
            className="mt-2 text-xs text-muted hover:text-text transition"
          >
            Reset to neutral
          </button>
        )}
      </div>

      {/* Save button */}
      <div className="mt-6">
        <button
          onClick={() => { void handleSave(); }}
          disabled={saving}
          className="w-full py-2.5 bg-brand text-white rounded-lg font-bold hover:bg-brand-hover transition shadow-lg shadow-brand/20 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {status && (
          <p className={`text-sm mt-2 ${status.startsWith("Saved") ? "text-success" : "text-error"}`}>
            {status}
          </p>
        )}
      </div>
    </div>
  );
}
