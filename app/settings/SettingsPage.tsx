"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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

  const handleSave = async (partial: Partial<UserSettings>) => {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
    if (!res.ok) throw new Error("Save failed");
    setSettings((prev) => ({ ...prev, ...partial }));
  };

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="max-w-md md:max-w-2xl mx-auto">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Link href="/" className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-border transition">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-lg font-bold">Settings</h1>
        </div>

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

        <div className="px-4 py-4">
          {tab === "Training" && <TrainingTab settings={settings} onSave={handleSave} />}
          {tab === "Plan" && <PlanTab settings={settings} onSave={handleSave} />}
          {tab === "Account" && <AccountTab email={email} settings={settings} onSave={handleSave} />}
        </div>
      </div>
    </div>
  );
}
