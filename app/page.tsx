"use client";

import { Suspense, startTransition, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAtomValue, useSetAtom } from "jotai";
import { useModalURL } from "./hooks/useModalURL";
import { useSession } from "next-auth/react";
import { useHydrateStore } from "./hooks/useHydrateStore";
import {
  settingsAtom,
  settingsLoadingAtom,
  updateSettingsAtom,
  switchTabAtom,
  diabetesModeAtom,
} from "./atoms";
import { TabNavigation } from "./components/TabNavigation";
import { PlannerScreen } from "./screens/PlannerScreen";
import { CalendarScreen } from "./screens/CalendarScreen";
import { IntelScreen } from "./screens/IntelScreen";
import { CoachScreen } from "./screens/CoachScreen";
import { SimulateScreen } from "./screens/SimulateScreen";
import { CurrentBGPill } from "./components/CurrentBGPill";
import { BGGraphPopover } from "./components/BGGraphPopover";
import { SettingsModal } from "./components/SettingsModal";
import { UnratedRunBanner } from "./components/UnratedRunBanner";
import { Settings, Sun, Moon } from "lucide-react";

type Tab = "planner" | "calendar" | "intel" | "coach" | "simulate";

const splashFallback = (
  <div className="splash">
    <div className="text-center animate-[gentle-pulse_2.5s_ease-in-out_infinite]">
      <svg className="w-16 h-16 mx-auto" viewBox="0 0 432 474" xmlns="http://www.w3.org/2000/svg">
        <path d="M 357.8,42.9 L 196.9,264.7 A 75,75 0 1,1 106.3,151.8 Z" fill="var(--color-brand)"/>
        <path d="M 72.2,461.1 L 233.1,239.3 A 75,75 0 1,1 323.7,352.2 Z" fill="var(--color-brand)"/>
      </svg>
      <p className="text-2xl font-[family-name:var(--font-sora)] font-extrabold text-brand tracking-tight mt-3">
        springa
      </p>
    </div>
  </div>
);

