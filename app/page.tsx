"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useModalURL } from "./hooks/useModalURL";
import { usePaceTable } from "./hooks/usePaceTable";
import { useEnrichedEvents } from "./hooks/useEnrichedEvents";
import { useSession } from "next-auth/react";
import { TabNavigation } from "./components/TabNavigation";
import { ApiKeySetup } from "./components/ApiKeySetup";
import { PlannerScreen } from "./screens/PlannerScreen";
import { CalendarScreen } from "./screens/CalendarScreen";
import { IntelScreen } from "./screens/IntelScreen";
import { CoachScreen } from "./screens/CoachScreen";
import { usePhaseInfo } from "./hooks/usePhaseInfo";
import { useBGModel } from "./hooks/useBGModel";
import { useCurrentBG } from "./hooks/useCurrentBG";
import { useSharedCalendarData } from "./hooks/useSharedCalendarData";
import { CurrentBGPill } from "./components/CurrentBGPill";
import { BGGraphPopover } from "./components/BGGraphPopover";
import { SettingsModal } from "./components/SettingsModal";
import { Settings } from "lucide-react";
import type { UserSettings } from "@/lib/settings";
import { resolveLayout, type WidgetLayout } from "@/lib/widgetRegistry";

type Tab = "planner" | "calendar" | "intel" | "coach";

const S_PATH =
  "M3736 9887 c-44 -62 -230 -326 -414 -587 -482 -682 -724 -1026 -1015 -1438 l-257 -364 0 -920 c0 -910 0 -920 20 -936 66 -55 878 -808 877 -814 -2 -6 -179 -173 -729 -687 l-167 -156 -1 -742 0 -742 412 -583 c226 -321 464 -657 528 -748 64 -91 269 -381 455 -645 186 -264 346 -490 355 -502 17 -21 21 -16 251 310 128 183 281 400 340 482 58 83 350 495 648 917 l541 767 0 879 0 879 -395 368 c-217 202 -395 371 -395 375 0 4 177 173 394 376 l395 369 0 878 1 878 -541 767 c-298 422 -594 841 -659 932 -64 91 -148 210 -187 265 -114 163 -365 519 -372 527 -3 4 -42 -44 -85 -105z m142 -234 c34 -49 397 -563 807 -1143 l744 -1055 0 -825 0 -825 -325 -305 c-179 -168 -349 -326 -377 -351 l-52 -46 -375 350 -375 350 -5 823 c-5 790 -6 823 -24 843 -26 29 -86 29 -112 0 -18 -20 -19 -51 -22 -868 l-2 -846 462 -430 c254 -236 541 -504 637 -595 97 -91 265 -248 374 -349 l197 -184 0 -826 -1 -826 -805 -1140 c-442 -627 -806 -1140 -808 -1140 -2 0 -201 279 -442 620 -240 341 -478 679 -529 750 -50 72 -200 283 -331 470 -132 187 -257 363 -277 391 l-37 51 0 689 0 689 427 400 c234 220 430 400 435 400 8 0 95 -78 453 -405 99 -91 206 -188 238 -217 l57 -52 3 -824 c2 -889 0 -847 54 -868 28 -10 80 7 93 31 6 12 10 333 10 868 l0 850 -37 33 c-21 18 -182 164 -358 324 -176 160 -504 460 -730 665 -225 206 -463 423 -527 483 l-118 109 0 865 0 865 37 52 c20 28 143 202 273 386 130 184 252 358 272 385 141 199 922 1306 992 1408 22 31 40 57 41 57 0 0 29 -39 63 -87z";

const S_TRANSFORM = "translate(91,36) scale(0.44) translate(0,1000) scale(0.1,-0.1)";

const splashFallback = (
  <div className="splash">
    <div className="splash-glow" />
    <svg className="splash-logo" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sp-neon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00ffff" />
          <stop offset="40%" stopColor="#ff2d95" />
          <stop offset="100%" stopColor="#ff2d95" />
        </linearGradient>
        <linearGradient id="sp-gc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00ffff" />
          <stop offset="50%" stopColor="#d946ef" />
          <stop offset="100%" stopColor="#ff2d95" />
        </linearGradient>
        <filter id="sp-gb" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="30" />
        </filter>
        <filter id="sp-gm" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <path id="sp-s" d={S_PATH} />
      </defs>
      <g transform={S_TRANSFORM} fill="url(#sp-gc)" filter="url(#sp-gb)" opacity="0.5">
        <use href="#sp-s" />
      </g>
      <g transform={S_TRANSFORM} fill="url(#sp-gc)" filter="url(#sp-gm)" opacity="0.7">
        <use href="#sp-s" />
      </g>
      <g transform={S_TRANSFORM} fill="url(#sp-neon)">
        <use href="#sp-s" />
      </g>
    </svg>
    <div className="splash-floor">
      <div className="splash-grid" />
    </div>
  </div>
);

