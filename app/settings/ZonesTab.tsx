"use client";

import { useState } from "react";
import type { UserSettings } from "@/lib/settings";
import { computeMaxHRZones, ZONE_COLORS, ZONE_DISPLAY_NAMES } from "@/lib/constants";

interface ZonesTabProps {
  settings: UserSettings;
  onSave: (partial: Partial<UserSettings>) => Promise<void>;
}

export function ZonesTab({ settings, onSave }: ZonesTabProps) {
  const [maxHr, setMaxHr] = useState(settings.maxHr ?? 0);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setStatus("");

    try {
      const updates: Partial<UserSettings> = {};

      if (maxHr !== (settings.maxHr ?? 0)) {
        updates.maxHr = maxHr || undefined;
      }

      if (Object.keys(updates).length > 0) {
        await onSave(updates);
      }

      // Fire-and-forget sync to Intervals.icu if maxHr changed
      if (settings.intervalsConnected && maxHr !== (settings.maxHr ?? 0) && maxHr > 0 && settings.sportSettingsId) {
        const zones = computeMaxHRZones(maxHr);
        fetch("/api/intervals/hr-zones", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sportSettingsId: settings.sportSettingsId, hrZones: zones, maxHr }),
        }).catch((e: unknown) => { console.error("HR zone sync failed:", e); });
      }

      setStatus("Saved");
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-3">
          <label className="text-xs text-muted">Max HR</label>
          <input
            type="number"
            min={120}
            max={230}
            value={maxHr || ""}
            onChange={(e) => { setMaxHr(e.target.value === "" ? 0 : Number(e.target.value)); }}
            className="w-20 px-3 py-2 border border-border rounded-lg text-text bg-surface-alt text-sm text-center"
          />
          <span className="text-xs text-muted">bpm</span>
        </div>
        {maxHr > 0 && (() => {
          const zones = computeMaxHRZones(maxHr);
          return (
            <div className="bg-surface-alt border border-border rounded-lg p-3 space-y-1 text-sm">
              {(["z1", "z2", "z3", "z4", "z5"] as const).map((zone, i) => {
                const lo = i === 0 ? 0 : zones[i - 1];
                const hi = zones[i];
                return (
                  <div key={zone} className="flex justify-between">
                    <span style={{ color: ZONE_COLORS[zone] }}>{ZONE_DISPLAY_NAMES[zone]}</span>
                    <span className="text-muted">
                      {i === 0 ? `< ${hi}` : i === 4 ? `${lo}+` : `${lo} \u2013 ${hi}`} bpm
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })()}
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
