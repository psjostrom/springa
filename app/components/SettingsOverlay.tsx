"use client";

import { useState, useEffect } from "react";
import { X, ArrowLeft } from "lucide-react";
import type { UserSettings } from "@/lib/settings";
import { TrainingTab } from "@/app/settings/TrainingTab";
import { PlanTab } from "@/app/settings/PlanTab";
import { AccountTab } from "@/app/settings/AccountTab";

const TABS = ["Training", "Plan", "Account"] as const;
type Tab = typeof TABS[number];

interface SettingsOverlayProps {
  email: string;
  settings: UserSettings;
  onSave: (partial: Partial<UserSettings>) => Promise<void>;
  onClose: () => void;
  onAbilityChanged?: (newSecs: number, newDist: number) => Promise<void>;
}

export function SettingsOverlay({ email, settings: initialSettings, onSave, onClose, onAbilityChanged }: SettingsOverlayProps) {
  const [tab, setTab] = useState<Tab>("Training");
  const [settings, setSettings] = useState(initialSettings);

  // Fetch enriched settings (Intervals.icu data) client-side
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json() as Promise<UserSettings>)
      .then((enriched) => { setSettings((prev) => ({ ...prev, ...enriched })); })
      .catch(() => { /* proceed with initial data */ });
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const handleSave = async (partial: Partial<UserSettings>) => {
    await onSave(partial);
    setSettings((prev) => ({ ...prev, ...partial }));
  };

  return (
    <div
      className="fixed inset-0 z-50 sm:flex sm:items-center sm:justify-center sm:p-4 bg-black/70"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="h-full sm:h-auto sm:max-h-[85vh] sm:max-w-lg sm:w-full bg-surface sm:rounded-xl shadow-xl shadow-brand/10 sm:border sm:border-border flex flex-col overflow-hidden"
        onClick={(e: React.MouseEvent) => { e.stopPropagation(); }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-border flex-none">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-border transition sm:hidden"
            >
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-lg font-bold text-text">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="hidden sm:block p-1.5 rounded-lg text-muted hover:text-text hover:bg-border transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs — fixed, never scrolls */}
        <div className="flex border-b border-border flex-none">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); }}
              className={`flex-1 py-2.5 text-sm font-semibold transition ${
                tab === t
                  ? "text-brand border-b-2 border-brand"
                  : "text-muted hover:text-text"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content — scrollable, fills remaining space */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {tab === "Training" && <TrainingTab settings={settings} onSave={handleSave} onAbilityChanged={onAbilityChanged} />}
          {tab === "Plan" && <PlanTab settings={settings} onSave={handleSave} />}
          {tab === "Account" && <AccountTab email={email} settings={settings} onSave={handleSave} />}
        </div>
      </div>
    </div>
  );
}