function HomeContent() {
  const { data: session } = useSession();

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: UserSettings) => { setSettings(data); })
      .catch(() => { setSettings({}); })
      .finally(() => { setSettingsLoading(false); });
  }, []);

  const parseTab = (search: string): Tab => {
    const p = new URLSearchParams(search).get("tab");
    return p === "planner" ? "planner" : p === "intel" ? "intel" : p === "coach" ? "coach" : "calendar";
  };

  const [activeTab, setActiveTab] = useState<Tab>(() =>
    typeof window !== "undefined" ? parseTab(window.location.search) : "calendar"
  );

  // Auto-adapt: read ?adapt=true on mount (cross-route nav from /feedback remounts HomeContent)
  const [autoAdapt] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("adapt") === "true"
  );

  useEffect(() => {
    if (!autoAdapt) return;
    const params = new URLSearchParams(window.location.search);
    params.delete("adapt");
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // BG graph popover
  const bgGraph = useModalURL("bg");

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tab);
    window.history.pushState(null, "", `?${params.toString()}`);
  }, []);

  useEffect(() => {
    const onPopState = () => { setActiveTab(parseTab(window.location.search)); };
    window.addEventListener("popstate", onPopState);
    return () => { window.removeEventListener("popstate", onPopState); };
  }, []);

  const saveSettings = useCallback(
    async (keys: { intervalsApiKey: string; googleAiApiKey?: string }) => {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(keys),
      });
      setSettings((prev) => ({ ...prev, ...keys }));
    },
    [],
  );

  const apiKey = settings?.intervalsApiKey ?? "";

  // Shared calendar events — single fetch for all screens
  const sharedCalendar = useSharedCalendarData(apiKey);

  // Live BG from xDrip
  const { currentBG, trend, trendSlope, lastUpdate, readings } = useCurrentBG();

  // BG model — uses shared events, fetches streams independently
  const { bgModel, bgModelLoading, bgModelProgress, bgActivityNames, runBGContexts, cachedActivities } = useBGModel(apiKey, true, sharedCalendar.events, readings);

  // Calibrated pace table from cached stream data
  const paceTable = usePaceTable(cachedActivities, settings?.lthr);

  // Enrich calendar events with cached stream data so graphs render on mount
  const enrichedEvents = useEnrichedEvents(sharedCalendar.events, cachedActivities);

  // Phase info for progress screen
  const raceDate = settings?.raceDate ?? "2026-06-13";
  const totalWeeks = settings?.totalWeeks ?? 18;
  const phaseInfo = usePhaseInfo(raceDate, totalWeeks);

  // Widget layout — derived from settings, debounced save
  const widgetLayout = useMemo(
    () => resolveLayout({ widgetOrder: settings?.widgetOrder, hiddenWidgets: settings?.hiddenWidgets }),
    [settings?.widgetOrder, settings?.hiddenWidgets],
  );

  const widgetSaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleWidgetLayoutChange = useCallback(
    (layout: WidgetLayout) => {
      // Optimistic local update
      setSettings((prev) => ({
        ...prev,
        widgetOrder: layout.widgetOrder,
        hiddenWidgets: layout.hiddenWidgets,
      }));
      // Debounced persist
      if (widgetSaveTimer.current) clearTimeout(widgetSaveTimer.current);
      widgetSaveTimer.current = setTimeout(() => {
        void fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            widgetOrder: layout.widgetOrder,
            hiddenWidgets: layout.hiddenWidgets,
          }),
        });
      }, 800);
    },
    [],
  );

  const openBGGraph = bgGraph.open;
  const closeBGGraph = bgGraph.close;

  // Settings modal
  const [showSettings, setShowSettings] = useState(false);

  const updateSettings = useCallback(
    async (partial: Partial<UserSettings>) => {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      setSettings((prev) => ({ ...prev, ...partial }));
    },
    [],
  );

  if (settingsLoading) return splashFallback;

  if (!apiKey) {
    return <ApiKeySetup onSubmit={(keys) => { void saveSettings(keys); }} />;
  }

  return (
    <div className="h-screen bg-[#0d0a1a] flex flex-col text-white font-sans overflow-hidden">
      <div className="bg-[#1e1535] border-b border-[#3d2b5a] flex-shrink-0 z-30 shadow-[0_2px_12px_rgba(255,45,149,0.15)]">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 flex items-center justify-between">
          <button
            onClick={() => { handleTabChange("calendar"); }}
            className="text-xl md:text-2xl font-bold bg-[linear-gradient(135deg,#00ffff,#d946ef,#ff2d95)] bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(0,255,255,0.4)] hover:drop-shadow-[0_0_16px_rgba(0,255,255,0.8)] hover:scale-105 active:scale-95 transition-all"
          >
            Springa
          </button>
          <TabNavigation activeTab={activeTab} onTabChange={handleTabChange} />
          <div className="flex items-center gap-2">
            <CurrentBGPill currentBG={currentBG} trend={trend} lastUpdate={lastUpdate} onClick={openBGGraph} />
            <button
              onClick={() => { setShowSettings(true); }}
              className="p-2 rounded-lg text-[#b8a5d4] hover:text-[#00ffff] hover:bg-[#2a1f3d] transition"
              title="Settings"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className={activeTab === "planner" ? "h-full" : "hidden"}>
          <PlannerScreen
            apiKey={apiKey}
            bgModel={bgModel}
            raceDate={raceDate}
            raceName={settings?.raceName}
            raceDist={settings?.raceDist}
            prefix={settings?.prefix}
            totalWeeks={totalWeeks}
            startKm={settings?.startKm}
            lthr={settings?.lthr}
            events={enrichedEvents}
            runBGContexts={runBGContexts}
            autoAdapt={autoAdapt}
            onSyncDone={() => { void sharedCalendar.reload(); }}
          />
        </div>
        <div className={activeTab === "calendar" ? "h-full" : "hidden"}>
          <CalendarScreen apiKey={apiKey} initialEvents={enrichedEvents} isLoadingInitial={sharedCalendar.isLoading} initialError={sharedCalendar.error} onRetryLoad={() => { void sharedCalendar.reload(); }} runBGContexts={runBGContexts} paceTable={paceTable} bgModel={bgModel} />
        </div>
        <div className={activeTab === "intel" ? "h-full" : "hidden"}>
          <IntelScreen
            apiKey={apiKey}
            events={enrichedEvents}
            eventsLoading={sharedCalendar.isLoading}
            eventsError={sharedCalendar.error}
            onRetryLoad={() => { void sharedCalendar.reload(); }}
            phaseName={phaseInfo.name}
            currentWeek={phaseInfo.week}
            totalWeeks={totalWeeks}
            progress={phaseInfo.progress}
            raceDate={raceDate}
            raceDist={settings?.raceDist}
            prefix={settings?.prefix}
            startKm={settings?.startKm}
            lthr={settings?.lthr}
            bgModel={bgModel}
            bgModelLoading={bgModelLoading}
            bgModelProgress={bgModelProgress}
            bgActivityNames={bgActivityNames}
            cachedActivities={cachedActivities}
            runBGContexts={runBGContexts}
            widgetLayout={widgetLayout}
            onWidgetLayoutChange={handleWidgetLayoutChange}
          />
        </div>
        <div className={activeTab === "coach" ? "h-full" : "hidden"}>
          <CoachScreen events={enrichedEvents} phaseInfo={phaseInfo} bgModel={bgModel} raceDate={raceDate} lthr={settings?.lthr} maxHr={settings?.maxHr} hrZones={settings?.hrZones} paceTable={paceTable} currentBG={currentBG} trendSlope={trendSlope} trendArrow={trend} lastUpdate={lastUpdate} readings={readings} runBGContexts={runBGContexts} />
        </div>
      </div>

      {/* Spacer to prevent bottom tab bar overlap on mobile */}
      <div className="h-12 md:hidden flex-shrink-0" />

      {bgGraph.value != null && readings.length > 0 && (
        <BGGraphPopover
          readings={readings}
          trend={trend}
          onClose={closeBGGraph}
        />
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
