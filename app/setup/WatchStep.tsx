"use client";

import { useState, useEffect } from "react";
import { ExternalLink, RefreshCw, Check, AlertTriangle } from "lucide-react";
import type { PlatformConnection } from "@/lib/intervalsApi";

type WatchType = "garmin" | "polar" | "suunto" | "coros" | "wahoo" | "amazfit" | "apple" | "wearos" | "none" | null;

interface WatchStepProps {
  onNext: () => void;
  onBack: () => void;
}

const DIRECT_WATCHES: { key: WatchType; label: string }[] = [
  { key: "garmin", label: "Garmin" },
  { key: "polar", label: "Polar" },
  { key: "suunto", label: "Suunto" },
  { key: "coros", label: "Coros" },
  { key: "wahoo", label: "Wahoo" },
  { key: "amazfit", label: "Amazfit" },
];

const PLATFORM_NAMES: Record<string, string> = {
  garmin: "Garmin",
  polar: "Polar",
  suunto: "Suunto",
  coros: "Coros",
  wahoo: "Wahoo",
  amazfit: "Amazfit",
  strava: "Strava",
  huawei: "Huawei",
};

export function WatchStep({ onNext, onBack }: WatchStepProps) {
  const [platforms, setPlatforms] = useState<PlatformConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [selectedWatch, setSelectedWatch] = useState<WatchType>(null);

  const fetchConnections = async (initialLoad = false) => {
    try {
      const res = await fetch("/api/intervals/connections");
      if (!res.ok) {
        setFetchError(true);
        return;
      }
      const data = (await res.json()) as { platforms: PlatformConnection[] };
      setPlatforms(data.platforms);
      setFetchError(false);
    } catch {
      setFetchError(true);
    } finally {
      if (initialLoad) setLoading(false);
    }
  };

  useEffect(() => {
    void fetchConnections(true);
  }, []);

  const handleCheckAgain = async () => {
    setChecking(true);
    await fetchConnections();
    setChecking(false);
  };

  const syncing = platforms.filter((p) => p.syncActivities);
  const directSyncing = syncing.filter((p) => p.platform !== "strava");
  const stravaOnly = syncing.length > 0 && directSyncing.length === 0;
  const linkedButNotSyncing = platforms.filter((p) => p.linked && !p.syncActivities);
  const hasUploadWorkouts = platforms.some((p) => p.syncActivities && p.uploadWorkouts);
  const isConnected = directSyncing.length > 0;

  if (loading) {
    return (
      <div className="bg-surface rounded-xl border border-border p-6 shadow-lg">
        <div className="flex items-center justify-center py-12">
          <div className="inline-block w-6 h-6 border-2 border-brand/20 border-t-brand rounded-full animate-spin" />
          <span className="ml-3 text-muted text-sm">Checking watch connection...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-6 shadow-lg">
      <h2 className="text-2xl font-bold text-text mb-2">Connect Your Watch</h2>

      {/* State 1: Direct watch connected */}
      {isConnected && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-success/10 border border-success/20 rounded-lg p-4">
            <Check className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-text font-medium">
                Your {directSyncing.map((p) => PLATFORM_NAMES[p.platform]).join(" & ")} is connected and syncing activities.
              </p>
              <p className="text-xs text-muted mt-1">
                {hasUploadWorkouts
                  ? "Planned workouts will sync to your watch automatically."
                  : "Your runs will sync to Springa. To get planned workouts on your watch, enable \"Upload planned workouts\" in Intervals.icu settings."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* State: Strava-only warning */}
      {stravaOnly && !isConnected && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-warning/10 border border-warning/20 rounded-lg p-4">
            <AlertTriangle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-text font-medium">
                Strava is connected, but has API restrictions that limit data quality.
              </p>
              <p className="text-xs text-muted mt-1">
                For the best experience, connect your watch directly to Intervals.icu instead.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* State: Connected but sync disabled */}
      {!isConnected && !stravaOnly && linkedButNotSyncing.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-warning/10 border border-warning/20 rounded-lg p-4">
            <AlertTriangle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-text font-medium">
                Your {linkedButNotSyncing.map((p) => PLATFORM_NAMES[p.platform]).join(" & ")} is connected but activity sync is turned off.
              </p>
              <p className="text-xs text-muted mt-1">
                Enable it in <a href="https://intervals.icu/settings" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">Intervals.icu → Settings → Connections</a>.
              </p>
            </div>
          </div>
          <button
            onClick={() => { void handleCheckAgain(); }}
            disabled={checking}
            className="flex items-center gap-2 text-sm text-brand hover:underline disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${checking ? "animate-spin" : ""}`} />
            {checking ? "Checking..." : "Check again"}
          </button>
        </div>
      )}

      {/* State 2: No connection — show watch selector */}
      {!isConnected && linkedButNotSyncing.length === 0 && !stravaOnly && (
        <div className="space-y-4">
          {fetchError && (
            <div className="flex items-start gap-3 bg-warning/10 border border-warning/20 rounded-lg p-4">
              <AlertTriangle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
              <p className="text-sm text-muted">
                Couldn&apos;t check your connections. Select your watch below and use &quot;Check again&quot; to retry.
              </p>
            </div>
          )}
          <p className="text-muted text-sm">
            Springa needs your watch connected to Intervals.icu to read your runs.
          </p>

          {selectedWatch === "none" ? (
            /* State 3: No watch */
            <div className="bg-error/10 border border-error/20 rounded-lg p-4">
              <p className="text-sm text-text font-medium mb-2">A running watch is required</p>
              <p className="text-xs text-muted">
                Springa needs run data from a GPS watch with a heart rate sensor to work. It generates structured workouts with HR zone targets and analyzes your compliance — that requires a watch on your wrist.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-text">What watch do you use?</p>
              <div className="flex flex-wrap gap-2">
                {DIRECT_WATCHES.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => { setSelectedWatch(key); }}
                    className={`px-3 py-1.5 rounded-lg border text-sm transition ${
                      selectedWatch === key
                        ? "border-brand bg-brand/10 text-brand font-medium"
                        : "border-border text-muted hover:border-brand hover:text-brand"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <button
                  onClick={() => { setSelectedWatch("apple"); }}
                  className={`px-3 py-1.5 rounded-lg border text-sm transition ${
                    selectedWatch === "apple"
                      ? "border-brand bg-brand/10 text-brand font-medium"
                      : "border-border text-muted hover:border-brand hover:text-brand"
                  }`}
                >
                  Apple Watch
                </button>
                <button
                  onClick={() => { setSelectedWatch("wearos"); }}
                  className={`px-3 py-1.5 rounded-lg border text-sm transition ${
                    selectedWatch === "wearos"
                      ? "border-brand bg-brand/10 text-brand font-medium"
                      : "border-border text-muted hover:border-brand hover:text-brand"
                  }`}
                >
                  Wear OS / Samsung
                </button>
              </div>

              {/* Platform-specific instructions */}
              {selectedWatch && DIRECT_WATCHES.some((w) => w.key === selectedWatch) && (
                <div className="bg-surface-alt border border-border rounded-lg p-4 space-y-3">
                  <p className="text-sm text-muted">
                    Go to <strong className="text-text">Intervals.icu → Settings → Connections</strong> and connect your {PLATFORM_NAMES[selectedWatch] ?? selectedWatch}. Come back here when it&apos;s done.
                  </p>
                  <a href="https://intervals.icu/settings" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-brand hover:underline">
                    <ExternalLink size={14} />
                    Open Intervals.icu Settings
                  </a>
                </div>
              )}

              {selectedWatch === "apple" && (
                <div className="bg-surface-alt border border-border rounded-lg p-4 space-y-3">
                  <p className="text-sm text-muted">
                    Install <strong className="text-text">HealthFit</strong> ($7, one-time) on your iPhone. It auto-syncs Apple Watch runs to Intervals.icu in the background.
                  </p>
                  <a href="https://apps.apple.com/app/healthfit/id1202650514" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-brand hover:underline">
                    <ExternalLink size={14} />
                    HealthFit on App Store
                  </a>
                </div>
              )}

              {selectedWatch === "wearos" && (
                <div className="bg-surface-alt border border-border rounded-lg p-4 space-y-3">
                  <p className="text-sm text-muted">
                    Install <strong className="text-text">Health Sync</strong> (~$3, one-time) on your phone. It auto-syncs your watch runs to Intervals.icu in the background.
                  </p>
                  <a href="https://play.google.com/store/apps/details?id=nl.appyhapps.healthsync" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-brand hover:underline">
                    <ExternalLink size={14} />
                    Health Sync on Google Play
                  </a>
                </div>
              )}

              {selectedWatch && (
                <button
                  onClick={() => { void handleCheckAgain(); }}
                  disabled={checking}
                  className="flex items-center gap-2 text-sm text-brand hover:underline disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${checking ? "animate-spin" : ""}`} />
                  {checking ? "Checking..." : "Check again"}
                </button>
              )}

              <button
                onClick={() => { setSelectedWatch("none"); }}
                className="text-xs text-muted hover:text-text transition"
              >
                I don&apos;t have a running watch
              </button>
            </>
          )}
        </div>
      )}

      {/* Strava "continue anyway" */}
      {stravaOnly && !isConnected && (
        <button
          onClick={onNext}
          className="text-xs text-muted hover:text-text transition mt-2"
        >
          Continue with Strava anyway →
        </button>
      )}

      {/* Navigation */}
      <div className="flex gap-3 mt-6">
        <button
          onClick={onBack}
          className="px-6 py-3 border border-border rounded-lg text-muted hover:text-text hover:bg-border transition"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!isConnected}
          className="flex-1 py-3 bg-brand text-white rounded-lg font-bold hover:bg-brand-hover transition shadow-lg shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
