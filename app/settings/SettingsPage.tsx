"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, ArrowLeft } from "lucide-react";
import type { UserSettings } from "@/lib/settings";
import { TrainingTab } from "./TrainingTab";
import { PlanTab } from "./PlanTab";
import { AccountTab } from "./AccountTab";

const TABS = ["Training", "Plan", "Account"] as const;
type Tab = typeof TABS[number];

interface SettingsPageProps {
  email: string;
  initialSettings: UserSettings;
}

export function SettingsPage({ email, initialSettings }: SettingsPageProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Training");
  const [settings, setSettings] = useState(initialSettings);

  // Fetch enriched settings (includes Intervals.icu data) client-side
  // so the page loads instantly from DB, then HR zones etc. populate
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json() as Promise<UserSettings>)
      .then((enriched) => { setSettings((prev) => ({ ...prev, ...enriched })); })
      .catch(() => { /* proceed with DB-only data */ });
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push("/");
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, [router]);

  const handleSave = async (partial: Partial<UserSettings>) => {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
    if (!res.ok) throw new Error("Save failed");
    setSettings((prev) => ({ ...prev, ...partial }));
  };

  const close = () => { router.push("/"); };

  const card = (
    <div className="bg-surface md:rounded-xl w-full md:max-w-lg md:max-h-[90vh] md:overflow-y-auto md:border md:border-border md:shadow-lg md:shadow-brand/10">
      {/* Header: back arrow on mobile, X on desktop */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <button
            onClick={close}
            className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-border transition md:hidden"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-bold">Settings</h1>
        </div>
        <button
          onClick={close}
          className="hidden md:block p-1.5 rounded-lg text-muted hover:text-text hover:bg-border transition"
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
      <div className="px-4 py-4 md:px-6">
        {tab === "Training" && <TrainingTab settings={settings} onSave={handleSave} />}
        {tab === "Plan" && <PlanTab settings={settings} onSave={handleSave} />}
        {tab === "Account" && <AccountTab email={email} settings={settings} onSave={handleSave} />}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile: full page */}
      <div className="min-h-screen bg-bg text-text md:hidden">
        {card}
      </div>

      {/* Desktop: modal overlay */}
      <div
        className="hidden md:flex fixed inset-0 z-50 items-start justify-center bg-black/60 backdrop-blur-sm pt-[10vh]"
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      >
        {card}
      </div>
    </>
  );
}
