"use client";

import type { WidgetProps } from "@/lib/modalWidgets";

interface StatCard {
  label: string;
  value: string;
  unit: string;
  tip?: string;
}

function StatCardCell({ card }: { card: StatCard }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[#b8a5d4] text-xs">{card.label}</div>
      <div className="text-white text-sm font-semibold">
        {card.value} <span className="text-[#8b7ba8] font-normal">{card.unit}</span>
      </div>
    </div>
  );
}

/** Secondary stats as cards — matches Report Card design language. */
export function StatsWidget({ event }: WidgetProps) {
  const cards: StatCard[] = [];
  if (event.calories) cards.push({ label: "Calories", value: String(event.calories), unit: "kcal" });
  if (event.cadence) cards.push({ label: "Cadence", value: String(Math.round(event.cadence)), unit: "spm" });
  if (event.maxHr) cards.push({ label: "Max HR", value: String(event.maxHr), unit: "bpm" });
  if (event.load) cards.push({ label: "Load", value: String(Math.round(event.load)), unit: "" });
  if (event.intensity !== undefined) cards.push({ label: "Intensity", value: `${Math.round(event.intensity)}%`, unit: "" });
  if (cards.length === 0) return null;

  return (
    <div className="p-2">
      <div
        className="bg-[#2a1f3d] rounded-lg px-3 py-2.5 grid gap-2 text-sm"
        style={{ gridTemplateColumns: `repeat(${Math.min(cards.length, 3)}, 1fr)` }}
      >
        {cards.map((card) => (
          <StatCardCell key={card.label} card={card} />
        ))}
      </div>
    </div>
  );
}
