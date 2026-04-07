"use client";

import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import { X, LogOut, Bell } from "lucide-react";
import type { UserSettings } from "@/lib/settings";
import { MIN_PLAN_WEEKS } from "@/lib/periodization";

interface SettingsModalProps {
  email: string;
  settings: UserSettings;
  onSave: (partial: Partial<UserSettings>) => Promise<void>;
  onClose: () => void;
}

export function SettingsModal({ email, settings, onSave, onClose }: SettingsModalProps) {
  const [totalWeeks, setTotalWeeks] = useState(settings.totalWeeks ?? "");
  const [startKm, setStartKm] = useState(settings.startKm ?? "");
  const [includeBasePhase, setIncludeBasePhase] = useState(settings.includeBasePhase ?? false);
  const [warmthPreference, setWarmthPreference] = useState(settings.warmthPreference ?? 0);
  const [diabetesMode, setSugarMode] = useState(settings.diabetesMode ?? false);
  const [nightscoutUrl, setNightscoutUrl] = useState(settings.nightscoutUrl ?? "");
  const [nightscoutSecret, setNightscoutSecret] = useState("");
  const [nightscoutConnected, setNightscoutConnected] = useState(settings.nightscoutConnected ?? false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionError, setConnectionError] = useState("");
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

  const handleTestConnection = async () => {
    if (!nightscoutUrl || !nightscoutSecret) {
      setConnectionError("Both URL and API secret are required");
      return;
    }

    setTestingConnection(true);
    setConnectionError("");

    try {
      const res = await fetch("/api/settings/validate-ns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nightscoutUrl: nightscoutUrl.trim(),
          nightscoutSecret: nightscoutSecret.trim(),
        }),
      });

      const data = (await res.json()) as { valid: boolean; error?: string };
      if (!res.ok || !data.valid) {
        setConnectionError(data.error ?? "Connection failed");
        setNightscoutConnected(false);
      } else {
        setNightscoutConnected(true);
        setConnectionError("");
      }
    } catch {
      setConnectionError("Network error");
      setNightscoutConnected(false);
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const updates: Partial<UserSettings> & {
      nightscoutUrl?: string | null;
      nightscoutSecret?: string | null;
    } = {};

    const twVal = totalWeeks === "" ? undefined : Number(totalWeeks);
    if (twVal !== undefined && twVal < MIN_PLAN_WEEKS) {
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
    if (diabetesMode !== (settings.diabetesMode ?? false)) {
      updates.diabetesMode = diabetesMode;
    }

    // Nightscout credentials (only send if changed)
    if (diabetesMode) {
      if (nightscoutUrl.trim() !== (settings.nightscoutUrl ?? "")) {
        updates.nightscoutUrl = nightscoutUrl.trim();
      }
      if (nightscoutSecret.trim()) {
        updates.nightscoutSecret = nightscoutSecret.trim();
      }
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
      <div className="bg-surface rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-border shadow-lg shadow-brand/10">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-bold text-text">Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-border transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Account */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted truncate">{email}</span>
            <button
              onClick={() => { void signOut(); }}
              className="flex items-center gap-1.5 text-sm text-muted hover:text-error transition"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>

          <div className="border-t border-border" />

          {/* Plan */}
          <div className="border-t border-border pt-4">
            <span className="block text-sm font-semibold text-muted mb-3">
              Plan
            </span>
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

          {/* Training Experience */}
          {(() => {
            // Base phase needs enough weeks for 2-3 base + 4 build + 5 fixed = 11 minimum
            const minWeeksForBase = MIN_PLAN_WEEKS + 1;
            const weeksNum = typeof totalWeeks === "number" ? totalWeeks : 0;
            const baseTooShort = weeksNum > 0 && weeksNum < minWeeksForBase;
            const baseDisabled = baseTooShort;
            return (
              <div className="border-t border-border pt-4">
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
            );
          })()}

          {/* Warmth Preference */}
          <div className="border-t border-border pt-4">
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

          {/* Sugar Mode */}
          <div className="border-t border-border pt-4">
            <div className="flex items-start gap-3">
              <button
                type="button"
                role="switch"
                aria-label="Manage diabetes"
                aria-checked={diabetesMode}
                onClick={() => { setSugarMode(!diabetesMode); }}
                className={`mt-0.5 relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${
                  diabetesMode ? "bg-brand" : "bg-surface-alt"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    diabetesMode ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
              <div className="flex-1">
                <label className="block text-sm font-semibold text-muted">
                  Manage diabetes
                </label>
                <p className="text-xs text-muted mt-0.5 leading-relaxed">
                  Enable CGM data sync and BG management features
                </p>
              </div>
            </div>

            {diabetesMode && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs text-muted mb-1">Nightscout URL</label>
                  <input
                    type="text"
                    value={nightscoutUrl}
                    onChange={(e) => { setNightscoutUrl(e.target.value); setConnectionError(""); }}
                    className="w-full px-3 py-2 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted text-sm"
                    placeholder="https://your-site.herokuapp.com"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">API Secret</label>
                  <input
                    type="password"
                    value={nightscoutSecret}
                    onChange={(e) => { setNightscoutSecret(e.target.value); setConnectionError(""); }}
                    className="w-full px-3 py-2 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted text-sm"
                    placeholder={nightscoutConnected ? "••••••••" : "Enter API secret"}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => { void handleTestConnection(); }}
                    disabled={testingConnection || !nightscoutUrl || !nightscoutSecret}
                    className="px-4 py-2 bg-border border border-border rounded-lg text-sm text-brand hover:bg-border transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {testingConnection ? "Testing..." : "Test Connection"}
                  </button>
                  {nightscoutConnected && !connectionError && (
                    <span className="text-sm text-success">✓ Connected</span>
                  )}
                  {connectionError && (
                    <span className="text-sm text-error">✗ {connectionError}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Bell className="text-brand" size={16} />
              <span className="text-sm font-semibold text-muted">
                Notifications
              </span>
            </div>
            <div className="flex items-center justify-between">
              {pushPermission === "granted" ? (
                <span className="text-sm text-success">Enabled</span>
              ) : pushPermission === "denied" ? (
                <span className="text-sm text-error">Blocked in browser</span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    void Notification.requestPermission()
                      .then((result) => { setPushPermission(result); })
                      .catch(() => { setPushPermission("denied"); });
                  }}
                  className="px-4 py-2 bg-border border border-border rounded-lg text-sm text-brand hover:bg-border transition"
                >
                  Enable notifications
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border">
          <button
            onClick={() => { void handleSave(); }}
            disabled={saving || (totalWeeks !== "" && Number(totalWeeks) < MIN_PLAN_WEEKS)}
            className="w-full py-2.5 bg-brand text-white rounded-lg font-bold hover:bg-brand-hover transition shadow-lg shadow-brand/20 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
