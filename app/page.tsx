"use client";

import { Suspense, useCallback, useState, useSyncExternalStore } from "react";
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

  const subscribe = useCallback(() => () => {}, []);
  const getSnapshot = useCallback(() => localStorage.getItem("intervals_api_key") ?? "", []);
  const getServerSnapshot = useCallback(() => null as string | null, []);
  const storedKey = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [localKey, setLocalKey] = useState("");

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
    setLocalKey(key);
    localStorage.setItem("intervals_api_key", key);
  };

  const apiKey = storedKey ?? localKey;

  // Phase info for progress screen
  const phaseInfo = usePhaseInfo("2026-06-13", 18);

  if (storedKey === null) {
    return (
      <div className="h-screen bg-[#0d0a1a] flex flex-col text-white font-sans overflow-hidden">
        <div className="bg-[#1e1535] border-b border-[#3d2b5a] flex-shrink-0 z-30">
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-4">
            <div className="h-6 w-24 bg-[#2a1f3d] rounded animate-pulse" />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-3 w-full max-w-md px-4">
            <div className="h-4 bg-[#2a1f3d] rounded animate-pulse" />
            <div className="h-4 bg-[#2a1f3d] rounded animate-pulse w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  if (!apiKey) {
    return <ApiKeySetup onSubmit={handleApiKeySubmit} />;
  }

  return (
    <div className="h-screen bg-[#0d0a1a] flex flex-col text-white font-sans overflow-hidden">
      <div className="bg-[#1e1535] border-b border-[#3d2b5a] flex-shrink-0 z-30">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
          <h1 className="md:hidden text-lg font-bold text-[#ff2d95]">Springa</h1>
          <TabNavigation activeTab={activeTab} onTabChange={handleTabChange} />
          <div className="flex items-center gap-3 text-sm text-[#8b7aaa]">
            <span className="hidden sm:inline">{session?.user?.email}</span>
            <button
              onClick={() => signOut()}
              className="text-[#8b7aaa] hover:text-[#c4b5fd] transition"
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

      {/* Spacer to prevent bottom tab bar overlap on mobile */}
      <div className="h-16 md:hidden flex-shrink-0" />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0d0a1a] flex items-center justify-center text-[#8b7aaa]">
          Loading...
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
