"use client";

import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import { X, LogOut, Bell } from "lucide-react";
import type { UserSettings } from "@/lib/settings";

interface SettingsModalProps {
  email: string;
  settings: UserSettings;
  onSave: (partial: Partial<UserSettings>) => Promise<void>;
  onClose: () => void;
}

export function SettingsModal({ email, settings, onSave, onClose }: SettingsModalProps) {
  const [raceDate, setRaceDate] = useState(settings.raceDate ?? "");
  const [raceName, setRaceName] = useState(settings.raceName ?? "");
  const [raceDist, setRaceDist] = useState(settings.raceDist ?? "");
  const [prefix, setPrefix] = useState(settings.prefix ?? "");
  const [totalWeeks, setTotalWeeks] = useState(settings.totalWeeks ?? "");
  const [startKm, setStartKm] = useState(settings.startKm ?? "");
  const [saving, setSaving] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default",
  );

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const handleSave = async () => {
    setSaving(true);
    const updates: Partial<UserSettings> = {};
    if (raceDate !== (settings.raceDate ?? "")) {
      updates.raceDate = raceDate;
    }
    if (raceName.trim() !== (settings.raceName ?? "")) {
      updates.raceName = raceName.trim();
    }
    const rdVal = raceDist === "" ? undefined : Number(raceDist);
    if (rdVal !== settings.raceDist) {
      updates.raceDist = rdVal;
    }
    if (prefix.trim() !== (settings.prefix ?? "")) {
      updates.prefix = prefix.trim();
    }
    const twVal = totalWeeks === "" ? undefined : Number(totalWeeks);
    if (twVal !== settings.totalWeeks) {
      updates.totalWeeks = twVal;
    }
    const skVal = startKm === "" ? undefined : Number(startKm);
    if (skVal !== settings.startKm) {
      updates.startKm = skVal;
    }
    if (Object.keys(updates).length > 0) {
      await onSave(updates);
    }
    setSaving(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#1e1535] rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-[#3d2b5a] shadow-lg shadow-[#ff2d95]/10">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#3d2b5a]">
          <h2 className="text-lg font-bold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#b8a5d4] hover:text-white hover:bg-[#2a1f3d] transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Account */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#c4b5fd] truncate">{email}</span>
            <button
              onClick={() => { void signOut(); }}
              className="flex items-center gap-1.5 text-sm text-[#b8a5d4] hover:text-[#ff3366] transition"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>

          <div className="border-t border-[#3d2b5a]" />

          {/* Race Date */}
          <div>
            <label className="block text-sm font-semibold text-[#c4b5fd] mb-1.5">
              Race Date
            </label>
            <input
              type="date"
              value={raceDate}
              onChange={(e) => { setRaceDate(e.target.value); }}
              className="w-full px-3 py-2 border border-[#3d2b5a] rounded-lg text-white bg-[#1a1030] focus:outline-none focus:ring-2 focus:ring-[#ff2d95] focus:border-transparent placeholder:text-[#b8a5d4] text-sm"
            />
          </div>

          {/* Race & Plan */}
          <div className="border-t border-[#3d2b5a] pt-4">
            <span className="block text-sm font-semibold text-[#c4b5fd] mb-3">
              Race & Plan
            </span>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#b8a5d4] mb-1">Race Name</label>
                <input
                  type="text"
                  value={raceName}
                  onChange={(e) => { setRaceName(e.target.value); }}
                  className="w-full px-3 py-2 border border-[#3d2b5a] rounded-lg text-white bg-[#1a1030] focus:outline-none focus:ring-2 focus:ring-[#ff2d95] focus:border-transparent placeholder:text-[#b8a5d4] text-sm"
                  placeholder="e.g. EcoTrail"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#b8a5d4] mb-1">Distance (km)</label>
                  <input
                    type="number"
                    min={5}
                    max={100}
                    value={raceDist}
                    onChange={(e) => { setRaceDist(e.target.value === "" ? "" : Number(e.target.value)); }}
                    className="w-full px-3 py-2 border border-[#3d2b5a] rounded-lg text-white bg-[#1a1030] focus:outline-none focus:ring-2 focus:ring-[#ff2d95] focus:border-transparent placeholder:text-[#b8a5d4] text-sm"
                    placeholder="16"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#b8a5d4] mb-1">Plan Prefix</label>
                  <input
                    type="text"
                    value={prefix}
                    onChange={(e) => { setPrefix(e.target.value); }}
                    className="w-full px-3 py-2 border border-[#3d2b5a] rounded-lg text-white bg-[#1a1030] focus:outline-none focus:ring-2 focus:ring-[#ff2d95] focus:border-transparent placeholder:text-[#b8a5d4] text-sm"
                    placeholder="eco16"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#b8a5d4] mb-1">Total Weeks</label>
                  <input
                    type="number"
                    min={4}
                    max={30}
                    value={totalWeeks}
                    onChange={(e) => { setTotalWeeks(e.target.value === "" ? "" : Number(e.target.value)); }}
                    className="w-full px-3 py-2 border border-[#3d2b5a] rounded-lg text-white bg-[#1a1030] focus:outline-none focus:ring-2 focus:ring-[#ff2d95] focus:border-transparent placeholder:text-[#b8a5d4] text-sm"
                    placeholder="18"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#b8a5d4] mb-1">Start km</label>
                  <input
                    type="number"
                    min={2}
                    max={30}
                    value={startKm}
                    onChange={(e) => { setStartKm(e.target.value === "" ? "" : Number(e.target.value)); }}
                    className="w-full px-3 py-2 border border-[#3d2b5a] rounded-lg text-white bg-[#1a1030] focus:outline-none focus:ring-2 focus:ring-[#ff2d95] focus:border-transparent placeholder:text-[#b8a5d4] text-sm"
                    placeholder="8"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className="border-t border-[#3d2b5a] pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Bell className="text-[#ff2d95]" size={16} />
              <span className="text-sm font-semibold text-[#c4b5fd]">
                Notifications
              </span>
            </div>
            <div className="flex items-center justify-between">
              {pushPermission === "granted" ? (
                <span className="text-sm text-[#39ff14]">Enabled</span>
              ) : pushPermission === "denied" ? (
                <span className="text-sm text-[#ff3366]">Blocked in browser</span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    void Notification.requestPermission()
                      .then((result) => { setPushPermission(result); })
                      .catch(() => { setPushPermission("denied"); });
                  }}
                  className="px-4 py-2 bg-[#2a1f3d] border border-[#3d2b5a] rounded-lg text-sm text-[#ff2d95] hover:bg-[#3d2b5a] transition"
                >
                  Enable notifications
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[#3d2b5a]">
          <button
            onClick={() => { void handleSave(); }}
            disabled={saving}
            className="w-full py-2.5 bg-[#ff2d95] text-white rounded-lg font-bold hover:bg-[#e0207a] transition shadow-lg shadow-[#ff2d95]/20 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
