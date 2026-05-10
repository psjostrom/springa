"use client";

import { useState } from "react";
import type { UserSettings } from "@/lib/settings";

interface ProfileTabProps {
  settings: UserSettings;
  onSave: (partial: Partial<UserSettings>) => Promise<void>;
}

export function ProfileTab({ settings, onSave }: ProfileTabProps) {
  const [dob, setDob] = useState(settings.dob ?? "");
  const [weightKg, setWeightKg] = useState(settings.weightKg?.toString() ?? "");
  const [heightCm, setHeightCm] = useState(settings.heightCm?.toString() ?? "");
  const [raceName, setRaceName] = useState(settings.raceName ?? "");
  const [raceDist, setRaceDist] = useState(settings.raceDist?.toString() ?? "");
  const [raceDate, setRaceDate] = useState(settings.raceDate ?? "");
  const [t1dSinceYear, setT1dSinceYear] = useState(settings.t1dSinceYear?.toString() ?? "");
  const [pumpModel, setPumpModel] = useState(settings.pumpModel ?? "");
  const [cgmModel, setCgmModel] = useState(settings.cgmModel ?? "");
  const [loopSystem, setLoopSystem] = useState(settings.loopSystem ?? "");
  const [pumpDuringRuns, setPumpDuringRuns] = useState(settings.pumpDuringRuns ?? "");
  const [targetStartBG, setTargetStartBG] = useState(settings.targetStartBG?.toString() ?? "");

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setStatus("");

    try {
      const updates: Partial<UserSettings> = {};

      const newDob = dob.trim() || undefined;
      if (newDob !== settings.dob) {
        updates.dob = newDob;
      }

      const parsedWeight = weightKg.trim() ? Number(weightKg) : undefined;
      if (parsedWeight !== settings.weightKg) {
        updates.weightKg = parsedWeight;
      }

      const parsedHeight = heightCm.trim() ? Number(heightCm) : undefined;
      if (parsedHeight !== settings.heightCm) {
        updates.heightCm = parsedHeight;
      }

      const newRaceName = raceName.trim() || undefined;
      if (newRaceName !== settings.raceName) {
        updates.raceName = newRaceName;
      }

      const parsedRaceDist = raceDist.trim() ? Number(raceDist) : undefined;
      if (parsedRaceDist !== settings.raceDist) {
        updates.raceDist = parsedRaceDist;
      }

      const newRaceDate = raceDate.trim() || undefined;
      if (newRaceDate !== settings.raceDate) {
        updates.raceDate = newRaceDate;
      }

      const parsedT1dYear = t1dSinceYear.trim() ? Number(t1dSinceYear) : undefined;
      if (parsedT1dYear !== settings.t1dSinceYear) {
        updates.t1dSinceYear = parsedT1dYear;
      }

      const newPumpModel = pumpModel.trim() || undefined;
      if (newPumpModel !== settings.pumpModel) {
        updates.pumpModel = newPumpModel;
      }

      const newCgmModel = cgmModel.trim() || undefined;
      if (newCgmModel !== settings.cgmModel) {
        updates.cgmModel = newCgmModel;
      }

      const newLoopSystem = loopSystem.trim() || undefined;
      if (newLoopSystem !== settings.loopSystem) {
        updates.loopSystem = newLoopSystem;
      }

      const newPumpDuringRuns = pumpDuringRuns || undefined;
      if (newPumpDuringRuns !== settings.pumpDuringRuns) {
        updates.pumpDuringRuns = newPumpDuringRuns;
      }

      const parsedTargetStartBG = targetStartBG.trim() ? Number(targetStartBG) : undefined;
      if (parsedTargetStartBG !== settings.targetStartBG) {
        updates.targetStartBG = parsedTargetStartBG;
      }

      await onSave(updates);

      setStatus("Saved");
      setTimeout(() => { setStatus(""); }, 2000);
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Physical Profile */}
      <div>
        <label htmlFor="dob" className="block text-xs text-muted mb-1">
          Date of birth
        </label>
        <input
          id="dob"
          type="date"
          value={dob}
          onChange={(e) => { setDob(e.target.value); }}
          className="w-full px-3 py-2 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent text-sm"
        />
      </div>

      <div>
        <label htmlFor="weight" className="block text-xs text-muted mb-1">
          Weight (kg)
        </label>
        <input
          id="weight"
          type="number"
          step="0.1"
          value={weightKg}
          onChange={(e) => { setWeightKg(e.target.value); }}
          className="w-full px-3 py-2 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent text-sm"
        />
      </div>

      <div>
        <label htmlFor="height" className="block text-xs text-muted mb-1">
          Height (cm)
        </label>
        <input
          id="height"
          type="number"
          step="0.5"
          value={heightCm}
          onChange={(e) => { setHeightCm(e.target.value); }}
          className="w-full px-3 py-2 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent text-sm"
        />
      </div>

      {/* Race Info */}
      <div className="border-t border-border pt-4">
        <div>
          <label htmlFor="raceName" className="block text-xs text-muted mb-1">
            Race name
          </label>
          <input
            id="raceName"
            type="text"
            value={raceName}
            onChange={(e) => { setRaceName(e.target.value); }}
            className="w-full px-3 py-2 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent text-sm"
          />
        </div>

        <div className="mt-3">
          <label htmlFor="raceDist" className="block text-xs text-muted mb-1">
            Race distance (km)
          </label>
          <input
            id="raceDist"
            type="number"
            step="0.1"
            value={raceDist}
            onChange={(e) => { setRaceDist(e.target.value); }}
            className="w-full px-3 py-2 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent text-sm"
          />
        </div>

        <div className="mt-3">
          <label htmlFor="raceDate" className="block text-xs text-muted mb-1">
            Race date
          </label>
          <input
            id="raceDate"
            type="date"
            value={raceDate}
            onChange={(e) => { setRaceDate(e.target.value); }}
            className="w-full px-3 py-2 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent text-sm"
          />
        </div>
      </div>

      {/* T1D Setup */}
      <div className="border-t border-border pt-4">
        <div>
          <label htmlFor="t1dSinceYear" className="block text-xs text-muted mb-1">
            T1D since year
          </label>
          <input
            id="t1dSinceYear"
            type="number"
            min="1900"
            max="2099"
            value={t1dSinceYear}
            onChange={(e) => { setT1dSinceYear(e.target.value); }}
            className="w-full px-3 py-2 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent text-sm"
          />
        </div>

        <div className="mt-3">
          <label htmlFor="pumpModel" className="block text-xs text-muted mb-1">
            Pump model
          </label>
          <input
            id="pumpModel"
            type="text"
            value={pumpModel}
            onChange={(e) => { setPumpModel(e.target.value); }}
            className="w-full px-3 py-2 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent text-sm"
          />
        </div>

        <div className="mt-3">
          <label htmlFor="cgmModel" className="block text-xs text-muted mb-1">
            CGM model
          </label>
          <input
            id="cgmModel"
            type="text"
            value={cgmModel}
            onChange={(e) => { setCgmModel(e.target.value); }}
            className="w-full px-3 py-2 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent text-sm"
          />
        </div>

        <div className="mt-3">
          <label htmlFor="loopSystem" className="block text-xs text-muted mb-1">
            Loop system
          </label>
          <input
            id="loopSystem"
            type="text"
            value={loopSystem}
            onChange={(e) => { setLoopSystem(e.target.value); }}
            className="w-full px-3 py-2 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent text-sm"
          />
        </div>

        <div className="mt-3">
          <label htmlFor="pumpDuringRuns" className="block text-xs text-muted mb-1">
            Pump during runs
          </label>
          <select
            id="pumpDuringRuns"
            value={pumpDuringRuns}
            onChange={(e) => { setPumpDuringRuns(e.target.value); }}
            className="w-full px-3 py-2 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent text-sm"
          >
            <option value="">Not set</option>
            <option value="on">On</option>
            <option value="off">Off</option>
            <option value="mixed">Mixed</option>
          </select>
        </div>

        <div className="mt-3">
          <label htmlFor="targetStartBG" className="block text-xs text-muted mb-1">
            Target start BG (mmol/L)
          </label>
          <input
            id="targetStartBG"
            type="number"
            step="0.1"
            value={targetStartBG}
            onChange={(e) => { setTargetStartBG(e.target.value); }}
            className="w-full px-3 py-2 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent text-sm"
          />
        </div>
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
