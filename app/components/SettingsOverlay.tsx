"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
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
}

export function SettingsOverlay({ email, settings: initialSettings, onSave, onClose }: SettingsOverlayProps) {
  const [tab, setTab] = useState<Tab>("Training");
  const [settings, setSettings] = useState(initialSettings);
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
  };

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
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  });

  const handleSave = async (partial: Partial<UserSettings>) => {
    await onSave(partial);
    setSettings((prev) => ({ ...prev, ...partial }));
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center sm:p-4 transition-colors duration-250 ${isClosing ? "bg-black/0" : "bg-black/70"}`}
      onClick={handleClose}
    >
      <div
        className={`bg-surface rounded-t-2xl sm:rounded-xl w-full sm:max-w-lg shadow-xl shadow-brand/10 border-t sm:border border-border max-h-[92vh] overflow-y-auto ${isClosing ? "animate-slide-down" : "animate-slide-up"}`}
        onClick={(e: React.MouseEvent) => { e.stopPropagation(); }}
        onAnimationEnd={(e) => { if (isClosing && e.animationName === "slide-down") onClose(); }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-border">
          <h2 className="text-lg font-bold text-text">Settings</h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-border transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
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

        {/* Tab content */}
        <div className="px-4 py-4 sm:px-6">
          {tab === "Training" && <TrainingTab settings={settings} onSave={handleSave} />}
          {tab === "Plan" && <PlanTab settings={settings} onSave={handleSave} />}
          {tab === "Account" && <AccountTab email={email} settings={settings} onSave={handleSave} />}
        </div>
      </div>
    </div>
  );
}