function HomeContent() {
  const { data: session } = useSession();

  // Hydrate all Jotai atoms from data-fetching hooks
  useHydrateStore();

  const settings = useAtomValue(settingsAtom);
  const settingsLoading = useAtomValue(settingsLoadingAtom);
  const updateSettings = useSetAtom(updateSettingsAtom);
  const switchTab = useAtomValue(switchTabAtom);
  const setSwitchTab = useSetAtom(switchTabAtom);
  const diabetesMode = useAtomValue(diabetesModeAtom);

  const router = useRouter();
  const searchParams = useSearchParams();

  const parseTab = (p: string | null): Tab =>
    p === "planner" ? "planner" : p === "intel" ? "intel" : p === "coach" ? "coach" : p === "simulate" ? "simulate" : "calendar";

  const urlTab = parseTab(searchParams.get("tab"));
  const [activeTab, setActiveTab] = useState(urlTab);
  const autoAdapt = searchParams.get("adapt") === "true";

  // Sync tab from URL on cross-route navigation (e.g. /feedback → /?tab=planner)
  const [prevUrlTab, setPrevUrlTab] = useState(urlTab);
  if (prevUrlTab !== urlTab) {
    setPrevUrlTab(urlTab);
    setActiveTab(urlTab);
  }

  // Strip ?adapt from URL after render
  useEffect(() => {
    if (!autoAdapt) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("adapt");
    const query = params.toString();
    router.replace(query ? `?${query}` : "/", { scroll: false });
  }, [autoAdapt, searchParams, router]);

  // BG graph popover
  const bgGraph = useModalURL("bg");

  const handleTabChange = useCallback((tab: Tab) => {
    startTransition(() => {
      setActiveTab(tab);
      const params = new URLSearchParams(window.location.search);
      params.set("tab", tab);
      router.push(`?${params.toString()}`, { scroll: false });
    });
  }, [router]);

  // Handle cross-component tab switch requests
  useEffect(() => {
    if (switchTab) {
      const tab = parseTab(switchTab);
      handleTabChange(tab);
      setSwitchTab(null);
    }
  }, [switchTab, setSwitchTab, handleTabChange]);

  // Redirect from Simulate tab when diabetes mode is disabled
  useEffect(() => {
    if (!diabetesMode && activeTab === "simulate") {
      handleTabChange("calendar");
    }
  }, [diabetesMode, activeTab, handleTabChange]);

  // Theme toggle
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("springa-theme");
      return stored === "light" ? "light" : "dark";
    }
    return "dark";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("springa-theme", theme);
  }, [theme]);

  // Settings modal
  const [showSettings, setShowSettings] = useState(false);

  // Redirect: not onboarded → /setup
  useEffect(() => {
    if (settingsLoading || !settings) return;
    if (settings.onboardingComplete === false) {
      router.push("/setup");
    }
  }, [settingsLoading, settings, router]);

  if (settingsLoading) return splashFallback;

  const hideTabs: Tab[] = diabetesMode ? [] : ["simulate"];

  return (
    <div className="h-screen bg-bg flex flex-col text-text font-sans overflow-hidden">
      <div className="bg-surface border-b border-border flex-shrink-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 flex items-center justify-between">
          <button
            onClick={() => { handleTabChange("calendar"); }}
            className="flex items-center gap-1.5 text-xl md:text-2xl font-[family-name:var(--font-sora)] font-extrabold text-brand tracking-tight hover:scale-105 active:scale-95 transition-all"
          >
            <svg className="w-6 h-6 md:w-7 md:h-7 translate-y-[1.5px]" viewBox="0 0 432 474" xmlns="http://www.w3.org/2000/svg">
              <path d="M 357.8,42.9 L 196.9,264.7 A 75,75 0 1,1 106.3,151.8 Z" fill="currentColor"/>
              <path d="M 72.2,461.1 L 233.1,239.3 A 75,75 0 1,1 323.7,352.2 Z" fill="currentColor"/>
            </svg>
            springa
          </button>
          <TabNavigation activeTab={activeTab} onTabChange={handleTabChange} hideTabs={hideTabs} />
          <div className="flex items-center gap-2">
            <CurrentBGPill onClick={bgGraph.open} />
            <button
              onClick={() => { setTheme(theme === "dark" ? "light" : "dark"); }}
              className="p-2 rounded-lg text-muted hover:text-brand hover:bg-border transition"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button
              onClick={() => { setShowSettings(true); }}
              className="p-2 rounded-lg text-muted hover:text-brand hover:bg-border transition"
              title="Settings"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className={activeTab === "planner" ? "h-full" : "hidden"}>
          <PlannerScreen autoAdapt={autoAdapt} />
        </div>
        <div className={activeTab === "calendar" ? "h-full" : "hidden"}>
          <CalendarScreen />
        </div>
        <div className={activeTab === "intel" ? "h-full" : "hidden"}>
          <IntelScreen />
        </div>
        <div className={activeTab === "coach" ? "h-full" : "hidden"}>
          <CoachScreen />
        </div>
        {diabetesMode && (
          <div className={activeTab === "simulate" ? "h-full" : "hidden"}>
            <SimulateScreen />
          </div>
        )}
      </div>

      <UnratedRunBanner />

      {/* Spacer to prevent bottom tab bar overlap on mobile */}
      <div className="h-12 md:hidden flex-shrink-0" />

      {bgGraph.value != null && (
        <BGGraphPopover onClose={bgGraph.close} />
      )}

      {showSettings && settings && (
        <SettingsModal
          email={session?.user?.email ?? ""}
          settings={settings}
          onSave={updateSettings}
          onClose={() => { setShowSettings(false); }}
        />
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={splashFallback}
    >
      <HomeContent />
    </Suspense>
  );
}
