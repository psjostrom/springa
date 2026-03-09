"use client";

import { useState, useEffect, useRef } from "react";
import type { SMHIWeather } from "@/lib/smhi";
import { fetchForecast, getWeatherForTime } from "@/lib/smhi";
import { recommendClothing, type ClothingRecommendation } from "@/lib/clothingCalculator";

const MAX_DAYS_AHEAD = 3;

interface EligibleEvent {
  id: string;
  date: Date;
  category: string;
}

function getEligibleEvents(
  events: { id: string; date: Date; type: string; category: string }[],
): EligibleEvent[] {
  const now = Date.now();
  return events.filter((e) => {
    if (e.type !== "planned") return false;
    const diff = e.date.getTime() - now;
    return diff >= -12 * 60 * 60 * 1000 && diff <= MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000;
  });
}

/**
 * Fetch SMHI forecast once, then compute clothing recommendations
 * for all planned events within the next 3 days.
 */
export function useWeather(
  events: { id: string; date: Date; type: string; category: string }[],
  warmthPreference = 0,
): Map<string, ClothingRecommendation> {
  const [recs, setRecs] = useState<Map<string, ClothingRecommendation>>(
    () => new Map(),
  );
  const forecastRef = useRef<SMHIWeather[] | null>(null);

  const eligible = getEligibleEvents(events);
  const eligibleKey = eligible.map((e) => `${e.id}:${e.date.getTime()}:${e.category}`).join(",");

  useEffect(() => {
    if (!eligibleKey) {
      setRecs(new Map());
      return;
    }

    let cancelled = false;

    async function run() {
      try {
        forecastRef.current ??= await fetchForecast();
        const forecast = forecastRef.current;
        const map = new Map<string, ClothingRecommendation>();

        for (const event of eligible) {
          const weather = getWeatherForTime(forecast, event.date);
          if (!weather) continue;
          map.set(event.id, recommendClothing(weather, event.category, warmthPreference));
        }

        if (!cancelled) setRecs(map);
      } catch (err) {
        console.error("Failed to fetch weather:", err);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
    // eligibleKey encodes id + date + category for all eligible events
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligibleKey, warmthPreference]);

  return recs;
}
