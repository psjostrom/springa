"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TabNavigation } from "./components/TabNavigation";
import { ApiKeyModal } from "./components/ApiKeyModal";
import { PlannerScreen } from "./screens/PlannerScreen";
import { CalendarScreen } from "./screens/CalendarScreen";
import { ProgressScreen } from "./screens/ProgressScreen";
import { usePhaseInfo } from "./hooks/usePhaseInfo";

type Tab = "planner" | "calendar" | "progress";

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize API key from env or localStorage
  const [apiKey, setApiKey] = useState<string>(() => {
    const envKey = process.env.NEXT_PUBLIC_INTERVALS_API_KEY;
    if (envKey) return envKey;

    if (typeof window !== "undefined") {
      const storedKey = localStorage.getItem("intervals_api_key");
      if (storedKey) return storedKey;
    }

    return "";
  });

  const [showApiKeyModal, setShowApiKeyModal] = useState(!apiKey);

  // Derive active tab from URL (default to calendar)
  const tabParam = searchParams.get("tab");
  const activeTab: Tab =
    tabParam === "planner"
      ? "planner"
      : tabParam === "progress"
        ? "progress"
        : "calendar";

  // Handle tab change via URL
  const handleTabChange = (tab: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  // Handle API key submission
  const handleApiKeySubmit = (key: string) => {
    setApiKey(key);
    localStorage.setItem("intervals_api_key", key);
    setShowApiKeyModal(false);
  };

  // Phase info for progress screen
  const phaseInfo = usePhaseInfo("2026-06-13", 18);

  return (
    <>
      {showApiKeyModal && (
        <ApiKeyModal
          onApiKeySubmit={handleApiKeySubmit}
          onClose={() => setShowApiKeyModal(false)}
        />
      )}

      <div className="h-screen bg-slate-50 flex flex-col text-slate-900 font-sans overflow-hidden">
        <div className="bg-white border-b border-slate-200 flex-shrink-0 z-30">
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-4">
            <TabNavigation activeTab={activeTab} onTabChange={handleTabChange} />
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {activeTab === "planner" && <PlannerScreen apiKey={apiKey} />}

          {activeTab === "calendar" && <CalendarScreen apiKey={apiKey} />}

          {activeTab === "progress" && (
            <ProgressScreen
              apiKey={apiKey}
              phaseName={phaseInfo.name}
              currentWeek={phaseInfo.week}
              totalWeeks={18}
              progress={phaseInfo.progress}
            />
          )}
        </div>
      </div>
    </>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          Loading...
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
