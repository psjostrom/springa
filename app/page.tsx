"use client";

import { Suspense, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useSession, signOut } from "next-auth/react";
import { TabNavigation } from "./components/TabNavigation";
import { ApiKeySetup } from "./components/ApiKeySetup";
import { PlannerScreen } from "./screens/PlannerScreen";
import { CalendarScreen } from "./screens/CalendarScreen";
import { IntelScreen } from "./screens/IntelScreen";
import { usePhaseInfo } from "./hooks/usePhaseInfo";
import { useBGModel } from "./hooks/useBGModel";

type Tab = "planner" | "calendar" | "intel";

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

  const subscribe = useCallback(() => () => {}, []);
  const getSnapshot = useCallback(() => localStorage.getItem("intervals_api_key") ?? "", []);
  const getServerSnapshot = useCallback(() => null as string | null, []);
  const storedKey = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [localKey, setLocalKey] = useState("");

  const parseTab = (search: string): Tab => {
    const p = new URLSearchParams(search).get("tab");
    return p === "planner" ? "planner" : p === "intel" ? "intel" : "calendar";
  };

  const [activeTab, setActiveTab] = useState<Tab>(() =>
    typeof window !== "undefined" ? parseTab(window.location.search) : "calendar"
  );

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tab);
    window.history.pushState(null, "", `?${params.toString()}`);
  }, []);

  useEffect(() => {
    const onPopState = () => setActiveTab(parseTab(window.location.search));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Handle API key submission
  const handleApiKeySubmit = (key: string) => {
    setLocalKey(key);
    localStorage.setItem("intervals_api_key", key);
  };

  const apiKey = storedKey ?? localKey;

  // BG model — fetches once, cached after
  const { bgModel, bgModelLoading, bgModelProgress, bgActivityNames } = useBGModel(apiKey, true);

  // Phase info for progress screen
  const phaseInfo = usePhaseInfo("2026-06-13", 18);

  if (storedKey === null) return splashFallback;

  if (!apiKey) {
    return <ApiKeySetup onSubmit={handleApiKeySubmit} />;
  }

  return (
    <div className="h-screen bg-[#0d0a1a] flex flex-col text-white font-sans overflow-hidden">
      <div className="bg-[#1e1535] border-b border-[#3d2b5a] flex-shrink-0 z-30 shadow-[0_2px_12px_rgba(255,45,149,0.15)]">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 flex items-center justify-between">
          <h1 className="text-xl md:text-2xl font-bold bg-[linear-gradient(135deg,#00ffff,#d946ef,#ff2d95)] bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(0,255,255,0.4)]">
            Springa
          </h1>
          <TabNavigation activeTab={activeTab} onTabChange={handleTabChange} />
          <div className="flex items-center gap-3 text-sm text-[#b8a5d4]">
            <span className="hidden sm:inline">{session?.user?.email}</span>
            <button
              onClick={() => signOut()}
              className="text-[#b8a5d4] hover:text-[#c4b5fd] transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className={activeTab === "planner" ? "h-full" : "hidden"}>
          <PlannerScreen apiKey={apiKey} bgModel={bgModel} />
        </div>
        <div className={activeTab === "calendar" ? "h-full" : "hidden"}>
          <CalendarScreen apiKey={apiKey} />
        </div>
        <div className={activeTab === "intel" ? "h-full" : "hidden"}>
          <IntelScreen
            apiKey={apiKey}
            phaseName={phaseInfo.name}
            currentWeek={phaseInfo.week}
            totalWeeks={18}
            progress={phaseInfo.progress}
            bgModel={bgModel}
            bgModelLoading={bgModelLoading}
            bgModelProgress={bgModelProgress}
            bgActivityNames={bgActivityNames}
          />
        </div>
      </div>

      {/* Spacer to prevent bottom tab bar overlap on mobile */}
      <div className="h-16 md:hidden flex-shrink-0" />
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
