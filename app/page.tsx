"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { TabNavigation } from "./components/TabNavigation";
import { ApiKeySetup } from "./components/ApiKeySetup";
import { PlannerScreen } from "./screens/PlannerScreen";
import { CalendarScreen } from "./screens/CalendarScreen";
import { ProgressScreen } from "./screens/ProgressScreen";
import { usePhaseInfo } from "./hooks/usePhaseInfo";

type Tab = "planner" | "calendar" | "progress";

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  // Initialize API key from localStorage
  const [apiKey, setApiKey] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const storedKey = localStorage.getItem("intervals_api_key");
      if (storedKey) return storedKey;
    }
    return "";
  });

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
  };

  // Phase info for progress screen
  const phaseInfo = usePhaseInfo("2026-06-13", 18);

  if (!apiKey) {
    return <ApiKeySetup onSubmit={handleApiKeySubmit} />;
  }

  return (
    <div className="h-screen bg-slate-50 flex flex-col text-slate-900 font-sans overflow-hidden">
      <div className="bg-white border-b border-slate-200 flex-shrink-0 z-30">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
          <TabNavigation activeTab={activeTab} onTabChange={handleTabChange} />
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span className="hidden sm:inline">{session?.user?.email}</span>
            <button
              onClick={() => signOut()}
              className="text-slate-500 hover:text-slate-700 transition"
            >
              Sign out
            </button>
          </div>
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
