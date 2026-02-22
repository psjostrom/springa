"use client";

import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import { X, Radio, Copy, RefreshCw, LogOut, Bell } from "lucide-react";
import type { UserSettings } from "@/lib/settings";

interface SettingsModalProps {
  email: string;
  settings: UserSettings;
  onSave: (partial: Partial<UserSettings>) => Promise<void>;
  onClose: () => void;
}

export function SettingsModal({ email, settings, onSave, onClose }: SettingsModalProps) {
  const [intervalsKey, setIntervalsKey] = useState(settings.intervalsApiKey ?? "");
  const [googleAiKey, setGoogleAiKey] = useState(settings.googleAiApiKey ?? "");
  const [xdripSecret, setXdripSecret] = useState(settings.xdripSecret ?? "");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default",
  );

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const generateSecret = () => {
    setXdripSecret(crypto.randomUUID());
  };

  const nightscoutUrl = xdripSecret
    ? `https://${xdripSecret}@springa.vercel.app/api/v1/`
    : "";

  const copyUrl = async () => {
    await navigator.clipboard.writeText(nightscoutUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    setSaving(true);
    const updates: Partial<UserSettings> = {};
    if (intervalsKey.trim() !== (settings.intervalsApiKey ?? "")) {
      updates.intervalsApiKey = intervalsKey.trim();
    }
    if (googleAiKey.trim() !== (settings.googleAiApiKey ?? "")) {
      updates.googleAiApiKey = googleAiKey.trim();
    }
    if (xdripSecret.trim() !== (settings.xdripSecret ?? "")) {
      updates.xdripSecret = xdripSecret.trim();
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
              onClick={() => signOut()}
              className="flex items-center gap-1.5 text-sm text-[#b8a5d4] hover:text-[#ff3366] transition"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>

          <div className="border-t border-[#3d2b5a]" />

          {/* Intervals.icu */}
          <div>
            <label className="block text-sm font-semibold text-[#c4b5fd] mb-1.5">
              Intervals.icu API Key
            </label>
            <input
              type="text"
              value={intervalsKey}
              onChange={(e) => setIntervalsKey(e.target.value)}
              className="w-full px-3 py-2 border border-[#3d2b5a] rounded-lg text-white bg-[#1a1030] focus:outline-none focus:ring-2 focus:ring-[#ff2d95] focus:border-transparent placeholder:text-[#b8a5d4] text-sm"
              placeholder="Intervals.icu API key"
            />
          </div>

          {/* Google AI */}
          <div>
            <label className="block text-sm font-semibold text-[#c4b5fd] mb-1.5">
              Google AI API Key <span className="font-normal text-[#b8a5d4]">(optional)</span>
            </label>
            <input
              type="text"
              value={googleAiKey}
              onChange={(e) => setGoogleAiKey(e.target.value)}
              className="w-full px-3 py-2 border border-[#3d2b5a] rounded-lg text-white bg-[#1a1030] focus:outline-none focus:ring-2 focus:ring-[#ff2d95] focus:border-transparent placeholder:text-[#b8a5d4] text-sm"
              placeholder="Needed for Coach tab"
            />
          </div>

          {/* xDrip */}
          <div className="border-t border-[#3d2b5a] pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Radio className="text-[#39ff14]" size={16} />
              <span className="text-sm font-semibold text-[#c4b5fd]">
                xDrip Integration
              </span>
            </div>

            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={xdripSecret}
                onChange={(e) => setXdripSecret(e.target.value)}
                className="flex-1 px-3 py-2 border border-[#3d2b5a] rounded-lg text-white bg-[#1a1030] focus:outline-none focus:ring-2 focus:ring-[#39ff14] focus:border-transparent placeholder:text-[#b8a5d4] text-sm font-mono"
                placeholder="Secret for xDrip sync"
              />
              <button
                type="button"
                onClick={generateSecret}
                className="px-3 py-2 bg-[#2a1f3d] border border-[#3d2b5a] rounded-lg text-[#39ff14] hover:bg-[#3d2b5a] transition"
                title="Generate secret"
              >
                <RefreshCw size={16} />
              </button>
            </div>

            {xdripSecret && (
              <div className="bg-[#1a1030] rounded-lg p-3 border border-[#3d2b5a]">
                <p className="text-xs text-[#b8a5d4] mb-1">Nightscout URL for xDrip:</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-[#39ff14] break-all flex-1">
                    {nightscoutUrl}
                  </code>
                  <button
                    type="button"
                    onClick={copyUrl}
                    className="shrink-0 p-1.5 rounded bg-[#2a1f3d] border border-[#3d2b5a] text-[#c4b5fd] hover:text-[#39ff14] transition"
                    title="Copy URL"
                  >
                    <Copy size={14} />
                  </button>
                </div>
                {copied && (
                  <p className="text-xs text-[#39ff14] mt-1">Copied!</p>
                )}
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="border-t border-[#3d2b5a] pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Bell className="text-[#ff2d95]" size={16} />
              <span className="text-sm font-semibold text-[#c4b5fd]">
                Notiser
              </span>
            </div>
            <div className="flex items-center justify-between">
              {pushPermission === "granted" ? (
                <span className="text-sm text-[#39ff14]">Aktiverade</span>
              ) : pushPermission === "denied" ? (
                <span className="text-sm text-[#ff3366]">Blockerade i webbläsaren</span>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    const result = await Notification.requestPermission();
                    setPushPermission(result);
                  }}
                  className="px-4 py-2 bg-[#2a1f3d] border border-[#3d2b5a] rounded-lg text-sm text-[#ff2d95] hover:bg-[#3d2b5a] transition"
                >
                  Aktivera notiser
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[#3d2b5a]">
          <button
            onClick={handleSave}
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
