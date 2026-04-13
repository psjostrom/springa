"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { LogOut, Bell, ExternalLink } from "lucide-react";
import type { UserSettings } from "@/lib/settings";
import { INSULIN_OPTIONS } from "@/lib/iob";

interface AccountTabProps {
  email: string;
  settings: UserSettings;
  onSave: (partial: Partial<UserSettings>) => Promise<void>;
}

export function AccountTab({ email, settings, onSave }: AccountTabProps) {
  const [diabetesMode, setDiabetesMode] = useState(settings.diabetesMode ?? false);
  const [nightscoutUrl, setNightscoutUrl] = useState(settings.nightscoutUrl ?? "");
  const [nightscoutSecret, setNightscoutSecret] = useState("");
  const [nightscoutConnected, setNightscoutConnected] = useState(settings.nightscoutConnected ?? false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [insulinType, setInsulinType] = useState(settings.insulinType ?? "fiasp");
  const [intervalsApiKey, setIntervalsApiKey] = useState("");
  const [intervalsConnected, setIntervalsConnected] = useState(settings.intervalsConnected ?? false);
  const [intervalsValidating, setIntervalsValidating] = useState(false);
  const [intervalsError, setIntervalsError] = useState("");
  const [showIntervalsKeyInput, setShowIntervalsKeyInput] = useState(!settings.intervalsConnected);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default",
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

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

  const handleUpdateIntervalsKey = async () => {
    if (!intervalsApiKey.trim()) return;

    setIntervalsValidating(true);
    setIntervalsError("");

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intervalsApiKey: intervalsApiKey.trim() }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setIntervalsError(data.error ?? "Invalid API key");
      } else {
        setIntervalsConnected(true);
        setIntervalsApiKey("");
        setShowIntervalsKeyInput(false);
        void onSave({ intervalsConnected: true });
      }
    } catch {
      setIntervalsError("Network error");
    } finally {
      setIntervalsValidating(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus("");

    try {
      const updates: Partial<UserSettings> & {
        nightscoutUrl?: string | null;
        nightscoutSecret?: string | null;
      } = {};

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

      if (insulinType !== (settings.insulinType ?? "fiasp")) {
        updates.insulinType = insulinType;
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

  return (
    <div className="space-y-6">
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

      {/* Intervals.icu */}
      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-muted">Intervals.icu</span>
          {intervalsConnected && !showIntervalsKeyInput && (
            <span className="text-sm text-success">Connected</span>
          )}
        </div>

        {intervalsConnected && !showIntervalsKeyInput ? (
          <button
            type="button"
            onClick={() => { setShowIntervalsKeyInput(true); }}
            className="text-sm text-muted hover:text-text transition"
          >
            Update API key
          </button>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-muted mb-1">API Key</label>
              <input
                type="password"
                value={intervalsApiKey}
                onChange={(e) => { setIntervalsApiKey(e.target.value); setIntervalsError(""); }}
                className="w-full px-3 py-2 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted font-mono text-sm"
                placeholder={intervalsConnected ? "Paste new key" : "Paste your API key"}
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => { void handleUpdateIntervalsKey(); }}
                disabled={intervalsValidating || !intervalsApiKey.trim()}
                className="px-4 py-2 bg-border border border-border rounded-lg text-sm text-brand hover:bg-border transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {intervalsValidating ? "Validating..." : intervalsConnected ? "Update" : "Connect"}
              </button>
              {intervalsConnected && (
                <button
                  type="button"
                  onClick={() => { setShowIntervalsKeyInput(false); setIntervalsApiKey(""); setIntervalsError(""); }}
                  className="text-sm text-muted hover:text-text transition"
                >
                  Cancel
                </button>
              )}
              <a
                href="https://intervals.icu/settings"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto flex items-center gap-1 text-xs text-muted hover:text-brand transition"
              >
                <ExternalLink size={12} />
                Find key
              </a>
            </div>
            {intervalsError && (
              <p className="text-sm text-error">✗ {intervalsError}</p>
            )}
          </div>
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
            onClick={() => { setDiabetesMode(!diabetesMode); }}
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

            {/* Insulin Type */}
            <div>
              <label className="block text-xs text-muted mb-1">Rapid-acting insulin</label>
              <select
                value={insulinType}
                onChange={(e) => { setInsulinType(e.target.value); }}
                className="w-full px-3 py-2 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent text-sm"
              >
                {INSULIN_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <p className="text-xs text-muted mt-1">Used for IOB decay calculation</p>
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
